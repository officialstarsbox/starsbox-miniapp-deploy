/* =========================================================
   StarsBox Mini App — core
   Обновлено: фикс шапки (Telegram init) + автозапуск карусели
   + надёжная навигация по плиткам
========================================================= */

/* ---------- Telegram helpers ---------- */
function getTG(){
  return (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
}
function initTelegram(){
  const tg = getTG();
  if (!tg) return;
  try { tg.expand(); } catch {}
  try { tg.ready(); }  catch {}
}

/* ---------- Попап-заглушка ---------- */
function showStub(title, message){
  const tg = getTG();
  if (tg) tg.showPopup({ title, message, buttons:[{id:"ok",text:"Ок",type:"default"}] });
  else alert(`${title}\n\n${message}`);
}

/* ---------- Шапка: данные пользователя из Telegram (с ретраями) ---------- */
function populateHeaderFromTelegram(retries = 20){
  const tg = getTG();
  const titleEl  = document.querySelector(".app-header .account .title");
  const subEl    = document.querySelector(".app-header .account .subtitle");
  const avatarEl = document.querySelector(".app-header .avatar");
  if (!titleEl || !subEl || !avatarEl) return;

  const data = tg?.initDataUnsafe;
  const u = data?.user;
  const chat = data?.chat;

  // ждём пока Telegram инициализируется
  if (!u && !chat && retries > 0){
    setTimeout(()=>populateHeaderFromTelegram(retries-1), 150);
    return;
  }
  if (!u && !chat) return; // вне Телеграма — оставляем дефолт

  // Имя
  let displayName = null;
  if (u){
    const first = u.first_name || "";
    const last  = u.last_name || "";
    displayName = (first + " " + last).trim() || (u.username ? "@"+u.username : null);
  } else if (chat){
    displayName = chat.title || null;
  }
  if (displayName) titleEl.textContent = displayName;

  // @username
  subEl.textContent = u?.username ? "@"+u.username : (subEl.textContent || "");

  // Аватар
  if (u?.photo_url){
    avatarEl.textContent = "";
    const img = new Image();
    img.alt = ((u.first_name?.[0] || "") + (u.last_name?.[0] || "")).toUpperCase();
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.draggable = false;
    img.style.borderRadius = "50%";
    img.src = u.photo_url;
    img.onload  = ()=>{ avatarEl.innerHTML = ""; avatarEl.appendChild(img); };
    img.onerror = ()=>{ /* оставим инициалы/градиент */ };
  } else if (u){
    const initials = ((u.first_name?.[0] || "") + (u.last_name?.[0] || "")).toUpperCase();
    if (initials) avatarEl.textContent = initials;
  }

  applyTitleLimit(23);
}

/* ---------- Ограничение длины заголовка ---------- */
function applyTitleLimit(maxLen = 23){
  const el = document.querySelector(".app-header .account .title");
  if (!el) return;
  const original = (el.textContent || "").trim();
  if (original.length > maxLen){
    const dots = "...";
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
    return new Promise(res=>{
      img.addEventListener("load", res, {once:true});
      img.addEventListener("error", res, {once:true});
    });
  }));
}

/* ---------- Бесшовная карусель (Подарки) ---------- */
async function initInfiniteCarousel(){
  const panel = document.querySelector(".panel--gifts");
  if (!panel) return;

  const rail  = panel.querySelector(".carousel");
  const track = panel.querySelector(".carousel-track");
  if (!rail || !track) return;

  await waitImages(track);

  const originals = Array.from(track.children);
  if (originals.length === 0) return;

  const cs = getComputedStyle(track);
  const gap = parseFloat(cs.gap || cs.columnGap || "0") || 0;
  let cycleWidth = originals.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0) + gap * (originals.length - 1);

  // клонируем, чтобы получился «бесконечный» трек
  for (let i=0;i<2;i++) originals.forEach(n=>track.appendChild(n.cloneNode(true)));

  // скорость из CSS-переменной, или дефолт (px/сек)
  const cssSpeed = parseFloat(getComputedStyle(panel).getPropertyValue("--scroll-speed"));
  let speed = Number.isFinite(cssSpeed) && cssSpeed > 0 ? cssSpeed : 40;

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

  // пересчёт после ресайза
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

/* ---------- Debug overlay (?debug=1) ---------- */
function debugOverlay(){
  const qs = new URLSearchParams(location.search);
  if (!qs.has("debug")) return;
  const pre = document.createElement("pre");
  pre.style.cssText = "position:fixed;left:8px;bottom:8px;max-width:92vw;max-height:45vh;overflow:auto;z-index:99999;background:rgba(0,0,0,.75);color:#9fef00;padding:10px 12px;border-radius:10px;font:12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;box-shadow:0 8px 24px rgba(0,0,0,.4)";
  const tg = getTG();
  const dump = { isTelegram: !!tg, version: tg?.version || null, platform: tg?.platform || null, initDataUnsafe: tg?.initDataUnsafe || null };
  pre.textContent = JSON.stringify(dump, null, 2);
  document.body.appendChild(pre);
}

/* ---------- Навигация / клики по плиткам ---------- */
function bindStubs(){
  // Централизованное делегирование — ловим клики и по вложенным узлам
  document.addEventListener("click", (e)=>{
    const el = e.target.closest("[data-action]");
    if (!el) return;

    const act = el.getAttribute("data-action");

    // Нижняя «Главная» — если задан data-home, то переходим
    if (act === "tab-home"){
      const target = el.dataset.home || el.getAttribute("data-home");
      if (target) window.location.href = target;
      return;
    }

    // Маршруты панелей
    const ROUTE = {
      "buy-stars": "./pages/stars/index.html",
      "gifts":     "./pages/gifts/index.html",
      "steam":     "./pages/steam/index.html"
    };
    if (ROUTE[act]){
      window.location.href = ROUTE[act];
      return;
    }

    // Переключатели вкладок (пока просто подсветка)
    if (act?.startsWith("tab-")) {
      document.querySelectorAll(".nav-item").forEach(n=>n.classList.remove("is-active"));
      el.classList.add("is-active");
      return;
    }

    // Остальные — заглушка
    const nice = { "sell-stars":"Продать звёзды", "steam":"STEAM", "settings":"Настройки" }[act] || act;
    showStub(nice, "Раздел в разработке.");
  }, {passive:true});
}

/* ---------- Init ---------- */
window.addEventListener("DOMContentLoaded", ()=>{
  initTelegram();                 // гарантируем готовность Telegram SDK
  populateHeaderFromTelegram();   // подставим имя/аватар
  applyTitleLimit(23);

  initInfiniteCarousel();         // сразу запускаем карусель
  bindStubs();
  debugOverlay();
});
