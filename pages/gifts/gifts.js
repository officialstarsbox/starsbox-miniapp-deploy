/* Gifts page logic */
(function () {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  if (tg) { tg.expand(); tg.ready(); }

  // Назад: если пришли со страницы buy, вернёмся туда; иначе — на главную
  function goBack(){
    const params = new URLSearchParams(location.search);
    if (history.length > 1 && document.referrer && document.referrer !== location.href) {
      history.back();
      return;
    }
    const from = params.get('from');
    if (from === 'buy') {
      window.location.href = '../buy/index.html';
    } else {
      window.location.href = '../../index.html';
    }
  }
  document.getElementById('backBtn')?.addEventListener('click', goBack);

  // Карточки: переход на детальную (пока — просто по ссылке)
  document.querySelectorAll('.gift-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // здесь можно будет подставлять параметры в детальную карточку
      // сейчас просто даём перейти по href
    });
  });
})();
