/* StarsBox Mini App — BUY page logic (fixed) */

const PRICE_PER_STAR = 1.6; // ₽ за 1 звезду

// Телеграм WebApp объект (безопасно)
const tg = window.Telegram?.WebApp || null;

document.addEventListener('DOMContentLoaded', () => {
  tg?.ready?.(); // корректная инициализация WebApp

  // поля
  const usernameEl = document.getElementById('telegramUsername');
  const qtyEl      = document.getElementById('starsQuantity');

  attachUsernameInputGuards();
  bindUsernameHelpers();

  // отключаем нативную браузерную валидацию у форм (без красной обводки)
  document.querySelectorAll('form').forEach(f => f.setAttribute('novalidate','novalidate'));

  // ввод количества вручную — снимаем выбор пакета и пересчитываем итого
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
      toggleBtn.blur(); // снимаем фокус, чтобы не «залипала»
    });
  }

  // первичная инициализация
  updateStarsTotalAmount();
  refreshStarsSelectionUI();

  // автодобавление @ в username при потере фокуса
  if (usernameEl) usernameEl.addEventListener('blur', updateTelegramUsername);

  // кнопка «Назад» в верхнем баре
  document.getElementById("backBtn")?.addEventListener("click", goBack);
});

/* --- utils --- */

// снять отметку у всех пакетов (и визуальный класс)
function clearPackageSelection(){
  document.querySelectorAll('.stars-package-radio:checked')
    .forEach(r => { r.checked = false; });
  document.querySelectorAll('.stars-package-item.is-selected')
    .forEach(el => el.classList.remove('is-selected'));
}

// пересчёт «Итого» + блок/разблок кнопок оплаты
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

// автодобавить @ (по твоей логике)
function updateTelegramUsername(){
  const input = document.getElementById('telegramUsername');
  if (!input) return;
  let v = (input.value || '').trim();
  if (v && !v.startsWith('@')) input.value = '@' + v;
}

// Валидация username
const TG_RE = /^@?[a-zA-Z0-9_]{5,32}$/;

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
  let v = raw.replace(/\s+/g, "");
  v = v.replace(/[^@a-zA-Z0-9_]/g, "");
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
    const okU = validateUsername(input);
    const okQ = validateStarsQty(document.getElementById('starsQuantity'));
    toggleStarsPay(!(okU && okQ));
  });

  input.addEventListener("blur", () => {
    if (!input.value) return;
    if (!input.value.startsWith("@")) input.value = "@" + input.value;
    validateUsername(input);
  });
}

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

// визуальная подсветка выбранного пакета — по CHECKED, не по фокусу
function refreshStarsSelectionUI(){
  const cards = document.querySelectorAll('.stars-package-item');
  cards.forEach(c => c.classList.remove('is-selected'));
  const checked = document.querySelector('.stars-package-radio:checked');
  if (checked) checked.closest('.stars-package-item')?.classList.add('is-selected');
}

// «Купить себе» — берём username из Telegram WebApp
function fillUsernameForSelf(){
  const el = document.getElementById("telegramUsername");
  if (!el) return;
  const user = tg?.initDataUnsafe?.user || null;
  const uname = user?.username; // публичный @username у аккаунта
  if (!uname) {
    alert("В вашем аккаунте Telegram не задан публичный @username. Введите его вручную.");
    return;
  }
  el.value = "@" + sanitizeUsernameValue(uname);
  el.dispatchEvent(new Event("input", {bubbles:true}));
}

function bindUsernameHelpers(){
  document.getElementById("btnFillSelf")?.addEventListener("click", fillUsernameForSelf);
  document.getElementById("btnPickContact")?.addEventListener("click", () => {
    alert("Выбор из контактов будет добавлен позже.");
  });
}

/* Оплата: заглушка — подключишь мерчанта здесь */
async function payStars(method){
  const username = document.getElementById('telegramUsername')?.value?.trim();
  const qty = parseInt(document.getElementById('starsQuantity')?.value || '0', 10);
  if (!validateUsername(document.getElementById('telegramUsername')) ||
      !validateStarsQty(document.getElementById('starsQuantity'))) return;
  alert(`Оплата (${method}): ${username}, ${qty} звёзд`);
}
window.payStars = payStars;

// Назад (если истории нет — на главную)
function goBack(){
  if (document.referrer && document.referrer !== location.href && history.length > 1){
    history.back();
  } else {
    window.location.href = "../index.html";
  }
}
