(function(){
  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  // обрезка по длине с многоточием (считаем пробелы)
  function truncate(str, max){
    const s = String(str || '');
    return s.length > max ? s.slice(0, max).trimEnd() + '…' : s;
  }

  // читаем данные из Telegram WebApp (или из query для локальных тестов)
  function readUser(){
    const tg = window.Telegram && window.Telegram.WebApp;
    let first = '', last = '', username = '', photo = '';

    try { tg?.ready?.(); } catch(e){}

    try {
      const u = tg?.initDataUnsafe?.user;
      if (u){
        first    = u.first_name || '';
        last     = u.last_name  || '';
        username = u.username   || '';
        photo    = u.photo_url  || '';
      }
    } catch(e){}

    // фолбэки для локальной отладки:
    const qs = new URLSearchParams(location.search);
    first    = first    || qs.get('first') || '';
    last     = last     || qs.get('last')  || '';
    username = username || qs.get('username') || '';
    photo    = photo    || qs.get('photo') || '';

    return { first, last, username, photo };
  }

  ready(() => {
    const photoEl = document.getElementById('userPhoto');
    const nameEl  = document.getElementById('userFullName');
    const userEl  = document.getElementById('userUsername');

    const { first, last, username, photo } = readUser();

    const fullName = [first, last].filter(Boolean).join(' ').trim() || 'Даниил Маландийqqqq';
    nameEl.textContent = truncate(fullName, 15);

    const showUsername = username ? '@' + username : 'groupBetaa';
    userEl.textContent = truncate(showUsername, 10);

    if (photo){
      photoEl.src = photo;
    } else {
      // оставим встроенный fallback из HTML (assets/profile-fallback.png)
    }
  });
})();
// Автоподстановка фонов из data-bg
document.querySelectorAll('.panel-card[data-bg]').forEach(card => {
  const url = card.getAttribute('data-bg');
  const bg  = card.querySelector('.panel-bg');
  if (bg && url) bg.style.backgroundImage = `url(${url})`;
});
