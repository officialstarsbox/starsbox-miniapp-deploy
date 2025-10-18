// БАЗА API StarsBox Fragment Service (наш домен)
const API_BASE = 'https://api.starsbox.org';

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
    // 1) приоритет — твой общий helper из /app.js
    if (typeof window.openInsideTelegram === 'function') {
      try { window.openInsideTelegram(url); return; } catch(e){}
    }
    // 2) fallback — SDK Telegram
    if (tg && typeof tg.openLink === 'function') {
      try { tg.openLink(url); return; } catch(e){}
    }
    // 3) совсем уж fallback — обычный редирект
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
      </div>
    `;
    const ov = $('#infoOv');
    // закрытие кликом по фону
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); }, { once: true });
    // на Esc — бонусом
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

    // Help overlay (where to find login) — open & close by backdrop click
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
      // placeholder под выбранный регион
      const reg = activeRegion(); // ru | kz | cis
      if (reg === 'ru') {
        amountInput.placeholder = 'от 100 до 45 000 руб';
      } else if (reg === 'kz') {
        amountInput.placeholder = 'от 100 до 45 000 руб';
      } else { // cis
        amountInput.placeholder = 'от 100 до 45 000 руб';
      }
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

    // ✅ адреса возврата в мини-апп после оплаты (страницы сделаем позже)
    const THANKS_SUCCESS = window.PAY_SUCCESS_URL;
    const THANKS_FAIL    = window.PAY_FAIL_URL;

    // --- Steam: создать заказ и открыть оплату через Wata DG ---
    async function createSteamOrder() {
      const account = (loginInput?.value || '').trim();
      if (!account) {
        showInfoOverlay('Ошибка', 'Укажите логин Steam.');
        return;
      }

      // сумма, которую пользователь ввёл в РУБЛЯХ (netAmount)
      const raw = digitsOnly(amountInput?.value || '');
      const net = raw ? parseInt(raw, 10) : NaN;
      if (!net || isNaN(net) || net < LIMITS.min || net > LIMITS.max) {
        showInfoOverlay('Ошибка', `Сумма должна быть от ${LIMITS.min} до ${LIMITS.max} ₽.`);
        return;
      }

      // gross (amount) = net + наша комиссия
      const pct   = Number(window.SB_FEE_PERCENT || 9);
      const gross = Math.round(net * (1 + pct/100));

      // ❗ минимальные изменения: добавили successUrl/returnUrl
      const payload = {
        orderId: `ord_wata_${Date.now()}`,
        account: account,
        amount: Number(gross.toFixed(2)),    // сколько списываем с клиента (руб)
        netAmount: Number(net.toFixed(2)),   // сколько зачислится в Steam (руб)
        description: `Steam top-up ${net.toFixed(2)} RUB to ${account}`,

        // (необязательно) просим платёжку вернуть пользователя обратно в мини-апп
        successUrl: THANKS_SUCCESS,
        returnUrl:  THANKS_FAIL
      };

      try {
        payBtn.disabled = true;
        payBtn.textContent = 'Открываем страницу оплаты…';

        const res = await fetch(`${API_BASE}/wata/dg/steam/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.detail || JSON.stringify(data));

        const url = data.paymentLink || data.url;
        if (!url) throw new Error('paymentLink не вернулся от провайдера');

        // ✅ открываем СТРОГО внутри Telegram (если возможно)
        openLink(url);
      } catch (err) {
        console.error('steam pay error:', err);
        showInfoOverlay('Не удалось создать оплату', `Попробуйте ещё раз.<br><small>${String(err.message || err)}</small>`);
        payBtn.disabled = false;
        updatePayUI(); // вернуть исходный текст кнопки
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
          <p>• После выполнения предыдущих пунктов можно пополнять аккаунт</p>
        `
      },
      regions: {
        title: 'Как пополнить аккаунт Steam из регионов с ограничениями?',
        html: `
          <p>• Выйдите из Steam на всех устройствах (ПК, браузер)</p>
          <p>• Если вы в Крыму/ЛНР/ДНР: включите авиарежим на телефоне с Steam Guard</p>
          <p>• Смените сетевую геолокацию (например, через VPN) на РФ (лучше Москва/СПб) и зайдите в Steam через браузер</p>
          <p>• Подождите 30 минут перед пополнением</p>
          <p>• Следующий платеж можно сделать не раньше чем через 2 часа</p>
        `
      }
    };
    $$('.steam-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const cfg = INFO[btn.dataset.info];
        if (cfg) showInfoOverlay(cfg.title, cfg.html);
      });
    });

    // ---------------------- сворачивание мобильной клавиатуры ----------------------
    // 1) Enter => blur
    $$('.field__input, input, textarea').forEach(inp => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter'){
          e.preventDefault();
          e.currentTarget.blur();
        }
      });
    });
    // 2) Тап/клик вне поля => blur активного поля
    function blurIfOutside(e){
      const ae = document.activeElement;
      if (!ae) return;
      const isInput = ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA';
      if (!isInput) return;
      if (ae.contains(e.target)) return; // клик внутри того же поля
      ae.blur();
    }
    document.addEventListener('pointerdown', blurIfOutside, { capture: true });
    document.addEventListener('touchstart', blurIfOutside, { capture: true });

  });
})();

// ---------- Steam credited calculator ----------
(function () {
  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
  const $ = (s, r) => (r || document).querySelector(s);

  // лёгкий debounce
  function debounce(fn, ms){
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // элементы страницы (проверь айдишники у себя в разметке)
  const amountInput   = $('#steamAmountInput');     // инпут суммы пополнения (в выбранной валюте)
  const currencyField = $('#steamCurrency');        // select или radio-container с RUB/USD/KZT
  const creditedEl    = $('#steamCreditedValue');   // сюда выводим "Будет зачислено в Steam"

  // парсим текущую валюту (если radio — берём отмеченную)
  function getCurrency(){
    // 1) select
    if (currencyField && currencyField.tagName === 'SELECT') {
      return String(currencyField.value || '').toUpperCase();
    }
    // 2) радиокнопки внутри контейнера
    const checked = document.querySelector('#steamCurrency input[type="radio"]:checked');
    return String((checked && checked.value) || 'RUB').toUpperCase();
  }

  // нормализуем сумму (только число, >= 0)
  function getAmount(){
    const raw = (amountInput?.value || '').replace(',', '.').replace(/[^\d.]/g, '');
    const n = Number(raw);
    return isFinite(n) && n > 0 ? n : 0;
  }

  // красиво форматируем числа (2 знака)
  const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  async function refreshCredited(){
    if (!creditedEl) return;
    const amount   = getAmount();
    const currency = getCurrency();

    if (!amount) { creditedEl.textContent = '0.00'; return; }

    // 🚪 наш локальный прокси (см. серверную часть ниже)
    const url = `/api/steam/convert?amount=${encodeURIComponent(amount)}&currency=${encodeURIComponent(currency)}`;

    creditedEl.textContent = '…'; // небольшой индикатор
    try{
      const res  = await fetch(url, { headers: { 'Accept':'application/json' }});
      if (!res.ok) throw new Error('Bad response');
      const data = await res.json();

      // ожидаем одно из стандартных полей
      const credited =
        Number(data?.credited ?? data?.result ?? data?.toAmount ?? data?.amount_out ?? 0);

      creditedEl.textContent = nf2.format(Math.max(0, credited));
    }catch(e){
      console.error('Steam convert error:', e);
      creditedEl.textContent = '0';
    }
  }

  // навешиваем обработчики
  ready(() => {
    if (amountInput)   amountInput.addEventListener('input', debounce(refreshCredited, 300));
    if (currencyField) currencyField.addEventListener('input', refreshCredited);
    refreshCredited();
  });
})();

// ===== Steam: расчёт "Будет зачислено в Steam" через starsbox-fragment-service =====
(function(){
  // --- Базовый адрес сервиса берём из <body data-service-base="...">
  const SERVICE_BASE = document.body?.dataset?.serviceBase || '';

  // --- Элементы страницы
  const regionGroup = document.getElementById('regionGroup');      // блок с кнопками регионов
  const amountInput = document.getElementById('topupAmount');      // поле ввода суммы (в рублях)
  const creditValue = document.getElementById('creditValue');      // число "будет зачислено"
  const creditUnit  = document.getElementById('creditUnit');       // подпись валюты (Рубль / Тенге / Доллар США)
  const creditIcon  = document.getElementById('creditIcon');       // символ валюты (₽ / ₸ / $)

  if (!regionGroup || !amountInput || !creditValue || !creditUnit || !creditIcon){
    console.warn('[steam] Нет нужных элементов для расчёта');
    return;
  }

  // --- Карта: регион -> валюта зачисления
  const REGION_TO_CUR = { ru: 'RUB', kz: 'KZT', cis: 'USD' };
  const CUR_ICON  = { RUB: '₽', KZT: '₸', USD: '$' };
  const CUR_LABEL = { RUB: 'RUB', KZT: 'KZT', USD: 'USD' };

  // Ищем активный регион по .is-active или aria-pressed="true"
  function getRegion(){
    const a = regionGroup.querySelector('.region-btn.is-active') ||
              regionGroup.querySelector('.region-btn[aria-pressed="true"]');
    return a?.dataset.region || 'ru';
  }
  function getTargetCurrency(){
    const reg = getRegion();
    return REGION_TO_CUR[reg] || 'RUB';
  }

  // Парсим сумму в рублях (оставляем только цифры)
  function parseRubAmount(){
    const raw = String(amountInput.value || '').replace(/[^\d]/g, '');
    return raw ? Number(raw) : 0;
  }

  // Форматируем число под валюту (USD — 2 знака, RUB/KZT — без копеек)
  function fmt(n, cur){
    const digits = cur === 'USD' ? 2 : 0;
    try {
      return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
    } catch {
      return Number(n).toFixed(digits);
    }
  }

  // Обновить подписи валюты (иконка и название)
  function paintCurrency(cur){
    creditIcon.textContent = CUR_ICON[cur] || '';
    creditUnit.textContent = CUR_LABEL[cur] || cur;
  }

  // Простейший дебаунс
  const debounce = (fn, ms=250) => {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  let abortCtrl = null;

  async function recalc(){
    // Валюта назначения меняется при смене региона
    const to = getTargetCurrency();
    paintCurrency(to);

    // Сумма, которую вводит пользователь — в РУБЛЯХ
    const amountRub = parseRubAmount();

    // Если ничего не введено или не задан адрес сервиса — показываем 0
    if (!amountRub){
      creditValue.textContent = '0';
      return;
    }

    // Если целевая валюта — RUB, сетевой запрос не нужен
    if (to === 'RUB'){
      creditValue.textContent = fmt(amountRub, 'RUB');
      return;
    }

    // Если сервис не задан — вывести "0" и выйти
    if (!SERVICE_BASE){
      creditValue.textContent = '0';
      console.warn('[steam] SERVICE_BASE пуст, задайте <body data-service-base="...">');
      return;
    }

    // Отменим прошлый запрос, если был
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
      if (err.name === 'AbortError') return; // нормальная отмена
      creditValue.textContent = '0';
      console.warn('[steam] запрос не удался', err);
    }
  }

  const recalcDebounced = debounce(recalc, 250);

  // Слушатели: ввод суммы
  amountInput.addEventListener('input', recalcDebounced);

  // Слушатели: смена региона
  regionGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.region-btn');
    if (!btn) return;

    regionGroup.querySelectorAll('.region-btn').forEach(b => {
      const active = b === btn;
      b.classList.toggle('is-active', active);
      if (b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    // можно менять плейсхолдер под валюту (текст одинаковый в твоей версии)
    recalcDebounced();
  });

  // Первый пересчёт при загрузке
  recalc();
})();

// Простой кеш, чтобы не дёргать API при одинаковых запросах
const _convCache = new Map(); // ключ: `${amount}|${from}|${to}`

// Нормализация валют (KZT/KTZ не важен — сервер понимает оба)
function normCur(c){ return String(c || '').toUpperCase().trim().replace('KTZ','KZT'); }

// Запрос конвертации: amount из from в to
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

// Красивые подписи и символы валют
const CURRENCY_META = {
  RUB: { symbol: '₽', name: 'RUB' },
  USD: { symbol: '$', name: 'USD' },
  KZT: { symbol: '₸', name: 'KZT' },
};

// Определяем валюту по выбранному региону (кнопки RU/KZ/CIS)
function regionToCurrency(region){
  switch(String(region).toLowerCase()){
    case 'ru':  return 'RUB';
    case 'kz':  return 'KZT';
    case 'cis': return 'USD';
    default:    return 'RUB';
  }
}

// Утилита: вытягиваем активный регион из блока кнопок
function getActiveRegion(){
  const group = document.getElementById('regionGroup');
  const active = group?.querySelector('.region-btn.is-active');
  return active?.dataset?.region || 'ru';
}

// Форматирование числа без валютного знака (оставим знак отдельно в #creditIcon)
const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

async function updateCreditBox(){
  const amountInput = document.getElementById('topupAmount');
  const iconEl  = document.getElementById('creditIcon');
  const valueEl = document.getElementById('creditValue');
  const unitEl  = document.getElementById('creditUnit');

  if (!amountInput || !iconEl || !valueEl || !unitEl) return;

  // Сумма пополнения вводится в РУБЛЯХ
  const fromCur = 'RUB';
  const region  = getActiveRegion();
  const toCur   = regionToCurrency(region);

  const raw = (amountInput.value || '').replace(/\D+/g,'');
  const rub = Number(raw);
  if (!raw){
    const meta = CURRENCY_META[toCur] || CURRENCY_META.RUB;
    iconEl.textContent  = meta.symbol;
    valueEl.textContent = '0';
    unitEl.textContent  = meta.name;
    return;
  }

  if (rub < 100){
    const meta = CURRENCY_META[toCur] || CURRENCY_META.RUB;
    iconEl.textContent  = meta.symbol;
    valueEl.textContent = '—';
    unitEl.textContent  = meta.name;
    return;
  }

  if (toCur === fromCur){
    const meta = CURRENCY_META[toCur] || CURRENCY_META.RUB;
    iconEl.textContent  = meta.symbol;
    valueEl.textContent = nf.format(rub);
    unitEl.textContent  = meta.name;
    return;
  }

  const result = await convertAmount(rub, fromCur, toCur);
  const meta = CURRENCY_META[toCur] || { symbol: '', name: toCur };

  if (result == null){
    iconEl.textContent  = meta.symbol;
    valueEl.textContent = '0';
    unitEl.textContent  = meta.name;
    return;
  }

  iconEl.textContent  = meta.symbol;
  valueEl.textContent = nf.format(result);
  unitEl.textContent  = meta.name;
}

// Подписки на события
(function attachSteamHandlers(){
  const amountInput = document.getElementById('topupAmount');
  const regionGroup = document.getElementById('regionGroup');

  // Поле ввода: только цифры
  amountInput?.addEventListener('input', () => {
    const clean = amountInput.value.replace(/\D+/g,'').slice(0,6);
    if (amountInput.value !== clean){
      amountInput.value = clean;
      try{ amountInput.setSelectionRange(clean.length, clean.length); }catch{}
    }
    updateCreditBox();
  });

  // Переключение региона
  regionGroup?.addEventListener('click', (e) => {
    const btn = e.target.closest('.region-btn');
    if (!btn) return;

    regionGroup.querySelectorAll('.region-btn').forEach(b=>{
      b.classList.toggle('is-active', b === btn);
      b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
    });

    updateCreditBox();
  });

  // Первичная инициализация
  updateCreditBox();
})();
