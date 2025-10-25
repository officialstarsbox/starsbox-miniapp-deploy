(function () {
  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  ready(() => {
    // Если задан data-back — подставим его в href (на случай,
    // если в HTML забыли прописать href напрямую).
    const backLink = document.getElementById('backBtn');
    if (backLink && backLink.dataset.back){
      backLink.setAttribute('href', backLink.dataset.back);
    }
    // Никаких history.back — возврат выполняется просто по ссылке.
  });
})();
