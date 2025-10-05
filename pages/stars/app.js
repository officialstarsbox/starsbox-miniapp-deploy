(function () {
  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
  const $ = (s, r) => (r || document).querySelector(s);

  function normalizeWithAt(raw){
    const core = String(raw || '').replace(/@/g,'').replace(/[^a-zA-Z0-9_]/g,'').slice(0,32);
    return core ? '@' + core : '';
  }
  function getSelfUsername(){
    const tg = window.Telegram && window.Telegram.WebApp;
    tg?.ready?.();
    const u = tg?.initDataUnsafe?.user?.username;
    if (u) return String(u).replace(/[^a-zA-Z0-9_]/g,'').slice(0,32);
    try{
      const p = new URLSearchParams(location.search);
      const q = p.get('tg_username');
      return q ? String(q).replace(/[^a-zA-Z0-9_]/g,'').slice(0,32) : null;
    }catch{ return null; }
  }

  ready(function () {
    // back
    const backBtn = $('#backBtn');
    if (backBtn){
      const url = new URL(window.location.href);
      const back = url.searchParams.get('back');
      backBtn.addEventListener('click', () => back ? (window.location.href = back) : history.back());
    }

    // username
    const usernameInput = $('#tgUsername');
    if (usernameInput){
      usernameInput.addEventListener('input', () => {
        const v = usernameInput.value;
        const nv = normalizeWithAt(v);
        if (v !== nv){
          usernameInput.value = nv;
          try{ usernameInput.setSelectionRange(nv.length, nv.length); }catch(e){}
        }
      });
      usernameInput.addEventListener('blur', () => {
        if (usernameInput.value === '@') usernameInput.value = '';
      });
      usernameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter'){ e.preventDefault(); usernameInput.blur(); }
      });
    }

    // stars amount — только цифры
    const starsAmount = $('#starsAmount');
    if (starsAmount){
      const digitsOnly = s => String(s || '').replace(/\D+/g, '');
      starsAmount.addEventListener('input', () => {
        const v = starsAmount.value;
        const nv = digitsOnly(v).slice(0,5); // 20000 -> 5 знаков
        if (v !== nv){
          starsAmount.value = nv;
          try{ starsAmount.setSelectionRange(nv.length, nv.length); }catch(e){}
        }
      });
      starsAmount.addEventListener('beforeinput', e => {
        if (e.inputType === 'insertText' && /\D/.test(e.data)) e.preventDefault();
      });
      starsAmount.addEventListener('keydown', e => {
        if (e.key === 'Enter'){ e.preventDefault(); starsAmount.blur(); }
      });
    }

    // купить себе
    const buySelfBtn = document.querySelector('#buySelfBtn') || document.querySelector('#buyForMeBtn');
    if (buySelfBtn && usernameInput){
      const me = getSelfUsername();
      buySelfBtn.addEventListener('click', () => {
        if (!me){
          window.Telegram?.WebApp?.showToast?.('В вашем профиле Telegram не указан username');
          return;
        }
        usernameInput.value = '@' + me;
        usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
        usernameInput.blur();
      });
    }

    // сворачиваем клавиатуру по тапу вне инпута
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
      /* ====================== Пакеты ====================== */
    const packsList   = $('#packsList');
    const packsToggle = $('#packsToggle');
    let activePackEl  = null;
    let suppressClear = false; // чтобы не сбрасывать активный пакет при программной подстановке

    // Проставим иконки из data-атрибутов
    if (packsList){
      packsList.querySelectorAll('.pack-item').forEach(btn => {
        const img = btn.querySelector('.pack-icon img');
        const icon = btn.getAttribute('data-icon');
        if (img && icon) img.src = icon;
      });
    }

    // Переключение развёрнутого списка
    packsToggle?.addEventListener('click', () => {
      const collapsed = packsList.getAttribute('data-collapsed') === 'true';
      packsList.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
      packsToggle.textContent = collapsed ? 'Свернуть список пакетов' : 'Показать все пакеты';
      // Кнопка автоматически «уезжает» вниз, так как стоит после списка
    });

    // Выбор пакета
    packsList?.addEventListener('click', (e) => {
      const btn = e.target.closest('.pack-item');
      if (!btn) return;

      // Снять активность с предыдущего
      if (activePackEl && activePackEl !== btn){
        activePackEl.classList.remove('is-active');
        const oldImg = activePackEl.querySelector('.pack-icon img');
        const oldIcon = activePackEl.getAttribute('data-icon');
        if (oldImg && oldIcon) oldImg.src = oldIcon;
      }

      // Тоггл: если клик по уже активному — деактивировать
      const isActive = btn.classList.toggle('is-active');
      const img = btn.querySelector('.pack-icon img');
      if (isActive){
        activePackEl = btn;
        // заменить иконку на активную
        const act = btn.getAttribute('data-icon-active');
        if (img && act) img.src = act;

        // подставить кол-во звёзд в инпут
        const count = String(btn.getAttribute('data-stars') || '').replace(/\D+/g, '');
        if (count && starsAmount){
          suppressClear = true;
          starsAmount.value = count;
          starsAmount.dispatchEvent(new Event('input', { bubbles: true }));
          // отпускаем флаг после микротаска, чтобы 'input' не счёл это ручным вводом
          queueMicrotask(() => { suppressClear = false; });
        }
      } else {
        // вернули в неактивное состояние
        activePackEl = null;
        const def = btn.getAttribute('data-icon');
        if (img && def) img.src = def;
      }
    });

    // Любой ручной ввод в поле кол-ва звёзд — сбрасывает выбранный пакет
    starsAmount?.addEventListener('input', () => {
      if (suppressClear) return; // это была программная подстановка
      if (!activePackEl) return;
      // деактивируем
      const img = activePackEl.querySelector('.pack-icon img');
      const def = activePackEl.getAttribute('data-icon');
      activePackEl.classList.remove('is-active');
      if (img && def) img.src = def;
      activePackEl = null;
    });

    // ===== Итоговая стоимость =====
const nfRub2 = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

// где брать цену за 1 звезду: приоритет — window.STAR_RATE → data-rate → 1.7
function getStarRate(){
  const fromWin  = Number(window.STAR_RATE);
  if (!isNaN(fromWin) && fromWin > 0) return fromWin;

  const totalCard = document.getElementById('totalCard');
  const fromAttr  = Number(totalCard?.dataset?.rate);
  if (!isNaN(fromAttr) && fromAttr > 0) return fromAttr;

  return 1.7;
}

const totalValueEl = document.getElementById('totalValue');
const starsAmountEl = document.getElementById('starsAmount');

function updateTotal(){
  const qty = Number((starsAmountEl?.value || '').replace(/\D+/g, '')); // только цифры
  const rate = getStarRate();
  const sum  = qty > 0 ? qty * rate : 0;
  if (totalValueEl){
    totalValueEl.textContent = `${nfRub2.format(sum)} руб.`;
  }
}

// пересчитываем при любом вводе/изменении количества
starsAmountEl?.addEventListener('input', updateTotal);
// если где-то меняешь цену динамически — вызови updateTotal()
updateTotal(); // первичный вывод
})();
