/* =============================================================================
   STARS & PREMIUM — MAIN SCRIPT (универсальный)
   ========================================================================== */

const PRICE_PER_STAR = 1.6; // ₽ за 1 звезду

document.addEventListener('DOMContentLoaded', () => {
  const qtyEl = document.getElementById('starsQuantity');
  if (qtyEl) qtyEl.addEventListener('input', handleManualQuantityInput);
  updateStarsTotalAmount();
});

/* =============================================================================
   (⭐ STARS) РАСКРЫТЬ/СВЕРНУТЬ СПИСОК ПАКЕТОВ
   ========================================================================== */
function togglePackages() {
  const list =
    document.getElementById('additionalPackages') ||
    document.querySelector('.stars-packages-hidden');

  const btn =
    document.getElementById('togglePackages') ||
    document.querySelector('.stars-toggle');

  if (!list || !btn) return;

  const opened = list.classList.toggle('is-open');

  if (!list.classList.contains('stars-packages-hidden')) {
    list.style.display = opened ? 'block' : 'none';
    list.style.opacity = opened ? '1' : '0';
  }

  btn.textContent = opened ? 'Свернуть список пакетов' : 'Показать все пакеты';
}

/* =============================================================================
   (⭐ STARS) SELECT PACKAGE (выбор пакета)
   ========================================================================== */
function selectPackage(packageSize) {
  const starsInput = document.getElementById('starsQuantity');
  if (!starsInput) return;

  starsInput.value = packageSize;

  const starsSection =
    document.querySelector('.page-block--stars') ||
    document.getElementById('stars') ||
    document.querySelector('.stars-section');

  if (starsSection) {
    const allRadios =
      starsSection.querySelectorAll('.stars-package-radio, .package-radio');
    allRadios.forEach(input => (input.checked = false));

    const selected =
      starsSection.querySelector(`.stars-package-radio[value="${packageSize}"]`) ||
      starsSection.querySelector(`.package-radio[value="${packageSize}"]`);
    if (selected) selected.checked = true;
  }

  updateStarsTotalAmount();
}

/* =============================================================================
   (⭐ STARS) РУЧНОЙ ВВОД КОЛИЧЕСТВА
   ========================================================================== */
function handleManualQuantityInput() {
  const starsSection =
    document.querySelector('.page-block--stars') ||
    document.getElementById('stars') ||
    document.querySelector('.stars-section');

  if (starsSection) {
    const allRadios =
      starsSection.querySelectorAll('.stars-package-radio, .package-radio');
    allRadios.forEach(input => (input.checked = false));
  }

  updateStarsTotalAmount();
}

/* =============================================================================
   (⭐ STARS) ОБНОВЛЕНИЕ ИТОГОВОЙ СУММЫ
   ========================================================================== */
function updateStarsTotalAmount() {
  const qtyEl   = document.getElementById('starsQuantity');
  const totalEl = document.getElementById('totalAmount');
  if (!qtyEl || !totalEl) return;

  const qty = Number(qtyEl.value);
  let sum = 0;

  if (!Number.isNaN(qty) && qty >= 50 && qty <= 20000) {
    sum = qty * PRICE_PER_STAR;
  }

  totalEl.value = `${sum.toFixed(2)} ₽`;
}

/* =============================================================================
   (⭐ STARS) USERNAME helper
   ========================================================================== */
function updateTelegramUsername() {
  const input = document.getElementById('telegramUsername');
  if (!input) return;
  let username = input.value || '';
  if (username && !username.startsWith('@')) {
    username = '@' + username;
    input.value = username;
  }
}

/* =============================================================================
   (💎 PREMIUM) UI-ЛОГИКА (инициализация, сумма, подсветка, доступность кнопок)
   ========================================================================== */
(function premiumUI() {
  document.addEventListener('DOMContentLoaded', pmInit);

  /** Инициализация премиум-блока */
  function pmInit() {
    const premiumSection =
      document.querySelector('.page-block--premium') ||
      document.querySelector('.premium-section');
    if (!premiumSection) return;

    // радиокнопки пакетов
    const radios = premiumSection.querySelectorAll('.pm-radio');
    radios.forEach(r => r.addEventListener('change', pmRefreshUI));

    // кнопки оплаты (если есть отдельные id)
    const sbpBtn    = premiumSection.querySelector('#pmPaySbpBtn');
    const cryptoBtn = premiumSection.querySelector('#pmPayCryptoBtn');
    if (sbpBtn)    sbpBtn.addEventListener('click', () => window.payPremium?.('sbp_qr'));
    if (cryptoBtn) cryptoBtn.addEventListener('click', () => window.payPremium?.('crypto'));

    // поставить стартовое состояние
    pmRefreshUI();
  }

  /** Комплексное обновление UI */
  function pmRefreshUI() {
    const premiumSection =
      document.querySelector('.page-block--premium') ||
      document.querySelector('.premium-section');
    if (!premiumSection) return;

    const selected = pmGetSelectedRadio();
    const price    = selected ? pmGetPriceFromRadio(selected) : 0;

    pmReflectSelectionUI(selected);
    pmUpdateTotal(price);
    pmTogglePayButtons(!!selected && price > 0);
  }

  /** Получить выбранную радио */
  function pmGetSelectedRadio() {
    const premiumSection =
      document.querySelector('.page-block--premium') ||
      document.querySelector('.premium-section');
    if (!premiumSection) return null;
    return premiumSection.querySelector('.pm-radio:checked') ||
           document.querySelector('input[type="radio"][name="premiumPlan"]:checked');
  }

  /** Подсветить карточку выбранного пакета */
  function pmReflectSelectionUI(selectedRadio) {
    const premiumSection =
      document.querySelector('.page-block--premium') ||
      document.querySelector('.premium-section');
    if (!premiumSection) return;

    const items = premiumSection.querySelectorAll('.pm-item');
    items.forEach(item => item.classList.remove('is-selected'));

    if (selectedRadio) {
      const item = selectedRadio.closest('.pm-item');
      if (item) item.classList.add('is-selected');
    }
  }

  /** Вычислить цену пакета */
  function pmGetPriceFromRadio(radioEl) {
    if (!radioEl) return 0;

    // A) data-price на радио
    const dsPrice = radioEl.dataset ? radioEl.dataset.price : null;
    if (dsPrice && !isNaN(parseFloat(dsPrice))) {
      return parseFloat(dsPrice);
    }

    // B) из .pm-price текста
    const item = radioEl.closest('.pm-item');
    if (!item) return 0;

    const priceEl = item.querySelector('.pm-price');
    if (!priceEl) return 0;

    const raw = (priceEl.textContent || '')
      .replace(/\s|[^\d.,]/g, '')
      .replace(',', '.');

    const num = parseFloat(raw);
    return isNaN(num) ? 0 : num;
  }

  /** Проставить «Итого» (поддерживает input и span/div) */
  function pmUpdateTotal(price) {
    const el = document.getElementById('premiumTotal') || document.getElementById('pmTotal');
    if (!el) return;

    const text = price > 0 ? `${price.toFixed(2)} ₽` : '0 ₽';

    if ('value' in el) {
      el.value = text;     // если это <input>
    } else {
      el.textContent = text;
    }
  }

  /** Активировать/деактивировать кнопки оплаты премиума */
  function pmTogglePayButtons(enabled) {
    const premiumSection =
      document.querySelector('.page-block--premium') ||
      document.querySelector('.premium-section');
    if (!premiumSection) return;

    const sbpBtn    = premiumSection.querySelector('#pmPaySbpBtn');
    const cryptoBtn = premiumSection.querySelector('#pmPayCryptoBtn');
    [sbpBtn, cryptoBtn].forEach(btn => {
      if (!btn) return;
      btn.disabled = !enabled;
      btn.style.opacity = enabled ? '1' : '0.6';
      btn.style.pointerEvents = enabled ? 'auto' : 'none';
    });
  }

  /** Глобальная: автопрефикс @ для username премиума */
  window.updateTelegramUsernamePremium = function () {
    const input = document.getElementById('telegramUsernamePremium');
    if (!input) return;
    let username = input.value || '';
    if (username && !username.startsWith('@')) {
      username = '@' + username;
      input.value = username;
    }
  };
})();

/* =============================================================================
   FAQ (sbx-faq): аккордеон
   ========================================================================== */
(function () {
  document.addEventListener('DOMContentLoaded', initSbxFaq);

  function initSbxFaq() {
    const faq = document.querySelector('.sbx-faq');
    if (!faq) return;

    const allowMultiOpen = true;

    const items = faq.querySelectorAll('.sbx-faq__item');
    items.forEach(item => {
      const btn    = item.querySelector('.sbx-faq__q');
      const answer = item.querySelector('.sbx-faq__a');
      if (!btn || !answer) return;

      btn.addEventListener('click', () => {
        const isOpen = item.classList.contains('is-open');

        if (!allowMultiOpen) {
          items.forEach(other => {
            if (other !== item) closeItem(other);
          });
        }

        isOpen ? closeItem(item) : openItem(item);
      });

      closeItem(item, true);
    });

    function openItem(item) {
      const btn    = item.querySelector('.sbx-faq__q');
      const answer = item.querySelector('.sbx-faq__a');
      const inner  = item.querySelector('.sbx-faq__a-inner');
      if (!btn || !answer || !inner) return;

      answer.style.maxHeight = inner.offsetHeight + 18 + 'px';
      item.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
    }

    function closeItem(item, immediate = false) {
      const btn    = item.querySelector('.sbx-faq__q');
      const answer = item.querySelector('.sbx-faq__a');
      if (!btn || !answer) return;

      if (immediate) {
        answer.style.maxHeight = '0px';
      } else {
        answer.style.maxHeight = '0px';
      }
      item.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    }
  }
})();

/* =============================================================================
   UX/VALIDATION/UTILS
   ========================================================================== */
const TG_RE = /^@?[a-zA-Z0-9_]{5,32}$/;

function setMsg(el, text) {
  if (!el) return;
  if (text) {
    el.textContent = text;
    el.hidden = false;
  } else {
    el.textContent = '';
    el.hidden = true;
  }
}

function fmtRUB(n) {
  const v = Number.isFinite(+n) ? +n : 0;
  return v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-scroll]');
  if (!a) return;
  const sel = a.getAttribute('data-scroll');
  const target = document.querySelector(sel);
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

const LS_KEY_USER = 'sbx_username';

function validateUsername(inputEl, msgEl) {
  if (!inputEl) return false;
  let v = (inputEl.value || '').trim();
  if (v && !v.startsWith('@')) {
    v = '@' + v;
    inputEl.value = v;
  }
  const ok = !!v && TG_RE.test(v);
  inputEl.classList.toggle('input--error', !ok);
  setMsg(msgEl, ok ? '' : 'Введите корректный Telegram username (5–32 символов: латиница, цифры, подчёркивание).');
  return ok;
}

function validateStarsQty(inputEl, msgEl) {
  if (!inputEl) return false;
  const n = Number(inputEl.value);
  const ok = Number.isInteger(n) && n >= 50 && n <= 20000;
  inputEl.classList.toggle('input--error', !ok);
  setMsg(msgEl, ok ? '' : 'Количество должно быть от 50 до 20 000.');
  return ok;
}

function toggleStarsPay(disabled) {
  document
    .querySelectorAll('.stars-payment-actions .stars-btn')
    .forEach(btn => btn.toggleAttribute('disabled', !!disabled));
}

function togglePremiumPay(disabled) {
  document
    .querySelectorAll('.pm-pay-actions .pm-pay-btn')
    .forEach(btn => btn.toggleAttribute('disabled', !!disabled));
}

function refreshStarsSelectionUI() {
  const cards = document.querySelectorAll('.stars-package-item');
  const checked = document.querySelector('.stars-package-radio:checked, .package-radio:checked');
  cards.forEach(c => c.classList.remove('is-selected'));
  if (checked) {
    const card = checked.closest('.stars-package-item');
    if (card) card.classList.add('is-selected');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const starsUser = document.getElementById('telegramUsername');
  const starsUserMsg = document.getElementById('starsUsernameMsg');
  const starsQty = document.getElementById('starsQuantity');
  const starsQtyMsg = document.getElementById('starsQtyMsg');

  const pmUser = document.getElementById('telegramUsernamePremium');
  const pmUserMsg = document.getElementById('pmUsernameMsg');

  if (starsUser) {
    starsUser.addEventListener('input', () => {
      validateUsername(starsUser, starsUserMsg);
      const validAll = validateUsername(starsUser, starsUserMsg) && validateStarsQty(starsQty, starsQtyMsg);
      toggleStarsPay(!validAll);
    });
  }
  if (starsQty) {
    starsQty.addEventListener('input', () => {
      validateStarsQty(starsQty, starsQtyMsg);
      const validAll = validateUsername(starsUser, starsUserMsg) && validateStarsQty(starsQty, starsQtyMsg);
      toggleStarsPay(!validAll);
      refreshStarsSelectionUI();
    });
  }
  if (pmUser) {
    pmUser.addEventListener('input', () => {
      validateUsername(pmUser, pmUserMsg);
      togglePremiumPay(!validateUsername(pmUser, pmUserMsg));
    });
  }

  toggleStarsPay(!(validateUsername(starsUser, starsUserMsg) && validateStarsQty(starsQty, starsQtyMsg)));
  togglePremiumPay(!validateUsername(pmUser, pmUserMsg));

  document.querySelectorAll('.stars-package-radio, .package-radio').forEach(r => {
    r.addEventListener('change', (e) => {
      const v = parseInt(e.target.value, 10);
      const qty  = document.getElementById('starsQuantity');
      const user = document.getElementById('telegramUsername');
      const msgU = document.getElementById('starsUsernameMsg');
      const msgQ = document.getElementById('starsQtyMsg');

      if (qty && Number.isFinite(v)) {
        qty.value = String(v);
        if (typeof updateStarsTotalAmount === 'function') updateStarsTotalAmount();
      }

      const okU = validateUsername(user, msgU);
      const okQ = validateStarsQty(qty, msgQ);
      toggleStarsPay(!(okU && okQ));

      refreshStarsSelectionUI();
    });
  });
});

/* =============================================================================
   LEGAL MODAL
   ========================================================================== */
(function(){
  let lastActive=null;
  const modal=document.getElementById('legalModal');
  const body =document.getElementById('legalModalBody');
  const title=document.getElementById('legalModalTitle');
  const TITLES={offer:'Публичная оферта',privacy:'Политика конфиденциальности','personal-data':'Обработка персональных данных'};

  function tpl(id){const t=document.getElementById(id);return t&&'content'in t?t.content.cloneNode(true):null;}
  function openDoc(key){
    const frag=tpl(`doc-${key}`); if(!frag) return;
    title.textContent=TITLES[key]||'Документ';
    body.innerHTML=''; body.appendChild(frag);
    modal.classList.add('is-open'); document.body.classList.add('sbx-modal-open'); modal.setAttribute('aria-hidden','false');
    setTimeout(()=>{(body.querySelector('h1, h2, p, a, button, [tabindex]')||body).focus({preventScroll:true});},0);
  }
  function closeModal(){
    modal.classList.remove('is-open'); document.body.classList.remove('sbx-modal-open'); modal.setAttribute('aria-hidden','true'); body.innerHTML='';
    if(lastActive){try{lastActive.focus();}catch(e){}}
  }

  document.addEventListener('click',e=>{
    const t=e.target.closest('[data-modal-doc]'); if(t){e.preventDefault(); lastActive=t; openDoc(t.getAttribute('data-modal-doc')); return;}
    if(e.target.closest('[data-close-modal]')){e.preventDefault(); closeModal(); return;}
    if(e.target.closest('[data-print-modal]')){e.preventDefault();
      const win=window.open('','_blank'); if(win){win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title.textContent}</title><style>body{font-family:var(--font-main,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif);color:#000}h1,h2{margin:0 0 8px}</style></head><body>${body.innerHTML}</body></html>`); win.document.close(); win.focus(); win.print();}}
  });
  document.addEventListener('keydown',e=>{if(modal.classList.contains('is-open')&&e.key==='Escape'){e.preventDefault(); closeModal();}});
  if (modal) modal.addEventListener('click',e=>{if(e.target.classList.contains('sbx-modal__backdrop')) closeModal();});
})();

/* =============================================================================
   HERO SCROLL helpers
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  bindHeroScroll('.buy-stars',   '#stars');
  bindHeroScroll('.buy-premium', '#premium');
});

function bindHeroScroll(btnSel, targetSel){
  const btn = document.querySelector(btnSel);
  const target = document.querySelector(targetSel);
  if (!btn || !target) return;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const nav = document.querySelector('.navbar');
    const offset = nav ? nav.getBoundingClientRect().height + 12 : 0;
    const top = window.pageYOffset + target.getBoundingClientRect().top - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  });
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href^="#"]');
  if (!link) return;
  if (link.hasAttribute('data-modal-doc')) return;

  const hash = link.getAttribute('href');
  if (!hash || hash === '#') return;

  const target = document.querySelector(hash);
  if (!target) return;

  e.preventDefault();

  const nav = document.querySelector('.navbar');
  const extra = 12;
  const offset = (nav ? nav.getBoundingClientRect().height : 0) + extra;

  const top = window.pageYOffset + target.getBoundingClientRect().top - offset;
  window.scrollTo({ top, behavior: 'smooth' });
});

/* =============================================================================
   Ограничение ввода username
   ========================================================================== */
(function () {
  const ALLOWED_ONE = /[@A-Za-z0-9_]/;
  const CLEAN_REST  = /[^A-Za-z0-9_]/g;
  const MAX_LEN_NO_AT = 32;

  function normalizeUsername(raw, { forceAt = true } = {}) {
    if (!raw) return "";
    raw = raw.replace(/\s+/g, "");
    const hasAt = raw.startsWith("@");
    let body = (hasAt ? raw.slice(1) : raw).replace(CLEAN_REST, "");
    if (body.length > MAX_LEN_NO_AT) body = body.slice(0, MAX_LEN_NO_AT);
    return (forceAt && body ? "@" : (hasAt ? "@" : "")) + body;
  }

  function attachUsernameGuards(input) {
    if (!input) return;

    input.addEventListener("beforeinput", (e) => {
      if (e.inputType === "insertText" && e.data && !ALLOWED_ONE.test(e.data)) {
        e.preventDefault();
      }
    });

    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text") || "";
      const safe = normalizeUsername(text, { forceAt: true });
      document.execCommand("insertText", false, safe);
    });

    input.addEventListener("input", () => {
      const safe = normalizeUsername(input.value, { forceAt: true });
      if (input.value !== safe) input.value = safe;
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    attachUsernameGuards(document.getElementById("telegramUsername"));
    attachUsernameGuards(document.getElementById("telegramUsernamePremium"));
  });
})();

/* =============================================================================
   Плавный якорный скролл с учётом фикс-меню
   ========================================================================== */
(function () {
  const root = document.documentElement;
  const nav  = document.querySelector('.navbar');

  function setNavHeightVar() {
    const h = nav ? nav.offsetHeight : 0;
    root.style.setProperty('--nav-height', h + 'px');
  }
  window.addEventListener('load', setNavHeightVar);
  window.addEventListener('resize', () => requestAnimationFrame(setNavHeightVar));
  setNavHeightVar();

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;

    const id = a.getAttribute('href');
    if (!id || id === '#') return;

    const target = document.querySelector(id);
    if (!target) return;

    e.preventDefault();

    const offset = parseFloat(getComputedStyle(root).getPropertyValue('--nav-height')) || 0;
    const top = target.getBoundingClientRect().top + window.pageYOffset - offset - 8;

    window.scrollTo({ top, behavior: 'smooth' });
    history.pushState(null, '', id);
  });
})();

// Совместимость: legacy inline handler
window.updatePrice = function(){ if (typeof handleManualQuantityInput === 'function') handleManualQuantityInput(); };

/* =============================================================================
   MOBILE halo fade + lift on scroll (визуал)
   ========================================================================== */
(function(){
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mq     = window.matchMedia('(max-width: 768px)');
  const hero   = document.querySelector('.hero');
  const halo   = document.querySelector('.hero .decor--halo-overlap');
  if (!hero || !halo) return;

  const SHIFT_MAX = 240;
  let ticking = false;

  const easeOut = x => 1 - (1 - x) * (1 - x);
  function update(){
    ticking = false;

    if (!mq.matches || reduce.matches){
      halo.style.removeProperty('--halo-mobile-shift');
      halo.style.removeProperty('--halo-mobile-opacity');
      return;
    }

    const rect = hero.getBoundingClientRect();
    const vh   = window.innerHeight || 1;

    const scrolled = Math.max(0, -rect.top);
    let p = Math.min(1, scrolled / (vh * 0.8));
    p = easeOut(p);

    const shift   = -SHIFT_MAX * p;
    const opacity = 1 - p;

    halo.style.setProperty('--halo-mobile-shift',   shift.toFixed(1) + 'px');
    halo.style.setProperty('--halo-mobile-opacity', opacity.toFixed(3));
  }

  function onScroll(){
    if (!ticking){ ticking = true; requestAnimationFrame(update); }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => requestAnimationFrame(update));
  window.addEventListener('load',   update);
  update();
})();

/* =============================================================================
   🧩 ПЛАТЁЖНАЯ ИНТЕГРАЦИЯ
   ========================================================================== */
(function () {
  // helpers
  function $(sel)       { return document.querySelector(sel); }
  function $all(sel)    { return Array.from(document.querySelectorAll(sel)); }
  function getVal(el)   { return (el && (el.value ?? el.textContent) || '').trim(); }

  // из поля «Итого» — строка 'рубли.копейки' (без округления вверх)
  function readAmountStrFrom(el) {
    if (!el) return null;
    const raw = (('value' in el) ? el.value : el.textContent) || '';
    const num = raw.replace(/\s|[^\d.,-]/g, '').replace(',', '.');
    if (!num) return null;
    const m = num.match(/^(-?\d+)(?:\.(\d+))?$/);
    if (!m) return null;
    const intPart = m[1];
    let frac = (m[2] || '');
    if (frac.length > 2) frac = frac.slice(0, 2);
    while (frac.length < 2) frac += '0';
    return `${intPart}.${frac}`;
  }

  function pick(selectors) {
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  }

  async function createOrder(payload) {
    const res = await fetch('/pay/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { /* not JSON */ }

    if (!res.ok) {
      const msg =
        (data && (data.error || data.detail)) ||
        text ||
        `HTTP ${res.status}`;
      throw new Error(msg);
    }
    if (!data || typeof data !== 'object') {
      throw new Error('Empty response from /pay/initiate');
    }
    return data;
  }

  // --- STARS ---------------------------------------------------------
  function readStarsForm() {
    const usernameEl = pick([
      '#telegramUsername', '[name="telegramUsername"]',
      '#username', '[name="username"]'
    ]);
    const qtyEl = pick([
      '#starsQuantity', '[name="starsQuantity"]', '[name="starsQty"]'
    ]);
    const totalEl = pick([
      '#totalAmount', '[data-stars-amount]', '#starsAmount', '[name="starsAmount"]'
    ]);

    const username = getVal(usernameEl);
    let qty = parseInt(getVal(qtyEl).replace(/[^\d]/g,''), 10);
    if (Number.isNaN(qty)) qty = 0;

    const amount_str = readAmountStrFrom(totalEl);
    return { username, qty, amount_str };
  }

  function disableStarsButtons(disabled) {
    document
      .querySelectorAll('.stars-payment-actions .stars-btn, .stars-actions .stars-btn, .stars-actions button')
      .forEach(b => { b.disabled = !!disabled; b.style.opacity = disabled ? '0.6' : '1'; });
  }

  async function payStars(provider) {
    const { username, qty, amount_str } = readStarsForm();
    if (!username)         { alert('Введите Telegram username'); return; }
    if (!qty || qty < 1)   { alert('Укажите количество звёзд');  return; }
    if (!amount_str)       { alert('Итоговая сумма не определена'); return; }

    try {
      disableStarsButtons(true);
      const payload = {
        provider,                // 'wata' | 'heleket'
        product: 'stars',
        username,
        qty,
        currency: 'RUB',
        amount_str,              // ← точная сумма из поля «Итого»
        description: `Stars x${qty} for ${username}`
      };

      const resp = await createOrder(payload);
      if (resp.ok && resp.payment_url) {
        window.location.href = resp.payment_url;
        return;
      }
      alert('Ошибка создания оплаты: ' + (resp && (resp.error || resp.detail) || 'неизвестно'));
    } catch (e) {
      console.error(e);
      alert('Сеть/сервер недоступны: ' + e.message);
    } finally {
      disableStarsButtons(false);
    }
  }

  // глобально для существующих кнопок
  window.payBySBP    = () => payStars('wata');
  window.payByCrypto = () => payStars('heleket');

  // --- PREMIUM -------------------------------------------------------
  function pmGetSelectedRadio() {
    const premiumSection =
      document.querySelector('.page-block--premium') ||
      document.querySelector('.premium-section');
    if (!premiumSection) return null;
    return premiumSection.querySelector('.pm-radio:checked') ||
           document.querySelector('input[type="radio"][name="premiumPlan"]:checked');
  }

  function pmGetPriceFromRadio(radioEl) {
    if (!radioEl) return 0;
    const dsPrice = radioEl.dataset ? radioEl.dataset.price : null;
    if (dsPrice && !isNaN(parseFloat(dsPrice))) return parseFloat(dsPrice);
    const item = radioEl.closest('.pm-item');
    if (!item) return 0;
    const priceEl = item.querySelector('.pm-price');
    if (!priceEl) return 0;
    const raw = (priceEl.textContent || '')
      .replace(/\s|[^\d.,]/g, '')
      .replace(',', '.');
    const num = parseFloat(raw);
    return isNaN(num) ? 0 : num;
  }

  function readPremiumForm() {
    const usernameEl = document.getElementById('telegramUsernamePremium') ||
                       document.getElementById('premiumUsername') ||
                       document.getElementById('telegramUsername');
    const username = usernameEl ? (usernameEl.value || '').trim() : '';

    const radio = pmGetSelectedRadio();
    let months = 0;
    if (radio) {
      const v = radio.value || '';
      const m = String(v).match(/^(\d+)m$/i);
      months = m ? parseInt(m[1],10) : parseInt(radio.getAttribute('data-months')||'0',10) || 0;
    }

    const totalEl = document.getElementById('premiumTotal') || document.getElementById('pmTotal');
    const amount_str = readAmountStrFrom(totalEl);

    return { username, months, amount_str };
  }

  function disablePremiumButtons(disabled){
    document
      .querySelectorAll('.pm-pay-actions .pm-pay-btn, .premium-actions button')
      .forEach(b => { b.disabled = !!disabled; b.style.opacity = disabled ? '0.6' : '1'; });
  }

  window.payPremium = async function(method) {
    const { username, months, amount_str } = readPremiumForm();
    if (!username)  { alert('Введите Telegram username'); return; }
    if (!months)    { alert('Выберите срок подписки');   return; }
    if (!amount_str){ alert('Итоговая сумма не определена'); return; }

    const provider = (method === 'crypto') ? 'heleket' : 'wata';
    try {
      disablePremiumButtons(true);
      const resp = await createOrder({
        provider,
        product: 'premium',
        username,
        premiumMonths: months,
        qty: 1,
        currency: 'RUB',
        amount_str,  // ← точная сумма из поля «Итого»
        description: `Telegram Premium ${months}m for ${username}`
      });
      if (resp.ok && resp.payment_url) {
        window.location.href = resp.payment_url;
      } else {
        alert('Ошибка создания оплаты: ' + (resp && (resp.error || resp.detail) || 'неизвестно'));
      }
    } catch (e) {
      console.error(e);
      alert('Сеть/сервер недоступны: ' + e.message);
    } finally {
      disablePremiumButtons(false);
    }
  };
})();

