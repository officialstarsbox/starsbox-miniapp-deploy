/* ========= REF (session-only, unified) ========= */
(function () {
  if (typeof window.getRefCode === 'function') return;

  const KEY = 'sb_in_ref';
  const RE  = /^[A-Z0-9]{3,32}$/;

  function save(code){ try{ if(RE.test(code)) sessionStorage.setItem(KEY, code); }catch{} }
  function load(){ try{ const v=sessionStorage.getItem(KEY); return RE.test(v||'')?v:null; }catch{ return null; } }

  function parseInbound(){
    const tg = window.Telegram?.WebApp;
    let raw =
      tg?.initDataUnsafe?.start_param ??
      new URL(location.href).searchParams.get('startapp') ??
      new URL(location.href).searchParams.get('start') ??
      new URL(location.href).searchParams.get('ref') ??
      null;
    if(!raw) return null;
    raw = String(raw).trim();
    const m = raw.match(/^ref[:=_-]+([A-Za-z0-9]{3,32})$/i);
    let code = m ? m[1] : (/^[A-Za-z0-9]{3,32}$/.test(raw) ? raw : null);
    return code ? code.toUpperCase() : null;
  }

  const inbound = parseInbound();
  if (inbound) save(inbound);
  window.getRefCode = () => load();
})();

/* ===== базовые константы ===== */
const API_BASE = 'https://api.starsbox.org';

/* =========================================
   Основная логика страницы пополнения Steam
   ========================================= */
(function(){
  // ---------------------- helpers ----------------------
  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
  const $  = (s, r) => (r||document).querySelector(s);
  const $$ = (s, r) => Array.from((r||document).querySelectorAll(s));

  // ✅ Telegram helpers + открытие ссылок внутри мини-аппа
  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  function openLink(url){
    if (!url) return;
    if (typeof window.openInsideTelegram === 'function') { try { window.openInsideTelegram(url); return; } catch(e){} }
    if (tg && typeof tg.openLink === 'function')          { try { tg.openLink(url); return; } catch(e){} }
    window.location.href = url;
  }

  // ---------------------- overlays ----------------------
  function showInfoOverlay(title, html){
    const root = $('#overlay-root') || document.body;
    root.innerHTML = `
      <div class="info-overlay" id="infoOv" role="dialog" aria-modal="true" aria-labelledby="infoTitle">
        <div class="info-modal" role="document">
          <h2 id="infoTitle" class="info-title">${title}</h2>
          <div class="info-text">${html}</div>
        </div>
      </div>`;
    const ov = $('#infoOv');
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); }, { once: true });
    document.addEventListener('keydown', function onEsc(ev){
      if (ev.key === 'Escape'){ ov.remove(); document.removeEventListener('keydown', onEsc); }
    });
  }

  // ---------------------- main ----------------------
  ready(function(){
    // Region toggle
    const regionGroup = $('#regionGroup');
    regionGroup?.addEventListener('click', (e) => {
      const btn = e.target.closest('.region-btn'); if (!btn) return;
      $$('.region-btn', regionGroup).forEach(b => {
        b.classList.remove('is-active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-pressed', 'true');
      updateCurrency();
      updatePayUI();
    });

    // Help overlay
    const helpOverlay = $('#loginHelp');
    $('#openLoginHelp')?.addEventListener('click', () => helpOverlay?.removeAttribute('hidden'));
    helpOverlay?.addEventListener('click', (e) => { if (e.target === helpOverlay) helpOverlay.setAttribute('hidden', 'hidden'); });

    // Inputs sanitation
    const loginInput = $('#steamLogin');
    loginInput?.addEventListener('input', () => {
      const notAsciiPrintable = /[^\x20-\x7E]/g;
      const v = loginInput.value, cleaned = v.replace(notAsciiPrintable, '');
      if (v !== cleaned) loginInput.value = cleaned;
    });

    // Amount & payment UI
    const nfRu       = new Intl.NumberFormat('ru-RU');
    const amountInput= $('#topupAmount');
    const payBtn     = $('#payBtn');
    const creditIcon = $('#creditIcon');
    const creditValue= $('#creditValue');
    const creditUnit = $('#creditUnit');
    const LIMITS     = { min: 100, max: 45000 };
    window.SB_FEE_PERCENT = (typeof window.SB_FEE_PERCENT === 'number') ? window.SB_FEE_PERCENT : 9;

    function activeRegion(){
      const btn = $('.region-btn.is-active', regionGroup);
      return btn ? btn.getAttribute('data-region') : 'ru'; // ru | kz | cis
    }
    function updateCurrency(){
      const reg = activeRegion();
      // placeholder под выбранный регион (текст одинаковый сейчас)
      amountInput.placeholder = 'от 100 до 45 000 руб';
    }
    function digitsOnly(s){ return (s||'').replace(/\D+/g, ''); }
    function clamp(n){
      if (isNaN(n)) return NaN;
      if (n < LIMITS.min) return LIMITS.min;
      if (n > LIMITS.max) return LIMITS.max;
      return n;
    }
    function updatePayUI(){
      if (!amountInput) return;

      const raw = digitsOnly(amountInput.value);
      if (raw !== amountInput.value) amountInput.value = raw;

      const amount = raw ? parseInt(raw, 10) : NaN;

      if (!amount || isNaN(amount) || amount < LIMITS.min || amount > LIMITS.max){
        payBtn.textContent = 'Оплатить';
        payBtn.disabled = true;
        return;
      }

      // сумма к оплате с комиссией
      const pct   = Number(window.SB_FEE_PERCENT || 9.0);
      const total = Math.round(amount * (1 + pct/100));
      payBtn.textContent = `Оплатить ${nfRu.format(total)} ₽`;
      payBtn.disabled = false;
    }

    amountInput?.addEventListener('input', updatePayUI);
    amountInput?.addEventListener('blur', () => {
      const n = parseInt(digitsOnly(amountInput.value) || '0', 10);
      if (!n) return updatePayUI();
      const clamped = clamp(n);
      if (clamped !== n) amountInput.value = String(clamped);
      updatePayUI();
    });

    // первичная инициализация
    updateCurrency();
    updatePayUI();

    // ✅ адреса возврата в мини-апп после оплаты
    const THANKS_SUCCESS = window.PAY_SUCCESS_URL;
    const THANKS_FAIL    = window.PAY_FAIL_URL;

    // --- Steam через ЕДИНЫЙ бэковый /pay/initiate ---
    async function createSteamOrder() {
      const account = (loginInput?.value || '').trim();
      if (!account) {
        showInfoOverlay('Ошибка', 'Укажите логин Steam.');
        return;
      }

      // сумма, введённая пользователем в РУБЛЯХ (net)
      const raw = digitsOnly(amountInput?.value || '');
      const netRub = raw ? parseInt(raw, 10) : NaN;
      if (!netRub || isNaN(netRub) || netRub < LIMITS.min || netRub > LIMITS.max) {
        showInfoOverlay('Ошибка', `Сумма должна быть от ${LIMITS.min} до ${LIMITS.max} ₽.`);
        return;
      }

      // gross (что спишем с клиента) = net + комиссия
      const pct     = Number(window.SB_FEE_PERCENT || 9);
      const gross   = Math.round(netRub * (1 + pct/100)); // ₽
      const amountMinor = gross * 100;                     // копейки

      // кто платит — для write-once привязки
      let actorId = null;
      try { actorId = tg?.initDataUnsafe?.user?.id || null; } catch {}

      // провайдер: оставим по умолчанию Wata (поддержка Heleket — по кнопке/флагу, если появится)
      const provider = 'wata';

      // единый контракт /pay/initiate
      const payload = {
        provider,                 // "wata" | "heleket"
        product: 'steam',         // единый product
        steam_login: account,     // prefer steam_login (бэк поддерживает и username)
        amount_minor: amountMinor,
        currency: 'RUB',

        // рефералка + плательщик
        ref_code: (window.getRefCode && window.getRefCode()) || undefined,
        actor_tg_id: actorId || undefined,

        // возврат в мини-апп
        success_url: THANKS_SUCCESS,
        fail_url:    THANKS_FAIL
      };

      try {
        payBtn.disabled = true;
        payBtn.textContent = 'Открываем страницу оплаты…';

        const res = await fetch(`${API_BASE}/pay/initiate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.detail || JSON.stringify(data));
        if (!data?.ok || !data?.payment_url) throw new Error('Некорректный ответ сервера');

        openLink(data.payment_url);
      } catch (err) {
        console.error('steam pay error:', err);
        showInfoOverlay('Не удалось создать оплату', `Попробуйте ещё раз.<br><small>${String(err.message || err)}</small>`);
        payBtn.disabled = false;
        updatePayUI();
      }
    }

    // подвесить обработчик на кнопку оплаты
    payBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      if (payBtn.disabled) return;
      createSteamOrder();
    });

    // Info overlays (по кликам внутри steam-info)
    const INFO = {
      new: {
        title: 'Как пополнить новый аккаунт Steam?',
        html: `
          <p>• Войдите в свой аккаунт Steam на сайте или в приложении на смартфоне<br>- Не меняйте свою сетевую геолокацию и не включайте VPN — иначе домашний регион аккаунта сменится</p>
          <p>• Добавьте на аккаунт минимум две бесплатные игры. Например, PUBG и Dota 2<br>- Можно добавлять игры через библиотеку Steam в приложении на смартфоне</p>
          <p>• Наиграйте не менее 5 часов в добавленных играх</p>
          <p>• После выполнения предыдущих пунктов можно пополнять аккаунт</p>`
      },
      regions: {
        title: 'Как пополнить аккаунт Steam из регионов с ограничениями?',
        html: `
          <p>• Выйдите из Steam на всех устройствах (ПК, браузер)</p>
          <p>• Если вы в Крыму/ЛНР/ДНР: включите авиарежим на телефоне с Steam Guard</p>
          <p>• Смените сетевую геолокацию (например, через VPN) на РФ (лучше Москва/СПб) и зайдите в Steam через браузер</p>
          <p>• Подождите 30 минут перед пополнением</p>
          <p>• Следующий платеж можно сделать не раньше чем через 2 часа</p>`
      }
    };
    $$('.steam-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const cfg = INFO[btn.dataset.info];
        if (cfg) showInfoOverlay(cfg.title, cfg.html);
      });
    });

    // ---------------------- сворачивание мобильной клавиатуры ----------------------
    $$('.field__input, input, textarea').forEach(inp => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter'){ e.preventDefault(); e.currentTarget.blur(); }
      });
    });
    function blurIfOutside(e){
      const ae = document.activeElement;
      if (!ae) return;
      const isInput = ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA';
      if (!isInput) return;
      if (ae.contains(e.target)) return;
      ae.blur();
    }
    document.addEventListener('pointerdown', blurIfOutside, { capture: true });
    document.addEventListener('touchstart',  blurIfOutside, { capture: true });

  });
})();

/* ---------- Steam credited calculator (превью зачисления) ---------- */
(function () {
  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
  const $ = (s, r) => (r || document).querySelector(s);

  function debounce(fn, ms){
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  const amountInput   = $('#steamAmountInput');
  const currencyField = $('#steamCurrency');
  const creditedEl    = $('#steamCreditedValue');

  function getCurrency(){
    if (currencyField && currencyField.tagName === 'SELECT') {
      return String(currencyField.value || '').toUpperCase();
    }
    const checked = document.querySelector('#steamCurrency input[type="radio"]:checked');
    return String((checked && checked.value) || 'RUB').toUpperCase();
  }

  function getAmount(){
    const raw = (amountInput?.value || '').replace(',', '.').replace(/[^\d.]/g, '');
    const n = Number(raw);
    return isFinite(n) && n > 0 ? n : 0;
  }

  const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  async function refreshCredited(){
    if (!creditedEl) return;
    const amount   = getAmount();
    const currency = getCurrency();

    if (!amount) { creditedEl.textContent = '0.00'; return; }

    // локальный прокси в твоём фронте (если есть)
    const url = `/api/steam/convert?amount=${encodeURIComponent(amount)}&currency=${encodeURIComponent(currency)}`;

    creditedEl.textContent = '…';
    try{
      const res  = await fetch(url, { headers: { 'Accept':'application/json' }});
      if (!res.ok) throw new Error('Bad response');
      const data = await res.json();
      const credited = Number(data?.credited ?? data?.result ?? data?.toAmount ?? data?.amount_out ?? 0);
      creditedEl.textContent = nf2.format(Math.max(0, credited));
    }catch(e){
      console.error('Steam convert error:', e);
      creditedEl.textContent = '0';
    }
  }

  ready(() => {
    amountInput?.addEventListener('input', debounce(refreshCredited, 300));
    currencyField?.addEventListener('input', refreshCredited);
    refreshCredited();
  });
})();

/* ===== Прямой расчёт "Будет зачислено" через сервис StarsBox ===== */
(function(){
  const SERVICE_BASE = document.body?.dataset?.serviceBase || '';

  const regionGroup = document.getElementById('regionGroup');
  const amountInput = document.getElementById('topupAmount');
  const creditValue = document.getElementById('creditValue');
  const creditUnit  = document.getElementById('creditUnit');
  const creditIcon  = document.getElementById('creditIcon');

  if (!regionGroup || !amountInput || !creditValue || !creditUnit || !creditIcon){
    console.warn('[steam] Нет нужных элементов для расчёта');
    return;
  }

  const REGION_TO_CUR = { ru: 'RUB', kz: 'KZT', cis: 'USD' };
  const CUR_ICON  = { RUB: '₽', KZT: '₸', USD: '$' };
  const CUR_LABEL = { RUB: 'RUB', KZT: 'KZT', USD: 'USD' };

  function getRegion(){
    const a = regionGroup.querySelector('.region-btn.is-active') ||
              regionGroup.querySelector('.region-btn[aria-pressed="true"]');
    return a?.dataset.region || 'ru';
  }
  function getTargetCurrency(){ return REGION_TO_CUR[getRegion()] || 'RUB'; }

  function parseRubAmount(){
    const raw = String(amountInput.value || '').replace(/[^\d]/g, '');
    return raw ? Number(raw) : 0;
  }

  function fmt(n, cur){
    const digits = cur === 'USD' ? 2 : 0;
    try { return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n); }
    catch { return Number(n).toFixed(digits); }
  }

  const debounce = (fn, ms=250) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
  let abortCtrl = null;

  async function recalc(){
    const to = getTargetCurrency();
    creditIcon.textContent = CUR_ICON[to] || '';
    creditUnit.textContent = CUR_LABEL[to] || to;

    const amountRub = parseRubAmount();
    if (!amountRub){ creditValue.textContent = '0'; return; }

    if (to === 'RUB'){ creditValue.textContent = fmt(amountRub, 'RUB'); return; }
    if (!SERVICE_BASE){ creditValue.textContent = '0'; console.warn('[steam] SERVICE_BASE пуст'); return; }

    try { abortCtrl?.abort(); } catch {}
    abortCtrl = new AbortController();

    const u = SERVICE_BASE.replace(/\/+$/,'') + '/steam-currency/convert?' +
              new URLSearchParams({ amount: String(amountRub), from: 'RUB', to });

    try{
      const res = await fetch(u, { signal: abortCtrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data?.ok){
        const got = Number(data.result || 0);
        creditValue.textContent = fmt(got, to);
      } else {
        creditValue.textContent = '0';
        console.warn('[steam] ошибка расчёта', data);
      }
    }catch(err){
      if (err.name === 'AbortError') return;
      creditValue.textContent = '0';
      console.warn('[steam] запрос не удался', err);
    }
  }

  const recalcDebounced = debounce(recalc, 250);
  amountInput.addEventListener('input', recalcDebounced);
  regionGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.region-btn');
    if (!btn) return;
    regionGroup.querySelectorAll('.region-btn').forEach(b => {
      const active = b === btn;
      b.classList.toggle('is-active', active);
      if (b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    recalcDebounced();
  });
  recalc();
})();

/* ===== Низкоуровневый конвертер через API StarsBox (кешируем) ===== */
const _convCache = new Map();
function normCur(c){ return String(c || '').toUpperCase().trim().replace('KTZ','KZT'); }
async function convertAmount(amount, from, to){
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0) return null;
  const F = normCur(from), T = normCur(to);
  const key = `${a}|${F}|${T}`;
  if (_convCache.has(key)) return _convCache.get(key);
  const url = `${API_BASE}/steam-currency/convert?amount=${encodeURIComponent(a)}&from=${encodeURIComponent(F)}&to=${encodeURIComponent(T)}`;
  try{
    const resp = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (data && data.ok && typeof data.result === 'number'){
      _convCache.set(key, data.result);
      return data.result;
    }
    console.warn('convert: unexpected payload', data);
    return null;
  }catch(err){
    console.error('convert fetch error', err);
    return null;
  }
}

/* ===== Привязка калькулятора к текущей разметке ===== */
const CURRENCY_META = { RUB:{symbol:'₽',name:'RUB'}, USD:{symbol:'$',name:'USD'}, KZT:{symbol:'₸',name:'KZT'} };
function regionToCurrency(region){ region=String(region).toLowerCase(); return region==='kz'?'KZT':(region==='cis'?'USD':'RUB'); }
function getActiveRegion(){ const group=document.getElementById('regionGroup'); const a=group?.querySelector('.region-btn.is-active'); return a?.dataset?.region || 'ru'; }
const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

async function updateCreditBox(){
  const amountInput = document.getElementById('topupAmount');
  const iconEl  = document.getElementById('creditIcon');
  const valueEl = document.getElementById('creditValue');
  const unitEl  = document.getElementById('creditUnit');
  if (!amountInput || !iconEl || !valueEl || !unitEl) return;

  const fromCur = 'RUB';
  const region  = getActiveRegion();
  const toCur   = regionToCurrency(region);

  const raw = (amountInput.value || '').replace(/\D+/g,'');
  const rub = Number(raw);
  const meta = CURRENCY_META[toCur] || CURRENCY_META.RUB;

  if (!raw){ iconEl.textContent=meta.symbol; valueEl.textContent='0'; unitEl.textContent=meta.name; return; }
  if (rub < 100){ iconEl.textContent=meta.symbol; valueEl.textContent='—'; unitEl.textContent=meta.name; return; }
  if (toCur === fromCur){ iconEl.textContent=meta.symbol; valueEl.textContent=nf.format(rub); unitEl.textContent=meta.name; return; }

  const result = await convertAmount(rub, fromCur, toCur);
  iconEl.textContent  = meta.symbol;
  valueEl.textContent = nf.format(result ?? 0);
  unitEl.textContent  = meta.name;
}

(function attachSteamHandlers(){
  const amountInput = document.getElementById('topupAmount');
  const regionGroup = document.getElementById('regionGroup');
  amountInput?.addEventListener('input', () => {
    const clean = amountInput.value.replace(/\D+/g,'').slice(0,6);
    if (amountInput.value !== clean){
      amountInput.value = clean;
      try{ amountInput.setSelectionRange(clean.length, clean.length); }catch{}
    }
    updateCreditBox();
  });
  regionGroup?.addEventListener('click', (e) => {
    const btn = e.target.closest('.region-btn');
    if (!btn) return;
    regionGroup.querySelectorAll('.region-btn').forEach(b=>{
      b.classList.toggle('is-active', b === btn);
      b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
    });
    updateCreditBox();
  });
  updateCreditBox();
})();


