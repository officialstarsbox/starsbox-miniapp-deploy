(function () {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  try { tg?.ready?.(); tg?.expand?.(); } catch {}

  // ==== НАСТРОЙКА API ====
  const API_BASE = 'https://api.starsbox.org'; // при необходимости поменяй

  // ===== состояние страницы (как у тебя было) =====
  let balance = 0;
  const tx = [];

  const $ = (s) => document.querySelector(s);
  function fmtAmount(v){ const n=Number(v||0); const sign=n>=0?"+":"–"; const cls=n>=0?"tx-amt--pos":"tx-amt--neg"; return {text:`${sign} ${Math.abs(n)} COIN`, cls}; }
  function renderBalance(){ const el = $("#scBalanceValue"); if (el) el.textContent = `${balance} COIN`; }
  function renderTx(){
    const list = $("#txList"), empty = $("#txEmpty");
    list.innerHTML = "";
    if (!tx.length){ empty.hidden=false; list.hidden=true; return; }
    empty.hidden=true; list.hidden=false;
    for (const it of tx){
      const li=document.createElement("li"); li.className="tx-item";
      const ico=document.createElement("div"); ico.className="tx-ico"; ico.textContent= it.type==="exchange"?"⇄":"★";
      const main=document.createElement("div"); main.className="tx-main";
      const t=document.createElement("p"); t.className="tx-title"; t.textContent= it.title || (it.type==="exchange"?"Обмен звёзд → StarsCoin":"Покупка за StarsCoin");
      const s=document.createElement("p"); s.className="tx-sub"; s.textContent = new Date(it.dt||Date.now()).toLocaleString("ru-RU");
      main.appendChild(t); main.appendChild(s);
      const amt=document.createElement("div"); const fa=fmtAmount(it.amount); amt.className=`tx-amt ${fa.cls}`; amt.textContent=fa.text;
      li.append(ico, main, amt); list.appendChild(li);
    }
  }

  // ====== Модалка обмена ======
  const modal   = $("#exModal");
  const exOpen  = $("#depositBtn");
  const exClose = $("#exClose");
  const exSubmit= $("#exSubmit");
  const starsIn = $("#starsIn");
  const coinsOut= $("#coinsOut");
  const rateVal = $("#rateVal");

  let EXCHANGE_RATE = 1.00;
  window.setStarsToCoinRate = function (r){
    const n = Number(r);
    if (isFinite(n) && n>0){
      EXCHANGE_RATE = n;
      rateVal.textContent = n.toFixed(2);
      recalc();
    }
  };

  function openModal(){ modal.classList.add("is-open"); modal.setAttribute("aria-hidden","false"); starsIn.value=""; coinsOut.value="0"; updateSubmit(0); starsIn.focus(); }
  function closeModal(){ modal.classList.remove("is-open"); modal.setAttribute("aria-hidden","true"); }

  function onlyDigits(s){ return String(s||"").replace(/[^\d]/g,""); }

  function recalc(){
    const stars = parseInt(onlyDigits(starsIn.value)||"0", 10);
    const coins = Math.floor(stars * EXCHANGE_RATE);
    coinsOut.value = String(coins);
    updateSubmit(stars);
  }

  function updateSubmit(stars){
    const n = Number(stars||0);
    exSubmit.textContent = `Обменять ${n} stars`;
    exSubmit.disabled = !(n>0);
  }

  // === NEW: запрос инвойса на N звёзд у бэка ===
  async function requestStarsInvoice(stars){
    const body = { stars: Number(stars), payload: "exchange:starscoin" };
    const r = await fetch(`${API_BASE}/starscoin/invoice`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(body),
    }).catch(()=>null);
    if (!r || !r.ok) throw new Error('invoice_request_failed');
    const data = await r.json().catch(()=>null);
    if (!data || data.ok !== true) throw new Error('bad_invoice_response');
    // поддержим обе формы ответа
    return data.invoice_link || data.slug;
  }

  // === NEW: открыть платёжное окно Telegram Stars ===
  function openStarsInvoice(linkOrSlug){
    return new Promise((resolve, reject) => {
      if (!tg?.openInvoice){ reject(new Error('webapp_no_openinvoice')); return; }

      // подстрахуемся слушателем результата
      const onClosed = (e) => {
        // e: { status: 'paid' | 'cancelled' | 'failed' }
        try { tg.offEvent('invoiceClosed', onClosed); } catch {}
        resolve(e);
      };
      try { tg.onEvent('invoiceClosed', onClosed); } catch {}

      // сам запуск
      tg.openInvoice(linkOrSlug, (res) => {
        // callback может вернуть строку ошибки сразу (например, неверный slug)
        if (typeof res === 'string' && res !== 'ok'){
          try { tg.offEvent('invoiceClosed', onClosed); } catch {}
          reject(new Error(res));
        }
      });
    });
  }

  // === при успехе — локально обновим баланс/историю
  function applySuccessfulExchange(stars){
    const coins = Math.floor(Number(stars) * EXCHANGE_RATE);
    balance += coins;
    tx.unshift({
      type: 'exchange',
      title: `Обмен ${stars}★ → ${coins} coin`,
      amount: +coins,
      dt: Date.now(),
    });
    renderBalance();
    renderTx();
  }

  // события
  document.addEventListener("DOMContentLoaded", () => {
    renderBalance(); renderTx();

    exOpen?.addEventListener("click", openModal);
    exClose?.addEventListener("click", closeModal);
    modal?.addEventListener("click", (e)=>{ if (e.target===modal) closeModal(); });
    document.addEventListener("keydown", (e)=>{ if (e.key==="Escape" && modal.classList.contains("is-open")) closeModal(); });

    starsIn?.addEventListener("input", () => {
      const raw = starsIn.value;
      const clean = onlyDigits(raw);
      if (raw !== clean) starsIn.value = clean;
      recalc();
    });

    // === КЛИК ПО «Обменять N stars» — ТЕПЕРЬ ОФИЦИАЛЬНЫЙ FLOW ===
    exSubmit?.addEventListener("click", async () => {
      const stars = parseInt(onlyDigits(starsIn.value)||"0",10);
      if (!stars) return;
      if (!tg?.openInvoice){
        alert('Покупка звёздами доступна только внутри Telegram.');
        return;
      }

      exSubmit.disabled = true;

      try{
        const linkOrSlug = await requestStarsInvoice(stars);
        const res = await openStarsInvoice(linkOrSlug);
        // res.status: 'paid' | 'cancelled' | 'failed'
        if (res && res.status === 'paid'){
          applySuccessfulExchange(stars);
          tg?.showToast?.('Оплата звёздами прошла успешно ✨');
          closeModal();
        } else if (res && res.status === 'failed'){
          tg?.showAlert?.('Оплата не прошла. Попробуйте ещё раз.');
        } // cancelled — просто молчим
      }catch(err){
        console.warn('openInvoice error:', err);
        tg?.showAlert?.('Не удалось открыть окно оплаты. Проверьте соединение и повторите.');
      }finally{
        exSubmit.disabled = false;
      }
    });

    rateVal.textContent = EXCHANGE_RATE.toFixed(2);
  });
})();

