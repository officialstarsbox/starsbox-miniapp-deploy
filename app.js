(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  // ===== App base (работает и локально, и на GH Pages) =====
  window.APP_BASE = (function () {
    // https://officialstarsbox.github.io/starsbox-miniapp-deploy/...
    // parts -> ["starsbox-miniapp-deploy", ...]
    const parts = location.pathname.split('/').filter(Boolean);
    const repo  = parts.length ? '/' + parts[0] : '';
    return location.origin + repo;                  // -> https://officialstarsbox.github.io/starsbox-miniapp-deploy
  })();
  window.PAY_SUCCESS_URL = window.APP_BASE + '/pages/pay/success/';
  window.PAY_FAIL_URL    = window.APP_BASE + '/pages/pay/fail/';

  // --- Telegram WebApp helpers ---
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    try {
      tg.ready();                   // даём знать Telegram, что веб-приложение готово
      tg.expand();                  // разворачиваем по высоте
      tg.enableClosingConfirmation(); // подтверждение при закрытии (опционально)
    } catch (e) {
      console.warn('tg init error:', e);
    }
  }

  // Делаем доступными глобально
  window.tg = tg;

  window.openInsideTelegram = function (url) {
    try {
      if (tg && typeof tg.openLink === 'function') {
        // откроет поверх мини-аппа, НЕ в системном браузере
        tg.openLink(url);
      } else {
        window.location.href = url; // фолбэк
      }
    } catch (e) {
      console.warn('openInsideTelegram fallback:', e);
      window.location.href = url;
    }
  };

  // обрезка по длине с многоточием (считаем пробелы)
  function truncate(str, max) {
    const s = String(str || '');
    return s.length > max ? s.slice(0, max).trimEnd() + '…' : s;
  }

  // читаем данные из Telegram WebApp (или из query для локальных тестов)
  function readUser() {
    let first = '', last = '', username = '', photo = '';

    try { tg?.ready?.(); } catch (e) {}

    try {
      const u = tg?.initDataUnsafe?.user;
      if (u) {
        first = u.first_name || '';
        last = u.last_name || '';
        username = u.username || '';
        photo = u.photo_url || '';
      }
    } catch (e) {}

    // фолбэки для локальной отладки:
    const qs = new URLSearchParams(location.search);
    first = first || qs.get('first') || '';
    last = last || qs.get('last') || '';
    username = username || qs.get('username') || '';
    photo = photo || qs.get('photo') || '';

    return { first, last, username, photo };
  }

  ready(() => {
    const photoEl = document.getElementById('userPhoto');
    const nameEl = document.getElementById('userFullName');
    const userEl = document.getElementById('userUsername');

    const { first, last, username, photo } = readUser();

    const fullName = [first, last].filter(Boolean).join(' ').trim() || 'Даниил Маландийqqqq';
    if (nameEl) nameEl.textContent = truncate(fullName, 15);

    const showUsername = username ? '@' + username : 'groupBetaa';
    if (userEl) userEl.textContent = truncate(showUsername, 10);

    if (photoEl && photo) {
      photoEl.src = photo;
    }

    // Автоподстановка фонов из data-bg — переносим внутрь ready
    document.querySelectorAll('.panel-card[data-bg]').forEach(card => {
      const url = card.getAttribute('data-bg');
      const bg = card.querySelector('.panel-bg');
      if (bg && url) bg.style.backgroundImage = `url(${url})`;
    });
  });
})();
// ==== /app.js — Хук возврата из платежки по start_param =====
(function(){
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const API = 'https://api.starsbox.org';

  function parseStartParam(){
    try { tg?.ready?.(); } catch {}
    const url = new URL(window.location.href);
    // при открытии через t.me используется ?startapp=..., через обычный start — ?start=...
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
      `${API}/wata/dg/status/${encodeURIComponent(orderId)}` // запасной путь
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
    box.querySelector('[data-order]').textContent  = orderId;
    box.querySelector('[data-status]').textContent = text;
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
