(function () {
  // ---------- helpers ----------
  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
  const $ = (s, r) => (r || document).querySelector(s);

  // Показ текста в карточке подарка (используется дальше)
  window.setGiftDescription = function setGiftDescription(text){
    const el = document.getElementById('giftDesc');
    if (!el) return;
    el.textContent = String(text || '').trim();
  };

  // ---------- init ----------
  ready(() => {
    // Инициализация описания (query → data-default → текущий)
    const descEl = $('#giftDesc');
    if (descEl){
      const q = new URLSearchParams(location.search).get('desc');
      const txt = q ? decodeURIComponent(q) : (descEl.dataset.default || descEl.textContent);
      setGiftDescription(txt);
    }
  });

  // ---------- username получателя ----------
  function normalizeWithAt(raw){
    const core = String(raw || '')
      .replace(/@/g, '')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .slice(0, 32);
    return core ? '@' + core : '';
  }
  function getSelfUsername(){
    const tg = window.Telegram && window.Telegram.WebApp;
    tg?.ready?.();
    const u = tg?.initDataUnsafe?.user?.username;
    if (u) return String(u).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32);
    try{
      const q = new URLSearchParams(location.search).get('tg_username');
      return q ? String(q).replace(/[^a-zA-Z0-9_]/g,'').slice(0,32) : null;
    }catch{ return null; }
  }

  ready(() => {
    const usernameInput = $('#tgUsername');

    if (usernameInput){
      usernameInput.addEventListener('input', () => {
        const nv = normalizeWithAt(usernameInput.value);
        if (usernameInput.value !== nv){
          usernameInput.value = nv;
          try{ usernameInput.setSelectionRange(nv.length, nv.length); }catch(e){}
        }
      });
      usernameInput.addEventListener('blur', () => {
        if (usernameInput.value === '@') usernameInput.value = '';
      });
      usernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter'){ e.preventDefault(); usernameInput.blur(); }
      });
    }

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

    // Сворачивание клавиатуры по тапу вне инпута/текстовой области
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

  // ---------- Отправитель + Сообщение (счётчики и текст карточки) ----------
  ready(() => {
    const descEl       = document.getElementById('giftDesc');
    if (!descEl) return;

    const defaultDesc  = descEl.dataset.default || descEl.textContent || '';

    const senderInput   = document.getElementById('senderInput');   // max 24
    const senderCount   = document.getElementById('senderCount');
    const messageInput  = document.getElementById('messageInput');  // max 91
    const messageCount  = document.getElementById('messageCount');

    const clamp = (s, max) => String(s || '').slice(0, max);

    function updateCounters(){
      if (senderInput && senderCount)   senderCount.textContent  = (senderInput.value  || '').length;
      if (messageInput && messageCount) messageCount.textContent = (messageInput.value || '').length;
    }

    // Сборка текста карточки:
    //  - если есть и отправитель, и сообщение → перенос строки между ними
    //  - если только одно из полей — выводим его
    //  - если пусто — дефолт
    function renderCardText(){
      const s = (senderInput?.value || '').trim();
      const m = (messageInput?.value || '').trim();

      if (s && m){
        // пайп остаётся видимым, а сообщение уходит на новую строку
        setGiftDescription(`Отправитель: ${s} | \n${m}`);
      } else if (s){
        setGiftDescription(`Отправитель: ${s}`);
      } else if (m){
        setGiftDescription(m);
      } else {
        setGiftDescription(defaultDesc);
      }
    }

    // Отправитель
    if (senderInput){
      senderInput.addEventListener('input', () => {
        const nv = clamp(senderInput.value, 24);
        if (nv !== senderInput.value){
          senderInput.value = nv;
          try{ senderInput.setSelectionRange(nv.length, nv.length); }catch(e){}
        }
        updateCounters();
        renderCardText();
      });
      senderInput.addEventListener('beforeinput', (e) => {
        if (e.inputType === 'insertText'){
          const sel = senderInput.selectionEnd - senderInput.selectionStart;
          if (senderInput.value.length >= 24 && sel === 0) e.preventDefault();
        }
      });
    }

    // Сообщение
    if (messageInput){
      messageInput.addEventListener('input', () => {
        const nv = clamp(messageInput.value, 91);
        if (nv !== messageInput.value){
          messageInput.value = nv;
          try{ messageInput.setSelectionRange(nv.length, nv.length); }catch(e){}
        }
        updateCounters();
        renderCardText();
      });
      messageInput.addEventListener('beforeinput', (e) => {
        if (e.inputType === 'insertText'){
          const sel = messageInput.selectionEnd - messageInput.selectionStart;
          if (messageInput.value.length >= 91 && sel === 0) e.preventDefault();
        }
      });
    }

    // первичный рендер
    updateCounters();
    renderCardText();
  });
})();
// ===== ИТОГО К ОПЛАТЕ + активация кнопок =====
(function () {
  const totalEl   = document.getElementById('totalValue');
  const totalCard = document.getElementById('totalCard');
  const unameEl   = document.getElementById('tgUsername');
  const payBtns   = [document.getElementById('paySbpBtn'), document.getElementById('payCryptoBtn')].filter(Boolean);

  if (!totalEl) return;

  // 1) Цена подарка: data-атрибут → query (?price=) → текст в #totalValue (например "25,00 руб.")
  function getGiftPrice() {
    // data-price на карточке итога (желательно так и делать)
    const fromData = Number(totalCard?.dataset?.price);
    if (!Number.isNaN(fromData) && fromData > 0) return fromData;

    // ?price= в URL
    const q = new URLSearchParams(location.search).get('price');
    const fromQuery = Number(q?.replace(',', '.'));
    if (!Number.isNaN(fromQuery) && fromQuery > 0) return fromQuery;

    // парсим то, что уже отрендерено в #totalValue
    const raw = (totalEl.textContent || '').replace(/[^\d,.-]/g, '').replace(',', '.');
    const fromText = parseFloat(raw);
    return Number.isFinite(fromText) ? fromText : 0;
  }

  // 2) Валиден ли получатель (@ + 1..32 символов [A-Za-z0-9_])
  function hasValidRecipient() {
    const v = (unameEl?.value || '').trim();
    return /^@[A-Za-z0-9_]{1,32}$/.test(v);
  }

  // 3) Включение/выключение кнопок
  function updatePayButtons() {
    const enabled = getGiftPrice() > 0 && hasValidRecipient();
    payBtns.forEach(b => {
      b.disabled = !enabled;
      b.setAttribute('aria-disabled', String(!enabled));
    });
  }

  // 4) Отрисовка суммы (если нужно привести формат) + первичное состояние кнопок
  const nfRub2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function renderTotal() {
    const price = getGiftPrice();
    totalEl.textContent = `${nfRub2.format(price)} руб.`;
    updatePayButtons();
  }

  // Слушаем изменения получателя (в т.ч. при «купить себе», т.к. там диспатчится 'input')
  unameEl?.addEventListener('input', updatePayButtons);

  // Первичный рендер
  renderTotal();
})();

// Универсально читаем username пользователя из Telegram или из ?tg_username
function readSelfUsername(){
  try{
    const tg = window.Telegram && window.Telegram.WebApp;
    tg?.ready?.();
    const u = tg?.initDataUnsafe?.user?.username;
    if (u) return String(u).trim();
  }catch{}

  // локальная отладка: /page.html?tg_username=YourName
  try{
    const q = new URLSearchParams(location.search).get('tg_username');
    if (q) return String(q).trim();
  }catch{}

  return null;
}

// мягкий показ тоста (если есть API)
function toast(msg){
  window.Telegram?.WebApp?.showToast?.(msg);
}

// ===== «Купить себе» (подставить @username в поле получателя) =====
(function(){
  const btn   = document.getElementById('buyForMeBtn');
  const input = document.getElementById('tgUsername');
  if (!btn || !input) return;

  btn.addEventListener('click', () => {
    const me = readSelfUsername();
    if (!me){ toast('В вашем профиле Telegram не указан username'); return; }

    // нормализация как на странице со звёздами
    const core = me.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32);
    input.value = core ? '@' + core : '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
  });
})();

// ===== «указать мой юзернейм» (в поле Отправитель, лимит 24) =====
(function(){
  const btn   = document.getElementById('fillMyUsernameBtn');
  const input = document.getElementById('senderInput');
  if (!btn || !input) return;

  btn.addEventListener('click', () => {
    const me = readSelfUsername();
    if (!me){ toast('В вашем профиле Telegram не указан username'); return; }

    // поле отправителя допускает любые символы, но мы вставляем корректный @username
    const val = '@' + me.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 23); // 1 символ уже займёт '@'
    input.value = val.slice(0, 24);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
  });
})();

