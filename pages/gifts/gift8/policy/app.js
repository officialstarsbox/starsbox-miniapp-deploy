(function () {
  // простой helper
  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
  const $ = (s, r) => (r || document).querySelector(s);

  ready(() => {
    // Кнопка «Назад» — ведёт по ссылке из data-back-url
    const backBtn = $('#backBtn');
    if (backBtn){
      const url = backBtn.getAttribute('data-back-url') || '/';
      backBtn.addEventListener('click', () => { location.href = url; });
    }
  });
})();
