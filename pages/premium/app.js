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
