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

  // Открыть мини-апп бота с произвольным payload (используй везде)
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

    // фоны из data-bg
    document.querySelectorAll('.panel-card[data-bg]').forEach(card => {
      const url = card.getAttribute('data-bg');
      const bg = card.querySelector('.panel-bg');
      if (bg && url) bg.style.backgroundImage = `url(${url})`;
    });
  });
})();

(function(){
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const API = 'https://api.starsbox.org';

  function parseStartParam(){
    try { tg?.ready?.(); } catch {}
    const url = new URL(window.location.href);
    return (tg?.initDataUnsafe?.start_param) || url.searchParams.get('startapp') || url.searchParams.get('start') || '';
  }

  function extractOrderId(sp){
    // принимаем: resume:<id>, success:<id>, paid:<id>, fail:<id>
    const m = String(sp||'').trim().match(/^(?:resume|success|paid|fail)[:_\-]+(.+)$/i);
    return m ? m[1] : null;
  }

  async function fetchStatus(orderId){
    const endpoints = [
      `${API}/pay/status/${encodeURIComponent(orderId)}`,
      `${API}/wata/dg/status/${encodeURIComponent(orderId)}` // резервный
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

(function(){
  // На бэке публичные коды вида ABCD234… (латиница+цифры), без префиксов.
  // Нормализуем в UPPERCASE перед сохранением/отправкой.
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

  // из start/startapp берём только payload вида ref:CODE
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
    // поддерживаем ?ref=CODE и #ref=CODE
    s = s.split(/[&?#]/)[0];
    const up = s.toUpperCase();
    return isValidRef(up) ? up : null;
  }

  function captureRefFromLaunch(){
    const tg = window.Telegram && window.Telegram.WebApp;

    // 1) Telegram WebApp start_param/startparam
    let raw = null;
    try{ tg?.ready?.(); raw = tg?.initDataUnsafe?.start_param || tg?.initDataUnsafe?.startparam || null; }catch{}

    // из start берём только ref:CODE
    let code = extractRefFromStartParam(raw);

    // 2) если нет — смотрим ?startapp / ?start
    if (!code){
      const u = new URL(window.location.href);
      const sp = u.searchParams.get('startapp') || u.searchParams.get('start') || null;
      code = extractRefFromStartParam(sp);
    }

    // 3) явный ?ref= / #ref=
    if (!code){
      const u = new URL(window.location.href);
      code = sanitizeMaybeRef(
        u.searchParams.get('ref')
        || (u.hash||'').replace(/^#/, '')
             .split('&').map(s=>s.split('=')).find(([k])=>k==='ref')?.[1]
        || null
      );
    }

    // сохранить если валидный; иначе вернуть кеш, если он норм
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

  // публичные хелперы для страниц оформления
  window.getRefCode = function(){ return loadRef(); };

  window.getActorTgId = function(){
    try{
      const id = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      return (typeof id === 'number' && isFinite(id)) ? id : null;
    }catch{ return null; }
  };

  // твоя «моя реф-ссылка» — просто сборка. Сам код генерится/хранится на бэке,
  // но если уже есть сохранённый код — подставим его.
  window.getMyRefLink = function(botUsername){
    const bot = (botUsername || 'StarssBox_bot').replace(/^@/, '');
    const code = loadRef();
    const payload = code ? `ref:${code}` : '';
    return `https://t.me/${bot}?startapp=${encodeURIComponent(payload)}`;
  };

  // вызвать один раз при загрузке
  captureRefFromLaunch();
})();