/* Gift page logic — единая карточка с формой */
const tg = window.Telegram?.WebApp || null;
if (tg) { tg.expand(); tg.ready(); }

/* ---- utils ---- */
const PRICE_PER_STAR = 1.6; // не используется тут, но оставлено для совместимости
const TG_RE = /^@?[a-zA-Z0-9_]{5,32}$/;

function qs(sel){ return document.querySelector(sel); }

/* — sanitize username (латиница/цифры/_) и один @ только в начале */
function sanitizeUsernameValue(raw){
  if (!raw) return "";
  let v = raw.replace(/\s+/g,"");               // без пробелов
  v = v.replace(/[^@a-zA-Z0-9_]/g,"");          // допустимые сим-лы
  if (v.startsWith("@")) v = "@"+v.slice(1).replace(/@/g,"");
  else v = v.replace(/@/g,"");
  return v;
}
function validateUsername(input){
  if (!input) return false;
  let v = (input.value || "").trim();
  if (v && !v.startsWith("@")) { v = "@"+v; input.value = v; }
  const ok = !!v && TG_RE.test(v);
  input.classList.toggle("input--error", !ok);
  return ok;
}
function togglePay(disabled){
  document.querySelectorAll(".gift-pay .stars-btn").forEach(b=>b.disabled = !!disabled);
}

/* ---- инициализация данных подарка из query ---- */
function parseGiftQuery(){
  const p = new URLSearchParams(location.search);
  const img = p.get("img") || "../../assets/gifts/медведь.gif";
  const price = Number(p.get("price") || 0);
  const title = p.get("title") || "Подарок";
  return { img, price, title };
}

/* ---- сборка preview-текста из подписи и сообщения ---- */
function buildPreviewText(){
  const s = (qs("#senderInput")?.value || "").trim();
  const m = (qs("#messageInput")?.value || "").trim();
  if (!s && !m) return "«Отправитель» и «Сообщение»";
  let parts = [];
  if (s) parts.push("Отправитель: " + s);
  if (m) parts.push(m);
  return parts.join(" | ");
}

/* ---- main ---- */
document.addEventListener("DOMContentLoaded", () => {
  // отключим нативную валидацию — уберём красные рамки браузера
  document.querySelectorAll("form").forEach(f => f.setAttribute("novalidate","novalidate"));

  const data = parseGiftQuery();
  // картинка и цена
  const imgEl = qs("#giftImg");
  imgEl.src = data.img;
  imgEl.alt = data.title || "Подарок";

  // back
  qs("#giftBackBtn")?.addEventListener("click", () => {
    if (document.referrer && new URL(document.referrer).origin === location.origin){
      history.back();
    } else {
      location.href = "./index.html";
    }
  });

  // получатель
  const userEl = qs("#telegramUsername");
  userEl.addEventListener("input", () => {
    const cur = userEl.value; const clean = sanitizeUsernameValue(cur);
    if (cur !== clean){ userEl.value = clean; }
    const okU = validateUsername(userEl);
    togglePay(!okU);
  });
  userEl.addEventListener("blur", () => validateUsername(userEl));

  // кнопка «купить себе»
  qs("#btnFillSelf")?.addEventListener("click", () => {
    const u = tg?.initDataUnsafe?.user?.username;
    if (!u) { alert("В вашем аккаунте Telegram не задан публичный @username."); return; }
    userEl.value = "@"+sanitizeUsernameValue(u);
    userEl.dispatchEvent(new Event("input",{bubbles:true}));
  });

  // Отправитель (toggle)
  const senderBlock = qs("#senderBlock");
  qs("#btnToggleSender")?.addEventListener("click", () => {
    senderBlock.hidden = !senderBlock.hidden;
  });

  // «Указать мой никнейм»
  qs("#btnUseMyNick")?.addEventListener("click", () => {
    const u = tg?.initDataUnsafe?.user?.username;
    if (!u) { alert("В вашем аккаунте Telegram не задан публичный @username."); return; }
    const el = qs("#senderInput");
    el.value = "@"+sanitizeUsernameValue(u);
    qs("#senderCnt").textContent = `${el.value.length}/24`;
    updatePreview();
  });

  // счётчики и превью
  qs("#senderInput")?.addEventListener("input", (e) => {
    const el = e.currentTarget;
    // maxLength уже стоит, но на всякий случай режем руками
    el.value = el.value.slice(0, 24);
    qs("#senderCnt").textContent = `${el.value.length}/24`;
    updatePreview();
  });

  qs("#messageInput")?.addEventListener("input", (e) => {
    const el = e.currentTarget;
    el.value = el.value.slice(0, 91);
    qs("#messageCnt").textContent = `${el.value.length}/91`;
    updatePreview();
  });

  function updatePreview(){
    qs("#giftPreviewText").textContent = buildPreviewText();
  }
  updatePreview();

  // Сообщение (toggle)
  const msgBlock = qs("#messageBlock");
  qs("#btnToggleMsg")?.addEventListener("click", () => {
    msgBlock.hidden = !msgBlock.hidden;
  });

  // оплата (заглушки — подключишь мерчанта)
  qs("#paySbp")?.addEventListener("click", () => handlePay("sbp_qr", data));
  qs("#payCrypto")?.addEventListener("click", () => handlePay("crypto", data));

  // первичная блокировка кнопок до валидного username
  togglePay(!validateUsername(userEl));
});

function handlePay(method, gift){
  const username = qs("#telegramUsername")?.value?.trim();
  if (!validateUsername(qs("#telegramUsername"))) return;
  const payload = {
    method,
    username,
    gift_title: gift.title,
    gift_img: gift.img,
    amount_rub: Number(gift.price || 0)
  };
  // TODO: интеграция с твоим мерчантом и fragment-service
  alert(`Оплата (${method}) → ${username}\nСумма: ${payload.amount_rub} ₽\nПодарок: ${payload.gift_title}`);
}

/* Gift item page — источник правды о цене теперь не зависит от плашки вверху */

(() => {
  // Фолбэк-справочник цен по id подарка (если не передали price в URL/атрибуте)
  const GIFT_CATALOG = {
    heart:      { price: 25,  img: '../../assets/gifts/сердце.gif',    title: 'Сердце' },
    bear:       { price: 25,  img: '../../assets/gifts/медведь.gif',    title: 'Медведь' },
    box:        { price: 41,  img: '../../assets/gifts/подарок.gif',    title: 'Подарок' },
    rose:       { price: 41,  img: '../../assets/gifts/роза.gif',       title: 'Роза' },
    cake:       { price: 82,  img: '../../assets/gifts/торт.gif',       title: 'Торт' },
    bouquet:    { price: 82,  img: '../../assets/gifts/букет.gif',      title: 'Букет' },
    rocket:     { price: 82,  img: '../../assets/gifts/ракета.gif',     title: 'Ракета' },
    champagne:  { price: 82,  img: '../../assets/gifts/бутылка.gif',    title: 'Шампанское' },
    cup:        { price: 164, img: '../../assets/gifts/кубок.gif',      title: 'Кубок' },
    diamond:    { price: 164, img: '../../assets/gifts/брилиант.gif',   title: 'Бриллиант' },
    ring:       { price: 164, img: '../../assets/gifts/кольцо.gif',     title: 'Кольцо' },
  };

  function getGiftId() {
    return new URLSearchParams(location.search).get('id') || 
           document.getElementById('giftRoot')?.dataset.giftId || '';
  }

  function getGiftPrice() {
    const qs = new URLSearchParams(location.search);

    // 1) сначала берём из ?price=...
    const p1 = Number(qs.get('price'));
    if (Number.isFinite(p1) && p1 > 0) return p1;

    // 2) затем из data-price на корневом контейнере (если ты захочешь так передавать)
    const root = document.getElementById('giftRoot');
    const p2 = Number(root?.dataset.price);
    if (Number.isFinite(p2) && p2 > 0) return p2;

    // 3) фолбэк — из локального справочника по id
    const id = getGiftId();
    const fromCatalog = GIFT_CATALOG[id]?.price;
    return Number.isFinite(fromCatalog) ? fromCatalog : 0;
  }

  function fillGiftMediaIfNeeded() {
    const id = getGiftId();
    const cat = GIFT_CATALOG[id];
    if (!cat) return;

    const imgEl = document.querySelector('.gift-hero img');
    if (imgEl && cat.img) {
      imgEl.src = cat.img;
      imgEl.alt = cat.title || 'Подарок';
    }
    const titleEl = document.querySelector('.page-title');
    if (titleEl && cat.title) {
      // опционально: дописать название в заголовок
      // titleEl.textContent = `Telegram-подарок — ${cat.title}`;
    }
  }

  function setTotal(price) {
    const totalEl = document.getElementById('totalAmount');
    if (totalEl) {
      totalEl.value = `${price.toFixed(2)} ₽`;
      totalEl.dataset.amount = String(price);
    }
    // чтобы плательщики знали сумму
    document.querySelectorAll('.stars-btn').forEach(btn => {
      btn.dataset.amount = String(price);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    fillGiftMediaIfNeeded();
    setTotal(getGiftPrice());
  });

  // Если у тебя есть динамика (например, смена подарка без перезагрузки) — экспорт:
  window.__giftSetTotalFromData = () => setTotal(getGiftPrice());
})();
