(function(){
  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
  const $ = (s, r) => (r || document).querySelector(s);

  // нормализация: только латиница/цифры/_, длина 32, и лидирующий '@' если есть хоть 1 символ
  function normalizeWithAt(raw){
    const core = String(raw || '')
      .replace(/@/g, '')               // убираем все '@' из ядра
      .replace(/[^A-Za-z0-9_]/g, '')   // разрешаем только латиницу/цифры/_ (кириллицу режем)
      .slice(0, 32);
    return core ? '@' + core : '';
  }

  // username пользователя из Telegram WebApp или ?tg_username=... (для локальных тестов)
  function getSelfUsername(){
    try{
      const tg = window.Telegram && window.Telegram.WebApp;
      tg?.ready?.();
      const u = tg?.initDataUnsafe?.user?.username;
      if (u) return String(u).replace(/[^A-Za-z0-9_]/g, '').slice(0, 32);
    }catch{}
    try{
      const q = new URLSearchParams(location.search).get('tg_username');
      return q ? String(q).replace(/[^A-Za-z0-9_]/g, '').slice(0, 32) : null;
    }catch{
      return null;
    }
  }

  ready(() => {
    const usernameInput = $('#tgUsername');

    // фильтрация + автоподстановка '@'
    if (usernameInput){
      usernameInput.addEventListener('input', () => {
        const v  = usernameInput.value;
        const nv = normalizeWithAt(v);
        if (v !== nv){
          usernameInput.value = nv;
          // ставим курсор в конец, чтобы не «прыгало»
          try{ usernameInput.setSelectionRange(nv.length, nv.length); }catch(e){}
        }
      });

      // если пользователь оставил только '@' — очищаем при blur
      usernameInput.addEventListener('blur', () => {
        if (usernameInput.value === '@') usernameInput.value = '';
      });

      // Enter => blur (сворачиваем мобильную клавиатуру)
      usernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter'){ e.preventDefault(); usernameInput.blur(); }
      });
    }

    // «купить себе» — подставляем @username из Telegram
    const buySelfBtn = $('#buyForMeBtn');
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

    // Сворачиваем клавиатуру по тапу вне поля
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

(function(){
  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
  const nf = new Intl.NumberFormat('ru-RU');

  ready(() => {
    const list = document.getElementById('subsPacks');
    if (!list) return;

    // первичная инициализация иконок и цен
    list.querySelectorAll('.pack-item').forEach(btn => {
      const img = btn.querySelector('.pack-icon img');
      const icon = btn.getAttribute('data-icon');
      if (img && icon) img.src = icon;

      const priceEl = btn.querySelector('[data-price-el]');
      const price = Number(btn.getAttribute('data-price') || 0);
      if (priceEl) priceEl.textContent = `${nf.format(price)} ₽`;
    });

    let active = null;

    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.pack-item');
      if (!btn) return;

      // если повторный клик по активному — снимаем выбор
      if (active === btn){
        setActive(null);
      }else{
        setActive(btn);
      }
    });

    function setActive(btn){
      // снять с прошлого
      if (active){
        active.classList.remove('is-active');
        active.setAttribute('aria-pressed', 'false');
        const oldImg = active.querySelector('.pack-icon img');
        const defIco = active.getAttribute('data-icon');
        if (oldImg && defIco) oldImg.src = defIco;
      }

      active = btn || null;

      // проставить на новом
      if (active){
        active.classList.add('is-active');
        active.setAttribute('aria-pressed', 'true');
        const newImg = active.querySelector('.pack-icon img');
        const actIco = active.getAttribute('data-icon-active');
        if (newImg && actIco) newImg.src = actIco;

        // сохраним выбор (месяцы и цена) — пригодится дальше
        const months = Number(active.getAttribute('data-months') || 0);
        const price  = Number(active.getAttribute('data-price')  || 0);
        window.PREMIUM_PLAN = { months, price };
        window.dispatchEvent(new CustomEvent('premium:plan-change', { detail: window.PREMIUM_PLAN }));
      }else{
        window.PREMIUM_PLAN = null;
        window.dispatchEvent(new CustomEvent('premium:plan-change', { detail: null }));
      }
    }
  });
})();

// ===== Итог к оплате (по выбранному пакету) =====
(function(){
  const totalEl = document.getElementById('totalValue');
  const durationCard = document.getElementById('durationCard'); // контейнер с пакетами

  if (!totalEl || !durationCard) return;

  const nfRub2 = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function getSelectedPrice(){
    const active = durationCard.querySelector('.pack-item.is-active');
    const p = Number(active?.getAttribute('data-price') || 0);
    return Number.isFinite(p) ? p : 0;
  }

  function renderTotal(){
    const sum = getSelectedPrice();         // если пакет не выбран — 0
    totalEl.textContent = `${nfRub2.format(sum)} руб.`;
  }

  // Пересчитываем при любом клике/изменении внутри блока пакетов
  durationCard.addEventListener('click', (e) => {
    if (e.target.closest('.pack-item')) {
      // даём времени классу .is-active обновиться (если логика переключения в другом обработчике)
      queueMicrotask(renderTotal);
    }
  });

  // первичный вывод
  renderTotal();
})();

// ===== Включение/выключение платёжных кнопок по условиям =====
(function(){
  const usernameInput = document.getElementById('tgUsername');
  const durationCard  = document.getElementById('durationCard');     // контейнер с пакетами
  const payBtns = [document.getElementById('paySbpBtn'), document.getElementById('payCryptoBtn')].filter(Boolean);

  if (!usernameInput || !durationCard || payBtns.length === 0) return;

  // username как на других страницах
  const USER_RE = /^@[A-Za-z0-9_]{1,32}$/;
  function isUsernameValid(){
    return USER_RE.test(String(usernameInput.value || '').trim());
  }

  // цена из активного пакета
  function getSelectedPrice(){
    const active = durationCard.querySelector('.pack-item.is-active');
    const p = Number(active?.getAttribute('data-price') || 0);
    return Number.isFinite(p) ? p : 0;
  }

  function setPayEnabled(on){
    payBtns.forEach(b => {
      b.disabled = !on;
      b.setAttribute('aria-disabled', String(!on));
    });
  }

  function reevaluate(){
    const price = getSelectedPrice();
    const ok = isUsernameValid() && price > 0;
    setPayEnabled(ok);
  }

  // События
  usernameInput.addEventListener('input', reevaluate);
  durationCard.addEventListener('click', (e) => {
    if (e.target.closest('.pack-item')) queueMicrotask(reevaluate); // после переключения класса
  });

  // первичная проверка
  reevaluate();
})();

/* ===== Telegram Premium: фронт ↔ бэк ===== */
(function () {
  const API_BASE = "https://api.starsbox.org";
  const PRODUCT  = "premium";
  const CURRENCY = "RUB";

  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;

  // Элементы
  const usernameInput = $("#tgUsername");
  const buyForMeBtn   = $("#buyForMeBtn");

  const packsWrap     = $("#subsPacks");
  const packBtns      = $$("#subsPacks .pack-item");

  const totalValueEl  = $("#totalValue");
  const paySbpBtn     = $("#paySbpBtn");
  const payCryptoBtn  = $("#payCryptoBtn");

  /* ---------- утилиты ---------- */
  function normalizeUsername(v) {
    if (!v) return "";
    let s = String(v).trim();
    if (!s) return "";
    if (s.startsWith("@")) return s;
    if (/^[A-Za-z0-9_\.]+$/.test(s)) return "@" + s;
    return s;
  }

  function parseRubFromText(text) {
    if (!text) return 0;
    const clean  = String(text).replace(/\s+/g, " ").replace(/[^\d,.\s]/g, "").trim();
    const withDot = clean.replace(/\s/g, "").replace(",", ".");
    const num = parseFloat(withDot);
    return Number.isFinite(num) ? num : 0;
  }

  function formatRub(num) {
    try {
      return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(num);
    } catch {
      return `${(Math.round(num * 100) / 100).toFixed(2)} руб.`;
    }
  }

  function setLoading(is) {
    [paySbpBtn, payCryptoBtn].forEach((b) => {
      if (!b) return;
      b.disabled = !!is;
      b.setAttribute("aria-disabled", String(!!is));
      b.classList.toggle("is-loading", !!is);
    });
  }

  function enablePayButtons(enable) {
    [paySbpBtn, payCryptoBtn].forEach((b) => {
      if (!b) return;
      b.disabled = !enable;
      b.setAttribute("aria-disabled", String(!enable));
    });
  }

  // ✅ открыть ссылку строго внутри Telegram (если возможно)
  function openLink(url) {
    if (!url) return;
    if (typeof window.openInsideTelegram === 'function') {
      try { window.openInsideTelegram(url); return; } catch {}
    }
    if (tg && typeof tg.openLink === "function") {
      try { tg.openLink(url); return; } catch {}
    }
    window.location.href = url;
  }

  /* ---------- работа с пакетами ---------- */
  function getSelectedPack() {
    const btn = packBtns.find(b => b.classList.contains("is-selected"));
    if (!btn) return null;
    const months = parseInt(btn.dataset.months || "0", 10);
    const price  = parseFloat(String(btn.dataset.price || "0").replace(",", "."));
    return {
      months: Number.isInteger(months) ? months : 0,
      priceRub: Number.isFinite(price) ? price : 0,
      icon: btn.dataset.icon || "",
      iconActive: btn.dataset.iconActive || "",
      el: btn
    };
  }

  function refreshPackIcons() {
    packBtns.forEach(btn => {
      const img = btn.querySelector(".pack-icon img");
      if (!img) return;
      const active = btn.classList.contains("is-selected");
      const src = active ? (btn.dataset.iconActive || btn.dataset.icon || "") : (btn.dataset.icon || "");
      if (src) img.src = src;
    });
  }

  function paintPackPrices() {
    packBtns.forEach(btn => {
      const priceEl = btn.querySelector("[data-price-el]");
      if (!priceEl) return;
      const price = parseFloat(String(btn.dataset.price || "0").replace(",", "."));
      priceEl.textContent = Number.isFinite(price) ? formatRub(price) : "—";
    });
  }

  function selectPack(btn) {
    packBtns.forEach(b => {
      b.classList.toggle("is-selected", b === btn);
      b.setAttribute("aria-pressed", b === btn ? "true" : "false");
    });
    refreshPackIcons();
    refreshTotal();
    refreshPayState();
  }

  function refreshTotal() {
    const sel = getSelectedPack();
    const priceRub = sel ? sel.priceRub : 0;
    const minor = Math.round(priceRub * 100);

    if (totalValueEl) {
      totalValueEl.textContent = formatRub(priceRub);
      totalValueEl.dataset.amountMinor = String(minor);
      totalValueEl.dataset.months = String(sel ? sel.months : 0);
    }
  }

  function refreshPayState() {
    const username = normalizeUsername(usernameInput?.value || "");
    const months   = parseInt(totalValueEl?.dataset?.months || "0", 10);
    const amountMinor = Number(totalValueEl?.dataset?.amountMinor || "0");

    const enable = !!username && months > 0 && Number.isInteger(amountMinor) && amountMinor > 0;
    enablePayButtons(enable);
  }

  /* ---------- действия оплаты ---------- */
  async function initiatePayment(provider) {
    try {
      setLoading(true);

      const username = normalizeUsername(usernameInput?.value || "");
      if (!username) {
        alert("Укажите username получателя (например, @username).");
        return;
      }

      const months = parseInt(totalValueEl?.dataset?.months || "0", 10);
      if (!months || months <= 0) {
        alert("Выберите срок действия подписки (3 / 6 / 12 месяцев).");
        return;
      }

      const amountMinor = Number(totalValueEl?.dataset?.amountMinor || "0");
      if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
        alert("Сумма к оплате не рассчитана.");
        return;
      }

      // ✅ адреса возврата в мини-апп после оплаты
      const THANKS_SUCCESS = window.PAY_SUCCESS_URL;
      const THANKS_FAIL    = window.PAY_FAIL_URL;

      // Отправляем все понятные поля — если бэк вернёт 422, повторим «минимальным» набором
      const payloadFull = {
        provider,                 // "wata" | "heleket"
        product: PRODUCT,         // "premium"
        username,                 // "@user"
        months,                   // предпочтительное поле срока
        duration_months: months,  // на всякий случай дублируем
        qty: months,              // если бэк ожидает qty
        amount_minor: amountMinor,
        currency: CURRENCY,

        // ✅ return-URL для открытия внутри мини-аппа
        successUrl: THANKS_SUCCESS,
        returnUrl:  THANKS_FAIL,
        success_url: THANKS_SUCCESS, // дублируем в snake_case на всякий случай
        fail_url:    THANKS_FAIL
      };

      let resp = await fetch(`${API_BASE}/pay/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify(payloadFull)
      });

      if (resp.status === 422) {
        const payloadMin = {
          provider,
          product: PRODUCT,
          username,
          qty: months,
          amount_minor: amountMinor,
          currency: CURRENCY,

          successUrl: THANKS_SUCCESS,
          returnUrl:  THANKS_FAIL,
          success_url: THANKS_SUCCESS,
          fail_url:    THANKS_FAIL
        };
        resp = await fetch(`${API_BASE}/pay/initiate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "omit",
          body: JSON.stringify(payloadMin)
        });
      }

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
      console.error("[pay/initiate premium] error:", e);
      alert(`Не удалось создать платёж.\n${e && e.message ? e.message : e}`);
    } finally {
      setLoading(false);
    }
  }

  /* ---------- инициализация ---------- */
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
      refreshPayState();
    });
  }

  function initInputs() {
    if (usernameInput) {
      usernameInput.addEventListener("blur", () => {
        usernameInput.value = normalizeUsername(usernameInput.value);
        refreshPayState();
      });
      usernameInput.addEventListener("input", refreshPayState);
    }
  }

  function initPacks() {
    paintPackPrices();

    packBtns.forEach(btn => {
      // проставим неактивную иконку на старте
      const img = btn.querySelector(".pack-icon img");
      if (img && btn.dataset.icon) img.src = btn.dataset.icon;

      btn.addEventListener("click", () => selectPack(btn));
    });
  }

  function initPayButtons() {
    if (paySbpBtn)   paySbpBtn.addEventListener("click", () => initiatePayment("wata"));
    if (payCryptoBtn) payCryptoBtn.addEventListener("click", () => initiatePayment("heleket"));
  }

  function init() {
    try { tg && tg.ready && tg.ready(); } catch {}

    initBuyForMe();
    initInputs();
    initPacks();
    initPayButtons();

    refreshTotal();
    refreshPayState();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

