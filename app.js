(function initTelegramMobileOnly() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  // простая проверка платформы от Telegram SDK
  const isMobile = tg.platform === 'android' || tg.platform === 'ios';
  if (!isMobile) return; // десктоп/веб — выходим, ничего не включаем

  // помечаем <body>, чтобы в CSS дать безопасные отступы и прочие моб.правки
  document.body.classList.add('tg-mobile');

  // максимальная высота вебвью
  tg.expand();

  // отключаем "свайп вниз = свернуть"
  if (typeof tg.disableVerticalSwipes === 'function') {
    tg.disableVerticalSwipes();
  }

  // подтверждение на закрытие (крестик/назад)
  if (typeof tg.enableClosingConfirmation === 'function') {
    tg.enableClosingConfirmation();
  }

  // перехватываем back на Android под свой сценарий
  if (tg.BackButton) {
    tg.BackButton.show();
    tg.BackButton.onClick(() => {
      tg.showConfirm('Закрыть приложение?', (ok) => ok && tg.close());
    });
  }

  // доп. метрика «безопасной зоны»: немного приподнимем контент на Android
  // (iOS покроется через CSS env(safe-area-inset-top))
  if (tg.platform === 'android') {
    document.documentElement.style.setProperty('--tg-extra-top', '10px');
  }

  // если нужно реагировать на изменение вьюпорта (клава/системные панели)
  tg.onEvent?.('viewportChanged', () => {
    // можно при желании динамически подправлять отступы
    // пример: держим минимум 6px
    const extra = tg.platform === 'android' ? 10 : 0;
    document.documentElement.style.setProperty('--tg-extra-top', `${extra}px`);
  });
})();
(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  // ===== App base (локально и на GH Pages) =====
  window.APP_BASE = (function () {
    const parts = location.pathname.split('/').filter(Boolean);
    const repo  = parts.length ? '/' + parts[0] : '';
    return location.origin + repo;
  })();
  window.PAY_SUCCESS_URL = window.APP_BASE + '/pages/pay/success/';
  window.PAY_FAIL_URL    = window.APP_BASE + '/pages/pay/fail/';

  // Открыть мини-апп бота с произвольным payload
  function openMiniApp(payload='') {
    const bot = 'StarssBox_bot'; // без @
    const sp  = payload ? encodeURIComponent(payload) : '';
    const tme = `https://t.me/${bot}?startapp=${sp}`;
    if (window.Telegram?.WebApp?.openTelegramLink) {
      Telegram.WebApp.openTelegramLink(tme);
    } else {
      location.href = tme;
    }
  }
  window.openMiniApp = openMiniApp;

  // --- Telegram WebApp helpers ---
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    try { tg.ready(); tg.expand(); tg.enableClosingConfirmation(); } catch {}
  }
  window.tg = tg;

  window.openInsideTelegram = function (url) {
    try {
      if (tg && typeof tg.openLink === 'function') tg.openLink(url);
      else window.location.href = url;
    } catch (e) {
      console.warn('openInsideTelegram fallback:', e);
      window.location.href = url;
    }
  };

  // ===== StarsCoin (заглушка на время, потом подменишь на реальный fetch) =====
  function getStarsCoinBalance() {
    // TODO: заменить на вызов твоего API/стора, например:
    // return fetch('/api/wallet/balance').then(r=>r.json()).then(d=>d.balance)
    // Пока: читаем из localStorage или 0
    try {
      const v = Number(localStorage.getItem('starscoin_balance'));
      return Number.isFinite(v) && v >= 0 ? v : 0;
    } catch { return 0; }
  }

  // утилиты
  function truncate(str, max) {
    const s = String(str || '');
    return s.length > max ? s.slice(0, max).trimEnd() + '…' : s;
  }

  function readUser() {
    let first = '', last = '', username = '', photo = '';
    try { tg?.ready?.(); } catch {}
    try {
      const u = tg?.initDataUnsafe?.user;
      if (u) {
        first = u.first_name || '';
        last = u.last_name || '';
        username = u.username || '';
        photo = u.photo_url || '';
      }
    } catch {}

    // фолбэки для локальной отладки
    const qs = new URLSearchParams(location.search);
    first    = first    || qs.get('first')    || '';
    last     = last     || qs.get('last')     || '';
    username = username || qs.get('username') || '';
    photo    = photo    || qs.get('photo')    || '';
    return { first, last, username, photo };
  }

  ready(() => {
    const photoEl = document.getElementById('userPhoto');
    const nameEl  = document.getElementById('userFullName');
    const userEl  = document.getElementById('userUsername');

    const { first, last, username, photo } = readUser();
    const fullName = [first, last].filter(Boolean).join(' ').trim() || 'Гость';
    if (nameEl) nameEl.textContent = truncate(fullName, 15);

    const showUsername = username ? '@' + username : '—';
    if (userEl) userEl.textContent = truncate(showUsername, 16);
    if (photoEl && photo) photoEl.src = photo;

    // StarsCoin баланс + клик
    const scBtn = document.getElementById('scBalance');
    const scText = document.getElementById('scBalanceText');
    if (scText) {
      const bal = getStarsCoinBalance();
      scText.textContent = `Баланс: ${bal} coin`;
    }
    if (scBtn) {
      scBtn.addEventListener('click', openStarsCoinPage);
    }

    // фоны из data-bg (как было)
    document.querySelectorAll('.panel-card[data-bg]').forEach(card => {
      const url = card.getAttribute('data-bg');
      const bg = card.querySelector('.panel-bg');
      if (bg && url) bg.style.backgroundImage = `url(${url})`;
    });
  });
})();

/* ===== возврат по orderId из startapp (как было) ===== */
(function(){
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const API = 'https://api.starsbox.org';

  function parseStartParam(){
    try { tg?.ready?.(); } catch {}
    const url = new URL(window.location.href);
    return (tg?.initDataUnsafe?.start_param) || url.searchParams.get('startapp') || url.searchParams.get('start') || '';
  }

  function extractOrderId(sp){
    const m = String(sp||'').trim().match(/^(?:resume|success|paid|fail)[:_\-]+(.+)$/i);
    return m ? m[1] : null;
  }

  async function fetchStatus(orderId){
    const endpoints = [
      `${API}/pay/status/${encodeURIComponent(orderId)}`,
      `${API}/wata/dg/status/${encodeURIComponent(orderId)}`
    ];
    for (const u of endpoints){
      try{
        const r = await fetch(u, { headers: { 'Accept':'application/json' } });
        if (!r.ok) continue;
        const d = await r.json().catch(()=>null);
        if (d) return d;
      }catch{}
    }
    return null;
  }

  function showBanner(orderId, text){
    const box = document.getElementById('returnBanner');
    if (!box){ tg?.showToast?.(`Заказ ${orderId}: ${text}`); return; }
    const o = box.querySelector('[data-order]');  if (o) o.textContent  = orderId;
    const s = box.querySelector('[data-status]'); if (s) s.textContent = text;
    box.hidden = false;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const sp = parseStartParam();
    const orderId = extractOrderId(sp);
    if (!orderId) return;

    let text = 'в обработке';
    try{
      const s = await fetchStatus(orderId);
      if (s){
        const paid = !!(s.paid || (s.ok && (s.status==='paid' || s.status==='success')) || s.provider_status==='Success');
        text = paid ? 'оплачен' : (s.status || 'в обработке');
      }
    }catch{}
    showBanner(orderId, text);
  });
})();

/* ===== реф.код (как было) ===== */
(function(){
  const REF_RE = /^[A-Z0-9]{3,32}$/;

  function isValidRef(code){
    return REF_RE.test(String(code||'').trim().toUpperCase());
  }
  function saveRef(code){
    try{
      const c = String(code||'').trim().toUpperCase();
      if (!isValidRef(c)) return false;
      localStorage.setItem('sb_ref_code', c);
      document.cookie = `sb_ref=${c}; Path=/; Max-Age=${60*60*24*365}; SameSite=Lax`;
      return true;
    }catch{ return false; }
  }
  function loadRef(){
    try{
      const ls = localStorage.getItem('sb_ref_code');
      if (isValidRef(ls)) return ls.toUpperCase();
      const m = document.cookie.match(/(?:^|;\s*)sb_ref=([^;]+)/);
      if (m && isValidRef(m[1])) return m[1].toUpperCase();
    }catch{}
    return null;
  }
  function extractRefFromStartParam(raw){
    const s = String(raw||'').trim();
    const m = s.match(/^ref[:=_-]+([A-Za-z0-9]{3,32})$/i);
    if (m) {
      const code = m[1].toUpperCase();
      return isValidRef(code) ? code : null;
    }
    return null;
  }
  function sanitizeMaybeRef(raw){
    if (!raw) return null;
    let s = String(raw).trim();
    s = s.split(/[&?#]/)[0];
    const up = s.toUpperCase();
    return isValidRef(up) ? up : null;
  }
  function captureRefFromLaunch(){
    const tg = window.Telegram && window.Telegram.WebApp;
    let raw = null;
    try{ tg?.ready?.(); raw = tg?.initDataUnsafe?.start_param || tg?.initDataUnsafe?.startparam || null; }catch{}
    let code = extractRefFromStartParam(raw);
    if (!code){
      const u = new URL(window.location.href);
      const sp = u.searchParams.get('startapp') || u.searchParams.get('start') || null;
      code = extractRefFromStartParam(sp);
    }
    if (!code){
      const u = new URL(window.location.href);
      code = sanitizeMaybeRef(
        u.searchParams.get('ref')
        || (u.hash||'').replace(/^#/, '')
             .split('&').map(s=>s.split('=')).find(([k])=>k==='ref')?.[1]
        || null
      );
    }
    if (code) {
      saveRef(code);
      return code;
    }
    const cached = loadRef();
    if (!isValidRef(cached)){
      try{
        localStorage.removeItem('sb_ref_code');
        document.cookie = 'sb_ref=; Path=/; Max-Age=0';
      }catch{}
      return null;
    }
    return cached;
  }
  window.getRefCode = function(){ return loadRef(); };
  window.getActorTgId = function(){
    try{
      const id = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      return (typeof id === 'number' && isFinite(id)) ? id : null;
    }catch{ return null; }
  };
  window.getMyRefLink = function(botUsername){
    const bot = (botUsername || 'StarssBox_bot').replace(/^@/, '');
    const code = loadRef();
    const payload = code ? `ref:${code}` : '';
    return `https://t.me/${bot}?startapp=${encodeURIComponent(payload)}`;
  };
  captureRefFromLaunch();
})();
// === Promo slider (автоперелистывание + прогресс) ===
(function () {
  const viewport = document.getElementById('promoViewport');
  const slides = Array.from(viewport.querySelectorAll('.promo-slide'));
  const dotsWrap = document.getElementById('promoDots');
  const dots = Array.from(dotsWrap.querySelectorAll('.promo-dot'));
  const DURATION_MS = 5000; // время показа одного слайда
  let idx = 0;
  let t = null;

  function setActive(newIndex, withTimer = true) {
    // гварды
    if (!slides.length) return;
    newIndex = (newIndex + slides.length) % slides.length;

    // слайды
    slides.forEach((s, i) => s.classList.toggle('is-active', i === newIndex));

    // индикаторы
    dots.forEach((d, i) => {
      d.classList.toggle('is-active', i === newIndex);
      const fill = d.querySelector('.promo-fill');
      fill.style.width = (i === newIndex && withTimer) ? '0%' : '0%';
      fill.style.transitionDuration = '0ms';
      // реflow, чтобы анимация ширины перезапустилась
      void fill.offsetWidth;
      if (i === newIndex && withTimer) {
        fill.style.transitionDuration = DURATION_MS + 'ms';
        fill.style.width = '100%';
      }
    });

    idx = newIndex;
    restartTimer();
  }

  function next() { setActive(idx + 1); }

  function restartTimer() {
    if (t) clearTimeout(t);
    t = setTimeout(next, DURATION_MS);
  }

  // клики по точкам
  dotsWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('.promo-dot');
    if (!btn) return;
    const to = parseInt(btn.dataset.to, 10) || 0;
    setActive(to);
  });

  // свайп на мобильных (минималистично)
  let startX = null;
  viewport.addEventListener('pointerdown', (e) => { startX = e.clientX; });
  viewport.addEventListener('pointerup', (e) => {
    if (startX == null) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 30) setActive(idx + (dx < 0 ? 1 : -1));
    startX = null;
  });

  // автозапуск
  setActive(0);
})();
(function () {
      const pill = document.getElementById("starsCoinBtn");
      const modal = document.getElementById("starscoinModal");
      const btnClose = document.getElementById("scModalClose");

      function openModal() {
        modal.classList.remove("sc-hidden");
        document.body.style.overflow = "hidden";
        // лёгкая тактильная отдача в Telegram WebApp (не критично)
        try { Telegram?.WebApp?.HapticFeedback?.impactOccurred("light"); } catch {}
        // блокируем swipe-закрытие мини-аппа поверх модалки
        try { Telegram?.WebApp?.enableClosingConfirmation(); } catch {}
      }

      function closeModal() {
        modal.classList.add("sc-hidden");
        document.body.style.overflow = "";
        try { Telegram?.WebApp?.disableClosingConfirmation(); } catch {}
      }

      pill.addEventListener("click", function (e) {
        // Блокируем переход по href
        e.preventDefault();
        e.stopPropagation();
        openModal();
      });

      btnClose.addEventListener("click", closeModal);

      // Клик по фону — тоже закрывает
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
      });

      // Esc — закрыть
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !modal.classList.contains("sc-hidden")) closeModal();
      });
})();