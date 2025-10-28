(function () {
  // ===== Константы =====
  const API_BASE  = "https://api.starsbox.org";
  const PRODUCT   = "stars";
  const CURRENCY  = "RUB";
  const MIN_STARS = 50;
  const MAX_STARS = 20000;

  // ===== Telegram SDK =====
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  try { tg?.ready?.(); } catch {}

  // ===== Элементы =====
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const usernameInput = $("#tgUsername");
  const amountInput   = $("#starsAmount");

  const totalCard     = $("#totalCard");
  const totalValue    = $("#totalValue");

  const packsList     = $("#packsList");
  const packsToggle   = $("#packsToggle");
  const paySbpBtn     = $("#paySbpBtn");
  const payCryptoBtn  = $("#payCryptoBtn");
  const buyForMeBtn   = $("#buyForMeBtn");

  // === состояние выбора пакета (нужно, чтобы снимать выбор при ручном вводе) ===
  let activePackEl = null;
  let suppressClear = false; // true, когда мы программно подставляем количество из пакета

  // Ставка ₽ за 1 звезду (из data-rate или window.STAR_RATE)
  const RATE = (() => {
    const fromWin  = Number(window.STAR_RATE);
    if (Number.isFinite(fromWin) && fromWin > 0) return fromWin;
    const fromAttr = Number(totalCard?.dataset?.rate);
    if (Number.isFinite(fromAttr) && fromAttr > 0) return fromAttr;
    return 1.7;
  })();

  // ===== Утилиты =====
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function normalizeUsername(v) {
    if (!v) return "";
    let s = String(v).trim();
    if (!s) return "";
    if (s.startsWith("@")) return s;
    if (/^[A-Za-z0-9_\.]+$/.test(s)) return "@" + s;
    return s;
  }

  // === ДОБАВЛЕНО: строгая нормализация поля с автопрефиксом @ и запретом кириллицы ===
  function normalizeWithAt(raw){
    const core = String(raw||'')
      .replace(/@/g,'')            // убираем любые @ внутри
      .replace(/[^A-Za-z0-9_]/g,'') // только латиница/цифры/_
      .slice(0,32);                 // максимум 32
    return core ? '@' + core : '';
  }

  function getQty() {
    const raw = (amountInput?.value || "").replace(/[^\d]/g, "");
    if (!raw) return 0;
    return clamp(parseInt(raw, 10) || 0, MIN_STARS, MAX_STARS);
  }

  function setQty(n) {
    const v = clamp(Number(n) || 0, MIN_STARS, MAX_STARS);
    if (amountInput) {
      amountInput.value = v ? String(v) : "";
    }
  }

  function formatRub(num) {
    try {
      return new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: "RUB",
        maximumFractionDigits: 2
      }).format(num);
    } catch {
      return `${(Math.round(num * 100) / 100).toFixed(2)} руб.`;
    }
  }

  // Открыть ссылку приоритетно внутри мини-аппа
  function openLink(url) {
    if (!url) return;
    if (typeof window.openInsideTelegram === "function") {
      try { window.openInsideTelegram(url); return; } catch {}
    }
    if (tg && typeof tg.openLink === "function") {
      try { tg.openLink(url); return; } catch {}
    }
    location.href = url;
  }

  // Опциональный реф-код (бэк всё равно умеет связывать по actor_tg_id)
  function readRefCode() {
    try { return typeof window.getRefCode === "function" ? window.getRefCode() : null; } catch { return null; }
  }

  // ==== Единый пересчёт UI ====
  function updateUI() {
    const qty = getQty();
    const amountRub   = qty * RATE;
    const amountMinor = Math.round(amountRub * 100);

    // Итог
    if (totalValue) {
      totalValue.textContent = qty ? formatRub(amountRub) : "0,00 руб.";
    }

    // Включение/выключение кнопок
    const uOk = /^@[A-Za-z0-9_]{1,32}$/.test((usernameInput?.value || "").trim());
    const qOk = qty >= MIN_STARS && qty <= MAX_STARS;
    const enable = uOk && qOk && amountMinor > 0;

    [paySbpBtn, payCryptoBtn].forEach(b => {
      if (!b) return;
      b.disabled = !enable;
      b.setAttribute("aria-disabled", String(!enable));
      b.classList.toggle("is-disabled", !enable);
    });
  }

  function setLoading(is) {
    [paySbpBtn, payCryptoBtn, packsToggle].forEach((b) => {
      if (!b) return;
      b.disabled = !!is;
      b.classList.toggle("is-loading", !!is);
      b.setAttribute("aria-disabled", String(!!is));
    });
  }

  // ==== Пакеты ====
  function initPacks() {
    if (!packsList) return;

    // Проставим иконки
    $$(".pack-item", packsList).forEach(btn => {
      const img  = btn.querySelector(".pack-icon img");
      const icon = btn.dataset.icon;
      if (img && icon) img.src = icon;
    });

    function paintSelection(btn) {
      const btns = $$(".pack-item", packsList);
      btns.forEach(b => {
        const active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", active ? "true" : "false");
        const img = b.querySelector(".pack-icon img");
        const defIco = b.dataset.icon || "";
        const actIco = b.dataset.iconActive || defIco;
        if (img) img.src = active ? actIco : defIco;
      });
      activePackEl = btn || null;
    }

    function clearSelectedPack() {
      if (!activePackEl) return;
      const img = activePackEl.querySelector(".pack-icon img");
      const def = activePackEl.dataset.icon || "";
      activePackEl.classList.remove("is-active","is-selected");
      activePackEl.setAttribute("aria-pressed","false");
      if (img) img.src = def;
      activePackEl = null;
    }

    // выбор пакета → подсветка и программная подстановка количества
    packsList.addEventListener("click", (e) => {
      const btn = e.target.closest(".pack-item");
      if (!btn) return;

      paintSelection(btn);

      const stars = parseInt(btn.dataset.stars || "0", 10) || 0;
      if (stars) {
        suppressClear = true;     // чтобы обработчик инпута не снял выбор
        setQty(stars);
        queueMicrotask(() => { suppressClear = false; });
      }
      updateUI();
    });

    // раскрывашка списка пакетов
    packsToggle?.addEventListener("click", () => {
      const collapsed = packsList.getAttribute("data-collapsed") === "true";
      packsList.setAttribute("data-collapsed", collapsed ? "false" : "true");
      packsToggle.textContent = collapsed ? "Свернуть список пакетов" : "Показать все пакеты";
    });

    // экспортируем очистку для использования в input-обработчике
    initPacks.clearSelectedPack = clearSelectedPack;
  }

  // ==== Prefill: купить себе ====
  function initBuyForMe() {
    if (!buyForMeBtn || !usernameInput) return;
    buyForMeBtn.addEventListener("click", () => {
      let u = "";
      try {
        const tgUser = tg?.initDataUnsafe?.user;
        if (tgUser?.username) u = "@" + tgUser.username;
      } catch {}
      if (!u) {
        const url = new URL(location.href);
        const qU = url.searchParams.get("u");
        if (qU) u = normalizeUsername(qU);
      }
      if (!u) {
        alert("Не удалось определить ваш username из Telegram. Введите его вручную (например, @username).");
        usernameInput.focus();
        return;
      }
      usernameInput.value = u;
      updateUI();
    });
  }

  // ==== Инпуты ====
  function initInputs() {
    if (amountInput) {
      amountInput.addEventListener("input", () => {
        const digits = amountInput.value.replace(/[^\d]/g, "").slice(0, 5); // до 20000
        if (amountInput.value !== digits) {
          amountInput.value = digits;
          try { amountInput.setSelectionRange(digits.length, digits.length); } catch {}
        }
        // если пользователь вводит руками — сбросить выбранный пакет
        if (!suppressClear && typeof initPacks.clearSelectedPack === "function") {
          initPacks.clearSelectedPack();
        }
        updateUI();
      });
      amountInput.addEventListener("blur", () => { setQty(getQty()); updateUI(); });
      amountInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); amountInput.blur(); } });
    }

    if (usernameInput) {
      // === ДОБАВЛЕНО: «живая» фильтрация и автопрефикс @ ===
      usernameInput.addEventListener("input", () => {
        const v = normalizeWithAt(usernameInput.value);
        if (v !== usernameInput.value){
          usernameInput.value = v;
          try { usernameInput.setSelectionRange(v.length, v.length); } catch {}
        }
        updateUI();
      });

      // запрет плохих символов ещё до вставки
      usernameInput.addEventListener("beforeinput", (e) => {
        if (e.inputType === "insertText" && /[^A-Za-z0-9_@]/.test(e.data)) {
          e.preventDefault();
        }
      });

      usernameInput.addEventListener("blur", () => {
        if (usernameInput.value === "@") usernameInput.value = "";
        else usernameInput.value = normalizeWithAt(usernameInput.value);
        updateUI();
      });

      usernameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); usernameInput.blur(); }
      });
    }

    // Сворачиваем клавиатуру по тапу вне поля
    function blurIfOutside(e){
      const ae = document.activeElement;
      if (!ae) return;
      const isInput = ae.tagName === "INPUT" || ae.tagName === "TEXTAREA";
      if (!isInput) return;
      if (ae.contains(e.target)) return;
      ae.blur();
    }
    document.addEventListener("pointerdown", blurIfOutside, { capture: true });
    document.addEventListener("touchstart",  blurIfOutside, { capture: true });
  }

  // ==== Оплата ====
  async function initiatePayment(provider) {
    try {
      setLoading(true);

      const username = normalizeUsername(usernameInput?.value || "");
      if (!username) {
        alert("Укажите username получателя (например, @username).");
        return;
      }

      // свежий расчёт, НЕ через dataset
      const qty = getQty();
      if (!(qty >= MIN_STARS && qty <= MAX_STARS)) {
        alert(`Укажите количество звёзд от ${MIN_STARS} до ${MAX_STARS}.`);
        return;
      }
      const amountRub   = qty * RATE;
      const amountMinor = Math.round(amountRub * 100);
      if (amountMinor <= 0) {
        alert("Сумма к оплате не рассчитана. Попробуйте выбрать пакет или ввести количество заново.");
        return;
      }

      const payload = {
        provider,                 // "wata" | "heleket"
        product: PRODUCT,         // "stars"
        username,                 // "@username"
        qty,                      // штук звёзд
        amount_minor: amountMinor,
        currency: CURRENCY,

        // рефералка (если есть) + кто платит
        ref_code: readRefCode(),
        actor_tg_id: tg?.initDataUnsafe?.user?.id || null,

        // URL возврата в мини-апп
        success_url: window.PAY_SUCCESS_URL,
        fail_url:    window.PAY_FAIL_URL,
        // на всякий случай в camelCase тоже
        successUrl:  window.PAY_SUCCESS_URL,
        returnUrl:   window.PAY_FAIL_URL
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
      console.error("[pay/initiate stars] error:", e);
      alert(`Не удалось создать платёж.\n${e && e.message ? e.message : e}`);
    } finally {
      setLoading(false);
    }
  }

  function initPayButtons() {
    paySbpBtn   && paySbpBtn.addEventListener("click", () => initiatePayment("wata"));
    payCryptoBtn&& payCryptoBtn.addEventListener("click", () => initiatePayment("heleket"));
  }

  // ==== Инициализация ====
  function init() {
    initPacks();
    initBuyForMe();
    initInputs();
    initPayButtons();
    updateUI(); // первичный рендер: 0 ₽ и disabled
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
