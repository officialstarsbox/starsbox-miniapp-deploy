// Ничего сложного: включаем минимальную инициализацию.
// Кнопка "назад" — это <a href="...">, JS тут не нужен.
(function(){
  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
  ready(function(){
    // сюда будем добавлять логику следующих секций TON-страницы
  });
})();

(function(){
  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  // нормализация username: только латиница/цифры/_, @ всегда в начале
  function normalizeWithAt(raw){
    const core = String(raw || '')
      .replace(/@/g, '')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .slice(0, 32);
    return core ? '@' + core : '';
  }

  // читаем @username из Telegram WebApp или из query (?tg_username=...)
  function getSelfUsername(){
    try{
      const tg = window.Telegram && window.Telegram.WebApp;
      tg?.ready?.();
      const u = tg?.initDataUnsafe?.user?.username;
      if (u) return String(u).replace(/[^a-zA-Z0-9_]/g,'').slice(0,32);
    }catch{}
    try{
      const q = new URLSearchParams(location.search).get('tg_username');
      return q ? String(q).replace(/[^a-zA-Z0-9_]/g,'').slice(0,32) : null;
    }catch{ return null; }
  }

  ready(function(){
    const usernameInput = document.getElementById('tgUsername');
    const buySelfBtn    = document.getElementById('buyForMeBtn');

    if (usernameInput){
      usernameInput.addEventListener('input', () => {
        const v  = usernameInput.value;
        const nv = normalizeWithAt(v);
        if (v !== nv){
          usernameInput.value = nv;
          try{ usernameInput.setSelectionRange(nv.length, nv.length); }catch(e){}
        }
      });
      usernameInput.addEventListener('blur', () => {
        if (usernameInput.value === '@') usernameInput.value = '';
      });
      usernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter'){ e.preventDefault(); usernameInput.blur(); }
      });
    }

    if (buySelfBtn && usernameInput){
      buySelfBtn.addEventListener('click', () => {
        const me = getSelfUsername();
        if (!me){
          window.Telegram?.WebApp?.showToast?.('В вашем профиле Telegram не указан username');
          return;
        }
        usernameInput.value = '@' + me;
        usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
        usernameInput.blur();
      });
    }

    // свернуть клавиатуру по тапу вне полей
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
// ===== Кол-во TON (1..300, только целые) =====
(function(){
  const tonAmount = document.getElementById('tonAmount');
  if (!tonAmount) return;

  const digitsOnly = s => String(s || '').replace(/\D+/g, '');

  function sanitize() {
    const raw = tonAmount.value;
    let nv = digitsOnly(raw).slice(0, 3); // максимум 3 цифры

    if (nv === '') {                     // пусто — позволяем
      tonAmount.value = '';
      return;
    }

    let n = Number(nv);
    if (n > 300) n = 300;                // верхняя граница
    if (n < 1)  {                         // не допускаем 0
      tonAmount.value = '';
      return;
    }

    nv = String(n);
    if (tonAmount.value !== nv){
      tonAmount.value = nv;
      try { tonAmount.setSelectionRange(nv.length, nv.length); } catch(e){}
    }
  }

  tonAmount.addEventListener('input', sanitize);

  // мягко блокируем нецифровые символы
  tonAmount.addEventListener('beforeinput', (e) => {
    if (e.inputType === 'insertText' && /\D/.test(e.data)) e.preventDefault();
  });

  // Enter => свернуть клавиатуру
  tonAmount.addEventListener('keydown', (e) => {
    if (e.key === 'Enter'){ e.preventDefault(); tonAmount.blur(); }
  });
})();
// ===== TON: Итого к оплате (1 TON = 300 ₽ по умолчанию) =====
(function(){
  const amountEl = document.getElementById('tonAmount');   // поле количества TON (1..300)
  const totalEl  = document.getElementById('tonTotalValue');
  const cardEl   = document.getElementById('tonTotalCard');
  if (!amountEl || !totalEl || !cardEl) return;

  const nfRub2 = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function getRate(){
    const fromWin = Number(window.TON_RATE);
    if (!isNaN(fromWin) && fromWin > 0) return fromWin;
    const fromAttr = Number(cardEl.dataset.rate);
    if (!isNaN(fromAttr) && fromAttr > 0) return fromAttr;
    return 300; // дефолт
  }

  function renderTotal(){
    const qty = Number((amountEl.value || '').replace(/\D+/g, '')); // на всякий случай
    // валидный диапазон как у поля: 1..300
    if (!(qty >= 1 && qty <= 300)) {
      totalEl.textContent = `${nfRub2.format(0)} руб.`;
      return;
    }
    const sum = qty * getRate();
    totalEl.textContent = `${nfRub2.format(sum)} руб.`;
  }

  amountEl.addEventListener('input', renderTotal);
  renderTotal(); // первичный вывод (0,00 руб.)
})();
// ===== TON: активация платёжных кнопок по вводу username и количества TON =====
(function(){
  const usernameEl = document.getElementById('tgUsername');   // поле @username
  const amountEl   = document.getElementById('tonAmount');     // поле кол-ва TON (1..300)
  const totalEl    = document.getElementById('tonTotalValue'); // текст итога
  const cardEl     = document.getElementById('tonTotalCard');  // секция с data-rate
  const payBtns    = [document.getElementById('paySbpBtn'), document.getElementById('payCryptoBtn')].filter(Boolean);

  if (!amountEl || !totalEl || !cardEl || payBtns.length === 0) return;

  const nfRub2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function getRate(){
    const fromWin  = Number(window.TON_RATE);
    if (!isNaN(fromWin) && fromWin > 0) return fromWin;
    const fromAttr = Number(cardEl.dataset.rate);
    if (!isNaN(fromAttr) && fromAttr > 0) return fromAttr;
    return 300;
  }

  function usernameValid(){
    const v = (usernameEl?.value || '').trim();
    return /^@[A-Za-z0-9_]{1,32}$/.test(v); // должен быть @ + 1..32 символа набора
  }

  function amountValid(){
    const n = Number((amountEl?.value || '').replace(/\D+/g, ''));
    return (n >= 1 && n <= 300) ? n : null;
  }

  function setButtonsEnabled(on){
    payBtns.forEach(b => {
      b.disabled = !on;
      b.setAttribute('aria-disabled', String(!on));
    });
  }

  function renderTotalAndButtons(){
    const qty = amountValid();
    const sum = qty ? qty * getRate() : 0;
    totalEl.textContent = `${nfRub2.format(sum)} руб.`;

    const enabled = usernameValid() && sum > 0;
    setButtonsEnabled(enabled);
  }

  usernameEl?.addEventListener('input', renderTotalAndButtons);
  amountEl?.addEventListener('input',  renderTotalAndButtons);

  // первичная инициализация
  setButtonsEnabled(false);
  renderTotalAndButtons();
})();
