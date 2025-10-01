/* StarsBox Mini App — BUY page logic */

const PRICE_PER_STAR = 1.6; // ₽ за 1 звезду

document.addEventListener('DOMContentLoaded', () => {
  // поля
  const usernameEl = document.getElementById('telegramUsername');
  const qtyEl      = document.getElementById('starsQuantity');

  attachUsernameInputGuards();
  bindUsernameHelpers();

  // (если используешь формы) — отключим нативную браузерную валидацию,
  // чтобы не появлялась «красная» обводка
  document.querySelectorAll('form').forEach(f => f.setAttribute('novalidate','novalidate'));


  // ввод кол-ва вручную — снимаем выбор пакета
  if (qtyEl) {
    qtyEl.addEventListener('input', () => {
      clearPackageSelection();
      updateStarsTotalAmount();
    });
  }

  // выбор пакета
  document.querySelectorAll('.stars-package-radio').forEach(r => {
    r.addEventListener('change', (e) => {
      const v = parseInt(e.target.value, 10);
      if (Number.isFinite(v) && qtyEl){
        qtyEl.value = String(v);
        refreshStarsSelectionUI();
        updateStarsTotalAmount();
      }
    });
  });

  // кнопка «Показать/Свернуть пакеты»
  const toggleBtn = document.getElementById('togglePackages');
  const hiddenBox = document.getElementById('additionalPackages');
  if (toggleBtn && hiddenBox){
    toggleBtn.addEventListener('click', () => {
      const opened = hiddenBox.classList.toggle('is-open');
      toggleBtn.textContent = opened ? 'Свернуть список пакетов' : 'Показать все пакеты';
      toggleBtn.blur(); // снимаем фокус, чтобы не было залипания стилей
    });
  }

  // первичная инициализация
  updateStarsTotalAmount();
  refreshStarsSelectionUI();

  // автодобавление @ в username по уходу фокуса
  if (usernameEl) usernameEl.addEventListener('blur', updateTelegramUsername);
});

/* --- utils --- */

/** снять отметку у всех пакетов (и визуальный класс) */
function clearPackageSelection(){
  document.querySelectorAll('.stars-package-radio:checked')
    .forEach(r => { r.checked = false; });
  document.querySelectorAll('.stars-package-item.is-selected')
    .forEach(el => el.classList.remove('is-selected'));
}

/** пересчёт «Итого» + блок/разблок кнопок оплаты */
function updateStarsTotalAmount(){
  const qtyEl   = document.getElementById('starsQuantity');
  const totalEl = document.getElementById('totalAmount');
  if (!qtyEl || !totalEl) return;

  const qty = Number(qtyEl.value);
  const validQty = Number.isInteger(qty) && qty >= 50 && qty <= 20000;
  const sum = validQty ? qty * PRICE_PER_STAR : 0;
  totalEl.value = `${sum.toFixed(2)} ₽`;

  const okU = validateUsername(document.getElementById('telegramUsername'));
  const okQ = validateStarsQty(qtyEl);
  toggleStarsPay(!(okU && okQ));
}

/** автодобавить @ */
function updateTelegramUsername(){
  const input = document.getElementById('telegramUsername');
  if (!input) return;
  let v = (input.value || '').trim();
  if (v && !v.startsWith('@')) input.value = '@' + v;
}

function validateUsername(inputEl){
  if (!inputEl) return false;
  let v = (inputEl.value || '').trim();
  if (v && !v.startsWith('@')) { v = '@' + v; inputEl.value = v; }
  const ok = !!v && TG_RE.test(v);
  inputEl.classList.toggle('input--error', !ok);
  return ok;
}

// Разрешаем только @ в начале + a-z A-Z 0-9 _
function sanitizeUsernameValue(raw){
  if (!raw) return "";
  let v = raw.replace(/\s+/g, "");                   // без пробелов
  // оставляем только допустимые символы
  v = v.replace(/[^@a-zA-Z0-9_]/g, "");
  // @ допустим только первым символом
  if (v.startsWith("@")) v = "@" + v.slice(1).replace(/@/g, "");
  else v = v.replace(/@/g, "");
  return v;
}

function attachUsernameInputGuards(){
  const input = document.getElementById("telegramUsername");
  if (!input) return;

  // чистим на лету
  input.addEventListener("input", () => {
    const cur = input.value;
    const cleaned = sanitizeUsernameValue(cur);
    if (cur !== cleaned) {
      const pos = input.selectionStart || cleaned.length;
      input.value = cleaned;
      try { input.setSelectionRange(pos, pos); } catch {}
    }
    // актуализируем валидацию и состояние оплаты
    const okU = validateUsername(input, document.getElementById('starsUsernameMsg'));
    const okQ = validateStarsQty(document.getElementById('starsQuantity'), document.getElementById('starsQtyMsg'));
    toggleStarsPay(!(okU && okQ));
  });

  // при потере фокуса гарантируем @ в начале (по твоей логике)
  input.addEventListener("blur", () => {
    if (!input.value) return;
    if (!input.value.startsWith("@")) input.value = "@" + input.value;
    validateUsername(input, document.getElementById('starsUsernameMsg'));
  });
}

// переопределяем regex на «строгое» правило Telegram
const TG_RE = /^@?[a-zA-Z0-9_]{5,32}$/;


function validateStarsQty(inputEl){
  if (!inputEl) return false;
  const n = Number(inputEl.value);
  const ok = Number.isInteger(n) && n >= 50 && n <= 20000;
  inputEl.classList.toggle('input--error', !ok);
  return ok;
}

function toggleStarsPay(disabled){
  document.querySelectorAll('.stars-payment-actions .stars-btn')
    .forEach(btn => btn.toggleAttribute('disabled', !!disabled));
}

/** обновить визуальную подсветку выбранного пакета */
function refreshStarsSelectionUI(){
  const cards = document.querySelectorAll('.stars-package-item');
  cards.forEach(c => c.classList.remove('is-selected'));
  const checked = document.querySelector('.stars-package-radio:checked');
  if (checked) checked.closest('.stars-package-item')?.classList.add('is-selected');
}

/* Заглушка оплаты; сюда потом подключишь мерчанта и fragment-service */
async function payStars(method){
  const username = document.getElementById('telegramUsername')?.value?.trim();
  const qty = parseInt(document.getElementById('starsQuantity')?.value || '0', 10);
  if (!validateUsername(document.getElementById('telegramUsername')) ||
      !validateStarsQty(document.getElementById('starsQuantity'))) return;
  alert(`Оплата (${method}): ${username}, ${qty} звёзд`);
}

/* экспорт, если вызываешь из HTML */
window.payStars = payStars;

document.addEventListener('DOMContentLoaded', () => {
  // ...
  document.querySelectorAll('form').forEach(f => f.setAttribute('novalidate','novalidate'));
  // ...
});

function fillUsernameForSelf(){
  const el = document.getElementById("telegramUsername");
  if (!el) return;
  const u = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user : null;
  const uname = u?.username;
  if (!uname) {
    showStub("Нет username", "В вашем аккаунте Telegram не задан публичный @username. Введите его вручную.");
    return;
    }
  el.value = "@" + sanitizeUsernameValue(uname);
  el.dispatchEvent(new Event("input", {bubbles:true}));
}

function bindUsernameHelpers(){
  document.getElementById("btnFillSelf")?.addEventListener("click", fillUsernameForSelf);
  document.getElementById("btnPickContact")?.addEventListener("click", pickUsernameFromContacts);
}

// ===== Back: history.back() с резервом на главную =====
function goBack(){
  // в мини-аппах бывает пустая история — делаем запасной переход
  if (document.referrer && document.referrer !== location.href && history.length > 1){
    history.back();
  } else {
    window.location.href = "../index.html";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("backBtn")?.addEventListener("click", goBack);
});
