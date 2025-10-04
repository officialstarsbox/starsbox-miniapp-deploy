(function(){
  // ---------------------- helpers ----------------------
  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
  const $  = (s, r) => (r||document).querySelector(s);

  // ---------------------- main ----------------------
  ready(function(){
    // Back button
    const backBtn = $('#backBtn');
    if (backBtn){
      const url = new URL(window.location.href);
      const back = url.searchParams.get('back');
      backBtn.addEventListener('click', () => back ? (window.location.href = back) : window.history.back());
    }

    // Username input: только латиница, цифры и _
    const username = $('#tgUsername');
    if (username){
      const allowed = /[^A-Za-z0-9_]/g;        // всё, что НЕ латиница/цифра/_
      const cyrillic = /[\u0400-\u04FF]/g;     // кириллица
      username.addEventListener('input', () => {
        const v = username.value;
        // сначала убираем кириллицу, затем прочие недопустимые
        let cleaned = v.replace(cyrillic, '');
        cleaned = cleaned.replace(allowed, '');
        if (v !== cleaned) username.value = cleaned;
      });

      // Сворачивание мобильной клавиатуры:
      // Enter => blur
      username.addEventListener('keydown', (e) => {
        if (e.key === 'Enter'){
          e.preventDefault();
          username.blur();
        }
      });
      // Тап/клик вне поля => blur активного поля
      function blurIfOutside(e){
        const ae = document.activeElement;
        if (!ae) return;
        const isInput = ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA';
        if (!isInput) return;
        if (ae.contains(e.target)) return; // клик по самому полю
        ae.blur();
      }
      document.addEventListener('pointerdown', blurIfOutside, { capture: true });
      document.addEventListener('touchstart', blurIfOutside, { capture: true });
    }

    // «Купить себе»: подставь логику, если знаешь username текущего пользователя
    $('#buyForMeBtn')?.addEventListener('click', () => {
      // пример: username.value = 'my_username';
      // username.dispatchEvent(new Event('input'));
    });

    // Если нужно заменить иконку в рантайме — вот пример:
    // const iconImg = document.querySelector('.user-icon img');
    // if (iconImg) iconImg.src = '/path/to/your-20x20-icon.png';
  });
})();

(function(){
  // ---------------------- helpers ----------------------
  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
  const $  = (s, r) => (r||document).querySelector(s);
  const $$ = (s, r) => Array.from((r||document).querySelectorAll(s));

  // Получение username из Telegram WebApp (или из query-параметра для локальных тестов)
  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  tg?.ready?.();

  function getDevUsernameFallback(){
    try {
      const params = new URLSearchParams(location.search);
      const v = params.get('tg_username');
      return v ? v.trim() : null;
    } catch { return null; }
  }

  function getSelfUsername(){
    const u = tg?.initDataUnsafe?.user?.username;
    return (u && String(u).trim()) || getDevUsernameFallback() || null;
  }

  // нормализация в формат Telegram username (без @, только [A-Za-z0-9_])
  function normalizeUsername(v){
    return String(v || '')
      .replace(/^@+/, '')               // убираем ведущие @
      .replace(/[\u0400-\u04FF]/g, '')  // кириллицу в любом виде
      .replace(/[^A-Za-z0-9_]/g, '');   // только латиница/цифры/_
  }

  // ---------------------- main ----------------------
  ready(function(){
    // Back button
    const backBtn = $('#backBtn');
    if (backBtn){
      const url = new URL(window.location.href);
      const back = url.searchParams.get('back');
      backBtn.addEventListener('click', () => back ? (window.location.href = back) : window.history.back());
    }

    // Username input: только латиница, цифры и _
    const username = $('#tgUsername');
    if (username){
      const notLatinDigitsUnderscore = /[^A-Za-z0-9_]/g;
      const cyrillic = /[\u0400-\u04FF]/g;
      username.addEventListener('input', () => {
        const v = username.value;
        let cleaned = v.replace(cyrillic, '').replace(notLatinDigitsUnderscore, '');
        if (v !== cleaned) username.value = cleaned;
      });

      // Сворачивание мобильной клавиатуры: Enter => blur
      username.addEventListener('keydown', (e) => {
        if (e.key === 'Enter'){
          e.preventDefault();
          username.blur();
        }
      });
    }

    // Тап/клик вне любого инпута => blur активного поля (сворачиваем клавиатуру)
    function blurIfOutside(e){
      const ae = document.activeElement;
      if (!ae) return;
      const isInput = ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA';
      if (!isInput) return;
      if (ae.contains(e.target)) return; // клик по самому полю
      ae.blur();
    }
    document.addEventListener('pointerdown', blurIfOutside, { capture: true });
    document.addEventListener('touchstart', blurIfOutside, { capture: true });

    // «Купить себе» — подставляем username из Telegram Mini App
    const buyForMeBtn = $('#buyForMeBtn');
    if (buyForMeBtn && username){
      const selfUsername = getSelfUsername();
      if (!selfUsername){
        // у пользователя в Telegram может не быть публичного username
        buyForMeBtn.disabled = true;
        buyForMeBtn.title = 'В вашем профиле Telegram не задан username';
      } else {
        buyForMeBtn.addEventListener('click', () => {
          const normalized = normalizeUsername(selfUsername);
          username.value = normalized;
          // триггерим input, если дальше на это подписана логика
          username.dispatchEvent(new Event('input', { bubbles: true }));
          // удобно сразу убрать курсор и клавиатуру
          username.blur();
        });
      }
    }

  });
})();

// helpers (если у вас уже объявлены $, $$ — пропустите эти 2 строки)
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

/* === Выбор получателя через системный выбор Telegram === */
(function(){
  const pickBtn   = $('#pickUserBtn');
  const hint      = $('#pickUserHint');
  const input     = $('#tgUsername');

  // «Купить себе» — подставляем username текущего пользователя Mini App (если есть)
  $('#fillSelfBtn')?.addEventListener('click', () => {
    const tg = window.Telegram?.WebApp?.initDataUnsafe?.user;
    const uname = tg?.username || '';
    if (uname) {
      input.value = uname.replace(/^@/, '');
      input.dispatchEvent(new Event('input', { bubbles:true }));
      input.blur();
    }
  });

  // Нажали «выбрать в Telegram» — просим бота показать системную кнопку выбора пользователя
  let stopPolling = null;
  pickBtn?.addEventListener('click', () => {
    if (!window.Telegram?.WebApp) return;
    const requestId = Date.now();
    // Отправляем боту команду: он пришлет клавиатуру с request_user
    Telegram.WebApp.sendData(JSON.stringify({ action: 'request_user', request_id: requestId }));
    // Покажем подсказку «ждем выбора»
    hint?.removeAttribute('hidden');
    // Начинаем опрос своего бэкенда — когда бот получит user_shared, он положит результат в /api/user-share
    if (typeof stopPolling === 'function') stopPolling();
    stopPolling = pollUserShare(requestId, (data) => {
      // prefer username, fallback к id
      const uname = (data.username || '').replace(/^@/, '');
      input.value = uname || (data.user_id || '');
      input.dispatchEvent(new Event('input', { bubbles:true }));
      input.blur();
      hint?.setAttribute('hidden', 'hidden');
    }, () => {
      // timeout/cancel
      hint?.setAttribute('hidden', 'hidden');
    });
  });

  function pollUserShare(requestId, onDone, onTimeout){
    let died = false;
    (async function loop(){
      for (let i=0; i<45 && !died; i++){ // ~90 секунд при шаге 2с
        try {
          const res = await fetch(`/api/user-share?rid=${encodeURIComponent(requestId)}`, { cache:'no-store' });
          if (res.ok){
            const data = await res.json();
            if (data && data.ready){
              if (!died) onDone(data);
              return;
            }
          }
        } catch(_) {}
        await new Promise(r => setTimeout(r, 2000));
      }
      if (!died && onTimeout) onTimeout();
    })();
    return () => { died = true; };
  }
})();
