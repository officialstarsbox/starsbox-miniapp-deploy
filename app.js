/* =========================================================
   StarsBox Mini App — JS
   - Telegram SDK init
   - Заглушки
   - Ограничение длины имени в шапке (≤23 символов)
   - Бесшовная карусель подарков (requestAnimationFrame)
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
    el.addEventListener("click", ()=>{
      const act = el.getAttribute("data-action");
      if (act?.startsWith("tab-")) {
        document.querySelectorAll(".nav-item").forEach(n=>n.classList.remove("is-active"));
        el.classList.add("is-active");
        return;
      }
      const nice = { "buy-stars":"Купить звёзды", "sell-stars":"Продать звёзды", "gifts":"Подарки", "steam":"STEAM", "settings":"Настройки" }[act] || act;
      showStub(nice, "Раздел в разработке.");
    });
  });
}

/* ---------- Лимит длины имени в шапке (<= 23 символов) ---------- */
function applyTitleLimit(maxLen = 23){
  const el = document.querySelector(".app-header .account .title");
  if (!el) return;

  // используем текст, отданный разметкой или позже подставленный из TG
  const original = (el.textContent || "").trim();

  // хотим итоговую длину <= maxLen; '...' занимает 3 символа
  const dots = "...";
  if (original.length > maxLen){
    const keep = Math.max(0, maxLen - dots.length); // 20 при maxLen=23
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

  // исходные элементы (один набор)
  const originals = Array.from(track.children);
  if (originals.length === 0) return;

  // ширина одного набора (учитывая gap)
  const cs = getComputedStyle(track);
  const gap = parseFloat(cs.gap || cs.columnGap || "0") || 0;
  let cycleWidth = originals.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0) + gap * (originals.length - 1);

  // продублируем набор ещё 2 раза (в сумме 3 набора)
  for (let i=0;i<2;i++) originals.forEach(n=>track.appendChild(n.cloneNode(true)));

  // скорость из CSS-переменной панели (px/сек)
  const cssSpeed = parseFloat(getComputedStyle(panel).getPropertyValue("--scroll-speed")) || 120;
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

/* ---------- Init ---------- */
bindStubs();
window.addEventListener("DOMContentLoaded", ()=>{
  applyTitleLimit(23);
  initInfiniteCarousel();
});
