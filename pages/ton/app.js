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

/* ========= TON: фронт ↔ бэк ========= */
(function () {
  const API_BASE = "https://api.starsbox.org";
  const PRODUCT = "ton";
  const CURRENCY = "RUB";
  const MIN_TON = 1;
  const MAX_TON = 300;

  // ✅ Настраиваем, куда вернуть пользователя после оплаты (страницы создадим позже)
  const THANKS_SUCCESS = window.PAY_SUCCESS_URL;
  const THANKS_FAIL    = window.PAY_FAIL_URL;

  const $ = (sel) => document.querySelector(sel);

  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;

  // Элементы
  const usernameInput = $("#tgUsername");
  const amountInput = $("#tonAmount");
  const totalCard = $("#tonTotalCard");
  const totalValue = $("#tonTotalValue");
  const paySbpBtn = $("#paySbpBtn");
  const payCryptoBtn = $("#payCryptoBtn");
  const buyForMeBtn = $("#buyForMeBtn");

  // ₽ за 1 TON берём из data-rate у #tonTotalCard (например, 300)
  const RATE = (() => {
    const raw = totalCard?.dataset?.rate || "1";
    const v = parseFloat(String(raw).replace(",", "."));
    return Number.isFinite(v) ? v : 1;
  })();

  // Утилиты
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function normalizeUsername(v) {
    if (!v) return "";
    let s = String(v).trim();
    if (!s) return "";
    if (s.startsWith("@")) return s;
    if (/^[A-Za-z0-9_\.]+$/.test(s)) return "@" + s;
    return s; // если странные символы — пусть бэк валидирует
  }

  function formatRub(num) {
    try {
      return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(num);
    } catch {
      return `${(Math.round(num * 100) / 100).toFixed(2)} руб.`;
    }
  }

  function getQty() {
    const raw = amountInput?.value || "";
    const onlyDigits = raw.replace(/[^\d]/g, "");
    const n = parseInt(onlyDigits, 10);
    if (!Number.isFinite(n)) return 0;
    return clamp(n, MIN_TON, MAX_TON);
  }

  function setQty(n) {
    const v = clamp(Number(n) || 0, MIN_TON, MAX_TON);
    amountInput.value = v ? String(v) : "";
    updateTotal();
  }

  function updateTotal() {
    const qty = getQty();
    const amountRub = qty * RATE;                    // ₽
    const amountMinor = Math.round(amountRub * 100); // копейки (целое)

    totalValue.textContent = qty ? formatRub(amountRub) : "0,00 руб.";
    totalValue.dataset.amountMinor = String(amountMinor);
    totalValue.dataset.qty = String(qty);

    // Включаем/выключаем кнопки оплаты по валидности
    const uOk = !!normalizeUsername(usernameInput?.value || "");
    const qOk = qty >= MIN_TON && qty <= MAX_TON;
    const enable = uOk && qOk && amountMinor > 0;

    [paySbpBtn, payCryptoBtn].forEach((b) => {
      if (!b) return;
      b.disabled = !enable;
      b.classList.toggle("is-loading", false);
      b.setAttribute("aria-disabled", String(!enable));
    });
  }

  function setLoading(is) {
    [paySbpBtn, payCryptoBtn].forEach((b) => {
      if (!b) return;
      b.disabled = !!is;
      b.classList.toggle("is-loading", !!is);
      b.setAttribute("aria-disabled", String(!!is));
    });
  }

  // ✅ Открываем ссылки приоритетно внутри Telegram мини-аппа
  function openLink(url) {
    if (!url) return;
    // 1) если на странице подключён /app.js с openInsideTelegram — используем его
    if (typeof window.openInsideTelegram === "function") {
      try { window.openInsideTelegram(url); return; } catch {}
    }
    // 2) иначе — напрямую через SDK
    if (tg && typeof tg.openLink === "function") {
      try { tg.openLink(url); return; } catch {}
    }
    // 3) фолбэк — обычный переход
    window.location.href = url;
  }

  async function initiatePayment(provider) {
    try {
      setLoading(true);

      const username = normalizeUsername(usernameInput?.value || "");
      if (!username) {
        alert("Укажите username получателя (например, @username).");
        return;
      }

      const qty = getQty();
      if (!qty || qty < MIN_TON || qty > MAX_TON) {
        alert(`Укажите количество TON от ${MIN_TON} до ${MAX_TON}.`);
        return;
      }

      const amountMinor = Number(totalValue.dataset.amountMinor || "0");
      if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
        alert("Сумма к оплате не рассчитана. Введите количество заново.");
        return;
      }

      // Бэк ожидает ту же форму, что и на Stars:
      // provider, product, username, qty, amount_minor, currency
      const payload = {
        provider,                 // "wata" | "heleket"
        product: PRODUCT,         // "ton"
        tg_username: username,    // ОБЯЗАТЕЛЬНО для TON
        ton_amount: qty,          // ОБЯЗАТЕЛЬНО для TON (целое количество TON)

        // ниже — оставим для совместимости/логов
        username,                 // дубль
        qty,                      // дубль
        amount_minor: amountMinor,
        currency: CURRENCY,

        // ✅ (опционально) просим платёжку вернуть пользователя внутрь мини-аппа:
        success_url: THANKS_SUCCESS,
        fail_url:    THANKS_FAIL
      };

      const resp = await fetch(`${API_BASE}/pay/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status} ${resp.statusText} ${txt || ""}`.trim());
      }

      const data = await resp.json();
      if (!data || !data.ok || !data.payment_url) {
        throw new Error(`Некорректный ответ сервера: ${JSON.stringify(data)}`);
      }

      openLink(data.payment_url);
    } catch (e) {
      console.error("[pay/initiate ton] error:", e);
      alert(`Не удалось создать платёж.\n${e && e.message ? e.message : e}`);
    } finally {
      setLoading(false);
    }
  }

  // Prefill: «купить себе»
  function initBuyForMe() {
    if (!buyForMeBtn || !usernameInput) return;
    buyForMeBtn.addEventListener("click", () => {
      let u = "";
      try {
        const tgUser = tg?.initDataUnsafe?.user;
        if (tgUser?.username) u = "@" + tgUser.username;
      } catch {}
      if (!u) {
        const url = new URL(window.location.href);
        const qU = url.searchParams.get("u");
        if (qU) u = normalizeUsername(qU);
      }
      if (!u) {
        alert("Не удалось определить ваш username из Telegram. Введите его вручную (например, @username).");
        usernameInput.focus();
        return;
      }
      usernameInput.value = u;
      updateTotal();
    });
  }

  // Слушатели
  function initInputs() {
    if (amountInput) {
      amountInput.addEventListener("input", () => {
        amountInput.value = amountInput.value.replace(/[^\d]/g, "");
        updateTotal();
      });
      amountInput.addEventListener("blur", () => {
        setQty(getQty()); // зажать в диапазон при потере фокуса
      });
    }

    if (usernameInput) {
      usernameInput.addEventListener("blur", () => {
        usernameInput.value = normalizeUsername(usernameInput.value);
        updateTotal();
      });
      usernameInput.addEventListener("input", () => {
        // не трогаем на лету, только пересчитываем доступность кнопок
        updateTotal();
      });
    }
  }

  // Кнопки оплаты
  function initPayButtons() {
    if (paySbpBtn)    paySbpBtn.addEventListener("click", () => initiatePayment("wata"));
    if (payCryptoBtn) payCryptoBtn.addEventListener("click", () => initiatePayment("heleket"));
  }

  // Инициализация
  function init() {
    try { tg && tg.ready && tg.ready(); } catch {}
    initBuyForMe();
    initInputs();
    initPayButtons();
    updateTotal(); // показать 0 ₽ и выставить disabled по состоянию
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
