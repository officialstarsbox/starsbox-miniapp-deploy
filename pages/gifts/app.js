(function () {
  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
  const $ = (s, r) => (r || document).querySelector(s);

  ready(function () {
    // Кнопка "Назад": если передан ?back=URL — уйдём туда, иначе history.back()
    const backBtn = $('#backBtn');
    if (backBtn){
      const url = new URL(window.location.href);
      const back = url.searchParams.get('back');
      backBtn.addEventListener('click', () => back ? (window.location.href = back) : window.history.back());
    }

    // дальше поэтапно будем добавлять содержимое страницы
  });
})();
(function () {
  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  ready(() => {
    // back на этой странице, если нужно
    const backBtn = $('#backBtn');
    if (backBtn){
      const url  = new URL(location.href);
      const back = url.searchParams.get('back');
      backBtn.addEventListener('click', () => back ? (location.href = back) : history.back());
    }

    // Навигация с карточек
    $$('.gift-card[data-gift-page]').forEach(card => {
      const page = card.getAttribute('data-gift-page'); // например, "gift7"

      function go(){
        // сформируем ссылку вида /pages/gifts/gift7/index.html?back=<текущий URL>
        const back = encodeURIComponent(location.href);
        location.href = `/pages/gifts/${page}/index.html?back=${back}`;
      }

      card.addEventListener('click', go);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });
  });
})();
