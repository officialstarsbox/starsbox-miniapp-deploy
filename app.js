/* =========================================================
   StarsBox Mini App — JS
   - Telegram SDK init
   - Заглушки
   - Шапка: подстановка имени/username/аватара из Telegram
   - Ограничение длины имени (≤23 символов)
   - Бесшовная карусель подарков (requestAnimationFrame)
   - Debug overlay (?debug=1)
========================================================= */

const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) { tg.expand(); tg.ready(); }

/* ---------- Заглушки ---------- */
function showStub(title, message){
  if (tg) tg.showPopup({ title, message, buttons:[{id:"ok",text:"Ок",type:"default"}] });
  else alert(`${title}\n\n${message}`);
}
function bindStubs(){
  document.querySelectorAll("[data-action]").forEach(el=>{
    el.addEventListener("click", (e)=>{
      const act = el.getAttribute("data-action");

      // Кнопка "Главная": если задан data-home — переходим
      if (act === "tab-home"){
        const target = el.dataset.home || el.getAttribute("data-home");
        if (target) window.location.href = target;
        return;
      }

      // Если на элементе задан явный адрес — навигируем туда
      const explicitHref = el.dataset.href || el.getAttribute("data-href");
      if (explicitHref) {
        window.location.href = explicitHref;
        return;
      }

      // Переключатели вкладок (пока заглушки визуала)
      if (act?.startsWith("tab-")) {
        document.querySelectorAll(".nav-item").forEach(n=>n.classList.remove("is-active"));
        el.classList.add("is-active");
        return;
      }

      // Явный роутинг по action (минимум нужного)
      if (act === "buy-stars") {
        window.location.href = "./pages/buy.html";
        return;
      }

      // Остальные действия — заглушка
      const nice = {
        "sell-stars":"Продать звёзды",
        "gifts":"Подарки",
        "steam":"STEAM",
        "settings":"Настройки",
        "buy-stars":"Купить звёзды"
      }[act] || act;
      showStub(nice, "Раздел в разработке.");
    });
  });
}

/* ---------- Debug overlay (?debug=1) ---------- */
function debugOverlay(){
  const qs = new URLSearchParams(location.search);
  if (!qs.has("debug")) return;
  const pre = document.createElement("pre");
  pre.style.cssText = "position:fixed;left:8px;bottom:8px;max-width:92vw;max-height:45vh;overflow:auto;z-index:99999;background:rgba(0,0,0,.75);color:#9fef00;padding:10px 12px;border-radius:10px;font:12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;box-shadow:0 8px 24px rgba(0,0,0,.4)";
  const dump = {
    isTelegram: !!tg,
    version: tg?.version || null,
    platform: tg?.platform || null,
    initDataUnsafe: tg?.initDataUnsafe || null
  };
  pre.textContent = JSON.stringify(dump, null, 2);
  document.body.appendChild(pre);
}

/* ---------- Шапка: данные пользователя из Telegram ---------- */
function populateHeaderFromTelegram(){
  const titleEl  = document.querySelector(".app-header .account .title");
  const subEl    = document.querySelector(".app-header .account .subtitle");
  const avatarEl = document.querySelector(".app-header .avatar");
  if (!titleEl || !subEl || !avatarEl) return;

  // вне Telegram оставляем макет как есть
  const data = tg?.initDataUnsafe || null;
  if (!data) return;

  // user — в приватном чате; chat — если открыли в группе/канале (на всякий случай)
  const u = data.user || null;
  const chat = data.chat || null;

  // составим отображаемое имя
  let displayName = null;
  if (u) {
    const first = u.first_name || "";
    const last  = u.last_name  || "";
    displayName = (first + " " + last).trim() || (u.username ? "@" + u.username : null);
  } else if (chat) {
    displayName = chat.title || null; // fallback для случаев старта из групп/каналов
  }

  if (displayName) titleEl.textContent = displayName;
  subEl.textContent = u?.username ? "@" + u.username : (subEl.textContent || "");

  // аватар
  if (u?.photo_url) {
    avatarEl.textContent = "";
    const img = new Image();
    img.alt = ((u.first_name?.[0] || "") + (u.last_name?.[0] || "")).toUpperCase();
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
 img.style.borderRadius = "50%";
 img.draggable = false;
    img.src = u.photo_url;
    img.onload = ()=>{ avatarEl.innerHTML = ""; avatarEl.appendChild(img); };
    img.onerror = ()=>{ /* оставим инициалы/градиент */ };
    avatarEl.appendChild(img);
  } else if (u) {
    const initials = ((u.first_name?.[0] || "") + (u.last_name?.[0] || "")).toUpperCase();
    if (initials) avatarEl.textContent = initials;
  }

  // ограничим длину
  applyTitleLimit(23);
}

/* ---------- Лимит длины имени в шапке (<= 23 символов) ---------- */
function applyTitleLimit(maxLen = 23){
  const el = document.querySelector(".app-header .account .title");
  if (!el) return;
  const original = (el.textContent || "").trim();
  const dots = "...";
  if (original.length > maxLen){
    const keep = Math.max(0, maxLen - dots.length);
    el.textContent = original.slice(0, keep).trimEnd() + dots;
  }
}

/* ---------- Вспомогательное: ждём загрузки изображений ---------- */
function waitImages(elem){
  const imgs = Array.from(elem.querySelectorAll("img"));
  if (imgs.length === 0) return Promise.resolve();
  return Promise.all(imgs.map(img=>{
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise(res=>{ img.addEventListener("load", res, {once:true}); img.addEventListener("error", res, {once:true}); });
  }));
}

/* ---------- Бесшовная карусель (панель Подарков) ---------- */
async function initInfiniteCarousel(){
  const panel = document.querySelector(".panel--gifts");
  if (!panel) return;

  const rail = panel.querySelector(".carousel");
  const track = panel.querySelector(".carousel-track");
  if (!rail || !track) return;

  await waitImages(track);

  const originals = Array.from(track.children);
  if (originals.length === 0) return;

  const cs = getComputedStyle(track);
  const gap = parseFloat(cs.gap || cs.columnGap || "0") || 0;
  let cycleWidth = originals.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0) + gap * (originals.length - 1);

  for (let i=0;i<2;i++) originals.forEach(n=>track.appendChild(n.cloneNode(true)));

  const cssSpeed = parseFloat(getComputedStyle(panel).getPropertyValue("--scroll-speed")) || 30;
  let speed = cssSpeed;

  let offset = 0;
  let last = performance.now();

  function frame(now){
    const dt = (now - last) / 1000;
    last = now;
    offset -= speed * dt;
    if (offset <= -cycleWidth) offset += cycleWidth;
    track.style.transform = `translateX(${offset}px)`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  let t;
  window.addEventListener("resize", ()=>{
    clearTimeout(t);
    t = setTimeout(()=>{
      const base = Array.from(track.children).slice(0, originals.length);
      const gap2 = parseFloat((getComputedStyle(track).gap || "0")) || 0;
      cycleWidth = base.reduce((s, el) => s + el.getBoundingClientRect().width, 0) + gap2 * (base.length - 1);
    }, 150);
  });
}

/* ---------- Routing / actions (делегирование) ---------- */
(function enableRouting(){
  const ROUTE = {
    "buy-stars": "./pages/buy.html",          // путь к странице покупки звёзд
    "gifts":     "./pages/gifts/index.html"   // страница каталога подарков
  };

  // Один обработчик на весь документ
  document.addEventListener("click", (e)=>{
    const el = e.target.closest("[data-action]");
    if (!el) return;

    const act = el.getAttribute("data-action");

    // Нижняя кнопка «Главная» — вернуть на главную, если есть data-home
    if (act === "tab-home"){
      const target = el.dataset.home || el.getAttribute("data-home");
      if (target) window.location.href = target;   // на главной data-home можно не задавать
      e.preventDefault();
      return;
    }

    // Если для действия задан маршрут — переходим
    if (ROUTE[act]){
      window.location.href = ROUTE[act];
      e.preventDefault();
      return;
    }

    // Остальные пункты нижнего меню пока просто подсвечиваем
    if (act && act.startsWith("tab-")) {
      document.querySelectorAll(".nav-item").forEach(n=>n.classList.remove("is-active"));
      el.classList.add("is-active");
      e.preventDefault();
      return;
    }

    // Прочие действия — заглушка
    const nice = {
      "sell-stars":"Продать звёзды",
      "steam":"STEAM",
      "settings":"Настройки"
    }[act] || act;
    showStub(nice, "Раздел в разработке.");
  }, { passive: true });

  // Если где-то ещё остался старый bindStubs(), его можно удалить/не вызывать.
})();

// уже есть: initInfiniteCarousel() в DOMContentLoaded
// добавим переинициализацию при возврате на вкладку/при ресайзе
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    try { initInfiniteCarousel(); } catch (e) {}
  }
});
window.addEventListener('resize', () => {
  try { initInfiniteCarousel(); } catch (e) {}
});

// --- Глобальная кнопка "назад" ---
// Сработает для любого элемента с атрибутом [data-back]
document.addEventListener('click', (e) => {
  const backBtn = e.target.closest('[data-back]');
  if (!backBtn) return;

  e.preventDefault();

  // 1) если есть история внутри мини-аппа — вернёмся
  if (history.length > 1) {
    history.back();
    return;
  }

  // 2) fallback по ?from=... (buy|gifts), иначе — на список подарков
  const qs = new URLSearchParams(location.search);
  const from = qs.get('from');
  const fallback =
    from === 'buy'   ? '../buy.html' :
    from === 'gifts' ? './index.html' :
                       './index.html';

  location.href = fallback;
});

