// server/api.js — БРАУЗЕРНЫЙ клиент к https://api.starsbox.org
// Никаких импортов/бандлеров не нужно. Экспортируем в window.starsboxApi.

(function () {
  const BASE = (window.STARSBOX_API_BASE || "https://api.starsbox.org").replace(/\/+$/, "");

  async function _json(url, opts = {}) {
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "omit",
      mode: "cors",
    });
    let data;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      const msg = (data && (data.detail || data.error || data.message)) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  // Создать платёж/заказ
  async function initiatePayment({ provider, product, username, qty, amount_minor, currency, gift_id, message }) {
    const payload = { provider, product, username, qty, amount_minor, currency };
    if (gift_id != null) payload.gift_id = gift_id;
    if (message != null) payload.message = message;
    return _json(`${BASE}/pay/initiate`, { method: "POST", body: payload });
  }

  // Получить заказ
  async function getOrder(orderId) {
    return _json(`${BASE}/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
  }

  // Пинг
  async function ping() {
    return _json(`${BASE}/healthz`, { method: "GET" });
  }

  // Экспорт в window
  window.starsboxApi = { BASE, initiatePayment, getOrder, ping };
  console.log("[starsboxApi] ready:", BASE);
})();
