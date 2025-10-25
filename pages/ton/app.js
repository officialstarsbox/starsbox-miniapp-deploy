/* ========= REF (inbound, session-only, new format) ========= */
(function () {
  // если глобальный app.js уже определил getRefCode — не переопределяем
  if (typeof window.getRefCode === 'function') return;

  const KEY = 'sb_in_ref';
  // допустим A–Z0–9 длиной 3..32 (твой бэк сейчас принимает такие)
  const RE = /^[A-Z0-9]{3,32}$/;

  function save(code) {
    try {
      if (!RE.test(code)) return;
      sessionStorage.setItem(KEY, code);
    } catch {}
  }
  function load() {
    try {
      const v = sessionStorage.getItem(KEY);
      return RE.test(v || '') ? v : null;
    } catch {
      return null;
    }
  }
  function parseInbound() {
    const tg = window.Telegram?.WebApp;
    let raw =
      tg?.initDataUnsafe?.start_param ??
      new URL(location.href).searchParams.get('startapp') ??
      new URL(location.href).searchParams.get('start') ??
      new URL(location.href).searchParams.get('ref') ??
      null;

    if (!raw) return null;
    raw = String(raw).trim();

    // ожидаем формы "ref:CODE" или просто "CODE"
    let code = null;
    const m = raw.match(/^ref[:=_-]+([A-Za-z0-9]{3,32})$/i);
    if (m) code = m[1];
    else if (/^[A-Za-z0-9]{3,32}$/.test(raw)) code = raw;

    return code ? code.toUpperCase() : null;
  }

  const inbound = parseInbound();
  if (inbound) save(inbound);

  // публичный API: вернуть входящий код рефовода (если есть)
  window.getRefCode = () => load();
})();

/* ========= UI helpers (username, inputs) ========= */
(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  // нормализация username: @ + [A-Za-z0-9_]{1,32}
  function normalizeWithAt(raw) {
    const core = String(raw || '')
      .replace(/@/g, '')
      .replace(/[^A-Za-z0-9_]/g, '')
      .slice(0, 32);
    return core ? '@' + core : '';
  }

  function getSelfUsername() {
    try {
      const u = window.Telegram?.WebApp?.initDataUnsafe?.user?.username;
      if (u) return String(u).replace(/[^A-Za-z0-9_]/g, '').slice(0, 32);
    } catch {}
    try {
      const q = new URLSearchParams(location.search).get('tg_username');
      return q ? String(q).replace(/[^A-Za-z0-9_]/g, '').slice(0, 32) : null;
    } catch {
      return null;
    }
  }

  ready(function () {
    const usernameInput = document.getElementById('tgUsername');
    const buySelfBtn = document.getElementById('buyForMeBtn');

    if (usernameInput) {
      usernameInput.addEventListener('input', () => {
        const v = usernameInput.value;
        const nv = normalizeWithAt(v);
        if (v !== nv) {
          usernameInput.value = nv;
          try { usernameInput.setSelectionRange(nv.length, nv.length); } catch {}
        }
      });
      usernameInput.addEventListener('blur', () => {
        if (usernameInput.value === '@') usernameInput.value = '';
      });
      usernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); usernameInput.blur(); }
      });
    }

    if (buySelfBtn && usernameInput) {
      buySelfBtn.addEventListener('click', () => {
        const me = getSelfUsername();
        if (!me) {
          window.Telegram?.WebApp?.showToast?.('В вашем профиле Telegram не указан username');
          return;
        }
        usernameInput.value = '@' + me;
        usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
        usernameInput.blur();
      });
    }

    // свернуть клавиатуру по тапу вне полей
    function blurIfOutside(e) {
      const ae = document.activeElement;
      if (!ae) return;
      const isInput = ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA';
      if (!isInput) return;
      if (ae.contains(e.target)) return;
      ae.blur();
    }
    document.addEventListener('pointerdown', blurIfOutside, { capture: true });
    document.addEventListener('touchstart', blurIfOutside, { capture: true });
  });
})();

/* ========= TON amount: 1..300 ========= */
(function () {
  const tonAmount = document.getElementById('tonAmount');
  if (!tonAmount) return;

  const digitsOnly = (s) => String(s || '').replace(/\D+/g, '');

  function sanitize() {
    const raw = tonAmount.value;
    let nv = digitsOnly(raw).slice(0, 3);

    if (nv === '') {
      tonAmount.value = '';
      return;
    }
    let n = Number(nv);
    if (n > 300) n = 300;
    if (n < 1) {
      tonAmount.value = '';
      return;
    }
    nv = String(n);
    if (tonAmount.value !== nv) {
      tonAmount.value = nv;
      try { tonAmount.setSelectionRange(nv.length, nv.length); } catch {}
    }
  }

  tonAmount.addEventListener('input', sanitize);
  tonAmount.addEventListener('beforeinput', (e) => {
    if (e.inputType === 'insertText' && /\D/.test(e.data)) e.preventDefault();
  });
  tonAmount.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); tonAmount.blur(); }
  });
})();

/* ========= TON total (₽) ========= */
(function () {
  const amountEl = document.getElementById('tonAmount');
  const totalEl = document.getElementById('tonTotalValue');
  const cardEl = document.getElementById('tonTotalCard');
  if (!amountEl || !totalEl || !cardEl) return;

  const nfRub2 = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function getRate() {
    const fromWin = Number(window.TON_RATE);
    if (!isNaN(fromWin) && fromWin > 0) return fromWin;
    const fromAttr = Number(cardEl.dataset.rate);
    if (!isNaN(fromAttr) && fromAttr > 0) return fromAttr;
    return 300;
  }

  function renderTotal() {
    const qty = Number((amountEl.value || '').replace(/\D+/g, ''));
    if (!(qty >= 1 && qty <= 300)) {
      totalEl.textContent = `${nfRub2.format(0)} руб.`;
      return;
    }
    const sum = qty * getRate();
    totalEl.textContent = `${nfRub2.format(sum)} руб.`;
  }

  amountEl.addEventListener('input', renderTotal);
  renderTotal();
})();

/* ========= enable/disable pay buttons ========= */
(function () {
  const usernameEl = document.getElementById('tgUsername');
  const amountEl = document.getElementById('tonAmount');
  const totalEl = document.getElementById('tonTotalValue');
  const cardEl = document.getElementById('tonTotalCard');
  const payBtns = [document.getElementById('paySbpBtn'), document.getElementById('payCryptoBtn')].filter(Boolean);
  if (!amountEl || !totalEl || !cardEl || payBtns.length === 0) return;

  const nfRub2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function getRate() {
    const fromWin = Number(window.TON_RATE);
    if (!isNaN(fromWin) && fromWin > 0) return fromWin;
    const fromAttr = Number(cardEl.dataset.rate);
    if (!isNaN(fromAttr) && fromAttr > 0) return fromAttr;
    return 300;
  }

  function usernameValid() {
    const v = (usernameEl?.value || '').trim();
    return /^@[A-Za-z0-9_]{1,32}$/.test(v);
  }

  function amountValid() {
    const n = Number((amountEl?.value || '').replace(/\D+/g, ''));
    return n >= 1 && n <= 300 ? n : null;
  }

  function setButtonsEnabled(on) {
    payBtns.forEach((b) => {
      b.disabled = !on;
      b.setAttribute('aria-disabled', String(!on));
    });
  }

  function render() {
    const qty = amountValid();
    const sum = qty ? qty * getRate() : 0;
    totalEl.textContent = `${nfRub2.format(sum)} руб.`;
    setButtonsEnabled(usernameValid() && sum > 0);
  }

  usernameEl?.addEventListener('input', render);
  amountEl?.addEventListener('input', render);
  setButtonsEnabled(false);
  render();
})();

/* ========= backend integration (initiate) ========= */
(function () {
  const API_BASE = 'https://api.starsbox.org';
  const PRODUCT = 'ton';
  const CURRENCY = 'RUB';
  const MIN_TON = 1;
  const MAX_TON = 300;

  const THANKS_SUCCESS = window.PAY_SUCCESS_URL || (location.origin + '/pages/pay/success/');
  const THANKS_FAIL    = window.PAY_FAIL_URL    || (location.origin + '/pages/pay/fail/');

  const $ = (s) => document.querySelector(s);
  const tg = window.Telegram?.WebApp || null;

  const usernameInput = $('#tgUsername');
  const amountInput = $('#tonAmount');
  const totalCard = $('#tonTotalCard');
  const totalValue = $('#tonTotalValue');
  const paySbpBtn = $('#paySbpBtn');
  const payCryptoBtn = $('#payCryptoBtn');

  const RATE = (() => {
    const raw = totalCard?.dataset?.rate || '1';
    const v = parseFloat(String(raw).replace(',', '.'));
    return Number.isFinite(v) ? v : 1;
  })();

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function normalizeUsername(v) {
    if (!v) return '';
    let s = String(v).trim();
    if (!s) return '';
    if (s.startsWith('@')) return s;
    if (/^[A-Za-z0-9_]+$/.test(s)) return '@' + s;
    return s;
  }

  function getQty() {
    const raw = amountInput?.value || '';
    const n = parseInt(raw.replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(n)) return 0;
    return clamp(n, MIN_TON, MAX_TON);
  }

  function updateTotal() {
    const qty = getQty();
    const amountRub = qty * RATE;
    const amountMinor = Math.round(amountRub * 100);
    totalValue.textContent = qty ? new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(amountRub) : '0,00 руб.';
    totalValue.dataset.amountMinor = String(amountMinor);
    totalValue.dataset.qty = String(qty);
  }

  function setLoading(is) {
    [paySbpBtn, payCryptoBtn].forEach((b) => {
      if (!b) return;
      b.disabled = !!is;
      b.classList.toggle('is-loading', !!is);
      b.setAttribute('aria-disabled', String(!!is));
    });
  }

  function openLink(url) {
    if (!url) return;
    if (typeof window.openInsideTelegram === 'function') {
      try { window.openInsideTelegram(url); return; } catch {}
    }
    if (tg && typeof tg.openLink === 'function') {
      try { tg.openLink(url); return; } catch {}
    }
    location.href = url;
  }

  async function initiatePayment(provider) {
    try {
      setLoading(true);

      const username = normalizeUsername(usernameInput?.value || '');
      if (!username) throw new Error('Укажите username получателя (например, @username).');

      const qty = getQty();
      if (!qty || qty < MIN_TON || qty > MAX_TON) throw new Error(`Укажите количество TON от ${MIN_TON} до ${MAX_TON}.`);

      const amountMinor = Number(totalValue.dataset.amountMinor || '0');
      if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new Error('Сумма к оплате не рассчитана.');

      const payload = {
        provider,              // "wata" | "heleket"
        product: PRODUCT,      // "ton"
        tg_username: username, // для TON на бэке
        ton_amount: qty,       // целые TON (бэк сам сконвертит в nanotons)
        username,              // для логов
        qty,
        amount_minor: amountMinor,
        currency: CURRENCY,

        // 🔗 входящий код рефовода (если пришёл в сессию)
        ref_code: (typeof window.getRefCode === 'function' ? window.getRefCode() : null) || undefined,

        // 👤 плательщик (для write-once binding на бэке)
        actor_tg_id: tg?.initDataUnsafe?.user?.id || undefined,

        // возвраты
        success_url: THANKS_SUCCESS,
        fail_url: THANKS_FAIL
      };

      const r = await fetch(`${API_BASE}/pay/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText} ${await r.text().catch(()=> '')}`);

      const d = await r.json();
      if (!d?.ok || !d.payment_url) throw new Error(`Некорректный ответ сервера: ${JSON.stringify(d)}`);

      openLink(d.payment_url);
    } catch (e) {
      console.error('[pay/initiate ton] error:', e);
      alert(e?.message || e);
    } finally {
      setLoading(false);
    }
  }

  function init() {
    try { tg?.ready?.(); } catch {}
    updateTotal();

    const amountInput = document.getElementById('tonAmount');
    const usernameInput = document.getElementById('tgUsername');
    amountInput?.addEventListener('input', updateTotal);
    usernameInput?.addEventListener('input', updateTotal);

    document.getElementById('paySbpBtn')?.addEventListener('click', () => initiatePayment('wata'));
    document.getElementById('payCryptoBtn')?.addEventListener('click', () => initiatePayment('heleket'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

