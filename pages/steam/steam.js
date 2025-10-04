(function(){
  // ---------------------- helpers ----------------------
  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
  const $  = (s, r) => (r||document).querySelector(s);
  const $$ = (s, r) => Array.from((r||document).querySelectorAll(s));

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
    // Back button
    const backBtn = $('#backBtn');
    if (backBtn){
      const url = new URL(window.location.href);
      const back = url.searchParams.get('back');
      backBtn.addEventListener('click', () => back ? (window.location.href = back) : window.history.back());
    }

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
      const map = {
        cis: { unit: '$', src: '../../assets/icons/icon4.png' },
        kz:  { unit: '₸',  src: '../../assets/icons/icon4.png' },
        ru:  { unit: '₽',  src: '../../assets/icons/icon4.png' },
      };
      const cfg = map[activeRegion()] || map.ru;
      creditIcon.classList.add('is-img');
      creditIcon.setAttribute('aria-hidden','true');
      creditIcon.innerHTML = `<img src="${cfg.src}" alt="" />`;
      creditUnit.textContent = cfg.unit;
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
        creditValue.textContent = '';
        payBtn.textContent = 'Оплатить';
        payBtn.disabled = true;
        return;
      }

      // пока без конвертации — просто показываем введённую сумму
      creditValue.textContent = nfRu.format(amount);

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

