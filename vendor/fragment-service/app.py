from fastapi import FastAPI, Query, Body, Request, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, conint

import os, json, time, secrets, subprocess, sys
from pathlib import Path
from datetime import datetime
from typing import Optional, Tuple
from decimal import Decimal, ROUND_DOWN

# внешние модули проекта
from gsheet_client import append_new_order, finalize_order
from payments.db import init_db, get_session, Order
from payments.providers import WataClient, HeleketClient

# ---------------------------------------------------------------------------
# Константы и утилиты
# ---------------------------------------------------------------------------

PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "https://starsbox.org")
TERMINAL_STATUSES = {"paid", "paid_over", "fail", "canceled"}

def is_terminal(st: str) -> bool:
    return st in TERMINAL_STATUSES

def gen_order_id(provider: str) -> str:
    ts = int(time.time())
    rnd = secrets.token_hex(3)
    safe_provider = (provider or "pay").lower()
    return f"ord_{safe_provider}_{ts}_{rnd}"

def build_success_url(order_id: str) -> str:
    return f"{PUBLIC_BASE_URL}/pay/success?orderId={order_id}"

def build_fail_url(order_id: str) -> str:
    return f"{PUBLIC_BASE_URL}/pay/fail?orderId={order_id}"

def _amount_to_str(amount_str: Optional[str] = None,
                   amount_minor: Optional[int] = None,
                   amount: Optional[int] = None) -> Optional[str]:
    """
    Нормализует сумму к строке вида 'xx.xx'
    """
    if amount_str:
        # заменим запятую на точку, округлим до 2 знаков
        try:
            val = Decimal(str(amount_str).replace(",", ".")).quantize(Decimal("0.01"), rounding=ROUND_DOWN)
            return f"{val:.2f}"
        except Exception:
            return None
    if amount_minor is not None:
        try:
            val = (Decimal(int(amount_minor)) / Decimal(100)).quantize(Decimal("0.00"), rounding=ROUND_DOWN)
            return f"{val:.2f}"
        except Exception:
            return None
    if amount is not None:
        try:
            val = Decimal(int(amount)).quantize(Decimal("0"), rounding=ROUND_DOWN)
            return f"{val:.2f}"
        except Exception:
            return None
    return None

# ---------------------------------------------------------------------------
# Инициализация приложения
# ---------------------------------------------------------------------------

app = FastAPI(title="starsbox-fragment-service")

def _ensure_env_from_files():
    """
    Подхватывает секреты из ./secrets/* если переменные окружения не заданы.
    Не роняет приложение при ошибках.
    """
    root = Path(__file__).resolve().parent
    secrets_dir = root / "secrets"

    def _b64_of(path: Path) -> str:
        if not path.exists() or path.stat().st_size == 0:
            return ""
        if path.suffix == ".b64":
            return path.read_text(encoding="utf-8").strip()
        import base64
        return base64.b64encode(path.read_bytes()).decode("utf-8")

    try:
        if not os.getenv("FR_COOKIES_JSON_B64"):
            cj = secrets_dir / "cookies.json"
            if cj.exists() and cj.stat().st_size > 0:
                os.environ["FR_COOKIES_JSON_B64"] = _b64_of(cj)

        if not os.getenv("FR_WALLETS_DATA_B64"):
            mn = secrets_dir / "mnemonics.txt"
            if mn.exists() and mn.stat().st_size > 0:
                os.environ["FR_WALLETS_DATA_B64"] = _b64_of(mn)

        if not os.getenv("TONLIB_CONFIG_B64"):
            gc = secrets_dir / "ton-global-config.json"
            if gc.exists() and gc.stat().st_size > 0:
                os.environ["TONLIB_CONFIG_B64"] = _b64_of(gc)

        if not os.getenv("FR_WALLET_ADDRESS_RAW"):
            ra = secrets_dir / "wallet_address_raw.txt"
            if ra.exists() and ra.stat().st_size > 0:
                os.environ["FR_WALLET_ADDRESS_RAW"] = ra.read_text(encoding="utf-8").strip()

        if not os.getenv("FR_WALLET_STATEINIT_B64"):
            si_boc  = secrets_dir / "wallet_stateinit.boc"
            si_b64f = secrets_dir / "wallet_stateinit.b64"
            if si_b64f.exists() and si_b64f.stat().st_size > 0:
                os.environ["FR_WALLET_STATEINIT_B64"] = si_b64f.read_text(encoding="utf-8").strip()
            elif si_boc.exists() and si_boc.stat().st_size > 0:
                os.environ["FR_WALLET_STATEINIT_B64"] = _b64_of(si_boc)
    except Exception:
        pass

@app.on_event("startup")
def on_startup():
    _ensure_env_from_files()
    init_db()

# ---------------------------------------------------------------------------
# Подпроцесс-раннер: только ЗВЁЗДЫ
# ---------------------------------------------------------------------------

def _json_from_subprocess(cmd: list[str]) -> dict:
    """
    Запуск внешнего раннера и извлечение JSON даже при «шумном» выводе.
    """
    p = subprocess.run(cmd, capture_output=True, text=True)
    out = (p.stdout or '')
    err = (p.stderr or '')
    combined = out + ('\n' + err if err else '')

    # пробуем чистый stdout
    try:
        return json.loads(out.strip())
    except Exception:
        pass

    # ищем последний валидный JSON в объединённом выводе
    s = combined
    for i in range(len(s) - 1, -1, -1):
        if s[i] == '{':
            tail = s[i:]
            closes = [j for j, ch in enumerate(tail) if ch == '}']
            for j in range(len(closes) - 1, -1, -1):
                candidate = tail[:closes[j] + 1]
                try:
                    return json.loads(candidate)
                except Exception:
                    continue

    return {'ok': False, 'error': 'runner returned non-json', 'raw': (out.strip() or err.strip()), 'returncode': p.returncode, 'cmd': cmd}

def run_runner_stars(order_id: str, username: str, qty: int) -> dict:
    """
    Раннер автопокупки ЗВЁЗД на Fragment.
    Ожидаемый ответ: dict с ok=True и ton_link.
    """
    user_norm = (username or "").lstrip("@")
    cmd = [sys.executable, "-u", "fragment_exec/runner_fragment.py",
           "--order", order_id, "--username", user_norm, "--qty", str(int(qty))]
    return _json_from_subprocess(cmd)

# ---------------------------------------------------------------------------
# Схемы запросов
# ---------------------------------------------------------------------------

class RunReq(BaseModel):
    orderId: str
    username: str
    qty: int

class InitiateReq(BaseModel):
    orderId: Optional[str] = None
    provider: str                  # 'wata' | 'heleket'
    username: str
    qty: conint(ge=1)
    currency: str = "RUB"
    # точные суммы:
    amount_str: Optional[str] = None    # '81.60'
    amount_minor: Optional[int] = None  # 8160
    # легаси:
    amount: Optional[int] = None        # 81
    # доп.:
    returnUrl: Optional[str] = None
    successUrl: Optional[str] = None
    description: Optional[str] = None

# ---------------------------------------------------------------------------
# API: сервисные и раннер
# ---------------------------------------------------------------------------

@app.get("/healthz")
def healthz():
    return {"ok": True}

@app.get("/run")
def run_get(orderId: str = Query(...), username: str = Query(...), qty: int = Query(...)):
    """Исторический эндпоинт запуска автопокупки ЗВЁЗД (GET)."""
    return run_runner_stars(orderId, username, qty)

@app.post("/run")
def run_post(body: RunReq = Body(...)):
    """Современный эндпоинт запуска автопокупки ЗВЁЗД (POST)."""
    return run_runner_stars(body.orderId, body.username, body.qty)

# ---------------------------------------------------------------------------
# API: инициация платежа
# ---------------------------------------------------------------------------

@app.post("/pay/initiate")
async def pay_initiate(payload: dict):
    """
    Создание инвойса у провайдера и регистрация заказа.
    payload:
      provider: "wata" | "heleket"
      username: str
      qty: int
      currency: "RUB"
      amount_minor: int (в копейках)
      [orderId], [successUrl], [returnUrl], [description] — опционально
    """
    # --- Валидация входа ---
    provider = str(payload.get("provider", "")).lower().strip()
    if provider not in ("wata", "heleket"):
        raise HTTPException(status_code=400, detail="provider must be 'wata' or 'heleket'")

    try:
        username = str(payload["username"])
        qty = int(payload["qty"])
    except Exception:
        raise HTTPException(status_code=400, detail="username (str) and qty (int) are required")

    currency = str(payload.get("currency", "RUB") or "RUB").upper()

    # Сумма
    amount_minor = payload.get("amount_minor")
    amount_str_in = payload.get("amount_str")
    amount_legacy = payload.get("amount")

    amount_str = _amount_to_str(amount_str=amount_str_in, amount_minor=amount_minor, amount=amount_legacy)
    if amount_str is None:
        raise HTTPException(status_code=400, detail="amount_minor (or amount_str / amount) is required/invalid")

    # --- Идентификаторы/ссылки ---
    order_id = payload.get("orderId") or gen_order_id(provider)
    success_url = payload.get("successUrl") or build_success_url(order_id)
    fail_url    = payload.get("returnUrl")  or build_fail_url(order_id)
    descr       = payload.get("description") or f"Stars x{qty} for {username}"
    additional  = f"stars:{qty}:{username}"

    # --- Работа с БД ---
    sess = get_session()
    try:
        existing = sess.get(Order, order_id)
        if existing:
            return {
                "ok": True,
                "orderId": order_id,
                "payment_url": getattr(existing, "payment_url", None),
                "status": existing.status,
            }

        # amount для хранения в БД как целые RUB
        amount_rub_int = int(Decimal(amount_str).quantize(Decimal("0"), rounding=ROUND_DOWN))
        order = Order(
            order_id=order_id,
            provider=provider,
            username=username,
            qty=qty,
            amount=amount_rub_int,
            currency=currency,
            status="created",
            product="stars",
        )
        sess.add(order)
        sess.commit()

        # --- Создание инвойса у провайдера ---
        if provider == "wata":
            client = WataClient()
            url_callback = f"{PUBLIC_BASE_URL}/webhook/wata"
            # Сигнатура: (order_id, amount:str, currency:str, description:str='', success_url:str='', fail_url:str='', url_callback:str='')
            pay_url, ext_id = client.create_invoice(
                order_id=order_id,
                amount=str(amount_str),     # Wata ждёт строку "100.00"
                currency=currency,
                description=descr,
                success_url=success_url,
                fail_url=fail_url,
                url_callback=url_callback,
            )
        else:
            client = HeleketClient()
            url_callback = f"{PUBLIC_BASE_URL}/webhook/heleket"
            # Сигнатура: (order_id, amount_str:str, currency:str, url_success:str='', url_return:str='', url_callback:str='', additional_data:Optional[str]=None)
            pay_url, ext_id = client.create_invoice(
                order_id=order_id,
                amount_str=str(amount_str),
                currency=currency,
                url_success=success_url,
                url_return=fail_url,
                url_callback=url_callback,
                additional_data=additional,
            )

        # Сохраняем ссылку/внешний ИД и переводим в pending
        order.payment_url = pay_url
        order.external_id = ext_id
        order.status = "pending"
        sess.add(order)
        sess.commit()

        # --- Лог в Google Sheets (не валим запрос при ошибке) ---
        try:
            append_new_order(
                order_id=order_id,
                provider=provider,
                amount=f"{amount_str} {currency}",
                product="stars",
                qty=qty,
                username=username,
                payment_url=pay_url,
            )
        except Exception as ge:
            print(f"[GSHEET] append_new_order error: {type(ge).__name__}: {ge}")

        return {"ok": True, "orderId": order_id, "payment_url": pay_url, "status": "pending"}

    except HTTPException:
        raise
    except Exception as e:
        sess.rollback()
        return {
            "ok": False,
            "orderId": order_id,
            "status": "created",
            "error": f"{provider.capitalize()} initiate error: {type(e).__name__}: {e}",
        }
    finally:
        sess.close()

# ---------------------------------------------------------------------------
# API: заказ (чтение)
# ---------------------------------------------------------------------------

@app.get("/orders/{order_id}")
def get_order(order_id: str):
    sess = get_session()
    try:
        order = sess.get(Order, order_id)
        if not order:
            raise HTTPException(404, "order not found")
        return {
            "ok": True,
            "orderId": order.order_id,
            "status": order.status,
            "provider": order.provider,
            "username": order.username,
            "qty": order.qty,
            "payment_url": order.payment_url,
            "external_id": order.external_id,
        }
    finally:
        sess.close()

# ---------------------------------------------------------------------------
# Внутренняя функция: обновление статуса + автопокупка ЗВЁЗД
# ---------------------------------------------------------------------------

def _mark_and_maybe_run(order: Order, new_status: str) -> bool:
    """
    Меняем статус и при 'paid' — ОДИН РАЗ запускаем автопокупку ЗВЁЗД.
    Если раннер/отправка TON не удалась — переводим заказ в 'processing' и возвращаем False.
    """
    if order.status == "paid":
        return False

    order.status = new_status
    order.updated_at = datetime.utcnow()

    if new_status != "paid":
        return True

    try:
        print(f"AUTOPURCHASE stars: id={order.order_id} user={order.username} qty={order.qty}")
        resp = run_runner_stars(order.order_id, order.username, order.qty)
        print(f"AUTOPURCHASE stars result: id={order.order_id} resp={str(resp)[:800]}")

        if not isinstance(resp, dict) or not resp.get("ok"):
            order.status = "processing"
            return False

        ton_link = resp.get("ton_link")
        if not ton_link:
            order.status = "processing"
            return False

        from fragment_exec.ton_link_sender import send_ton_by_link
        try:
            tx_result = send_ton_by_link(ton_link)
            print(f"AUTOPURCHASE stars tx ok: id={order.order_id} via={tx_result.get('via')}")
            resp["tx_result"] = tx_result
        except Exception as e:
            print(f"AUTOPURCHASE stars tx error: id={order.order_id} err={e}")
            order.status = "processing"
            return False

    except Exception as e:
        print(f"AUTOPURCHASE ERROR for {order.order_id}: {type(e).__name__}: {e}")

    return True

# ---------------------------------------------------------------------------
# Вебхуки провайдеров: Wata и Heleket
# ---------------------------------------------------------------------------

@app.post("/webhook/wata")
async def webhook_wata(request: Request):
    """
    Вебхук от Wata (HMAC SHA256 в заголовке X-Wata-Signature).
    Идемпотентный апдейт статуса заказа + ОДНОКРАТНЫЙ запуск автопокупки ЗВЁЗД при успехе.
    """
    body    = await request.body()
    headers = dict(request.headers)

    client = WataClient()
    ok, order_id, provider_status, why = client.verify_webhook(headers, body)
    if not ok or not order_id:
        raise HTTPException(status_code=400, detail=f"signature invalid or order_id missing ({why})")

    sess  = get_session()
    try:
        order = sess.get(Order, order_id)
        if not order or order.provider != "wata":
            raise HTTPException(status_code=404, detail=f"order not found")

        p = (provider_status or "").lower().strip()
        if p == "paid_over":
            new_status = "paid_over"
        elif p == "paid":
            new_status = "paid"
        elif p in ("fail", "failed", "cancelled", "canceled"):
            new_status = "fail"
        elif p in ("pending", "processing", "created"):
            new_status = "pending"
        else:
            new_status = "pending"

        if order.status in TERMINAL_STATUSES:
            return {"ok": True, "orderId": order.order_id, "status": order.status, "changed": False, "reason": "already terminal"}

        if order.status == new_status:
            return {"ok": True, "orderId": order.order_id, "status": order.status, "changed": False, "reason": "same status"}

        allowed = {
            "created": {"pending", "paid", "paid_over", "fail"},
            "pending": {"pending", "paid", "paid_over", "fail"},
        }

        if order.status in allowed and new_status in allowed[order.status]:
            changed = _mark_and_maybe_run(order, new_status)
            sess.add(order)
            sess.commit()

            # лог в Google Sheets (только при реальном изменении на терминальный)
            try:
                if changed and order.status in TERMINAL_STATUSES:
                    finalize_order(
                        order_id=order.order_id,
                        status=order.status,
                        ton_spent=(str(order.ton_spent) if getattr(order, "ton_spent", None) else None),
                    )
            except Exception as e:
                print(f"[GSHEET] finalize_order (wata) error: {e}")

            return {"ok": True, "orderId": order.order_id, "status": order.status, "changed": changed}

        return {"ok": True, "orderId": order.order_id, "status": order.status, "changed": False, "reason": f"transition {order.status}->{new_status} not allowed"}
    finally:
        sess.close()

@app.post("/webhook/heleket")
async def webhook_heleket(request: Request):
    """
    Вебхук от Heleket (подпись проверяется в HeleketClient.verify_webhook).
    Идемпотентный апдейт статуса заказа + ОДНОКРАТНЫЙ запуск автопокупки ЗВЁЗД при успехе.
    """
    headers = dict(request.headers)
    body    = await request.body()

    client = HeleketClient()
    try:
        ok, order_id, provider_status = client.verify_webhook(headers, body)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"verify error: {e}")

    if not ok or not order_id:
        raise HTTPException(status_code=400, detail="signature invalid or order_id missing")

    sess = get_session()
    try:
        order = sess.get(Order, order_id)
        if not order or order.provider != "heleket":
            raise HTTPException(status_code=404, detail="order not found")

        p = (provider_status or "").lower().strip()
        if p == "paid_over":
            new_status = "paid_over"
        elif p == "paid":
            new_status = "paid"
        elif p in ("fail", "failed", "cancelled", "canceled"):
            new_status = "fail"
        elif p in ("pending", "processing", "created"):
            new_status = "pending"
        else:
            new_status = "pending"

        if order.status in TERMINAL_STATUSES:
            return {"ok": True, "orderId": order.order_id, "status": order.status, "changed": False, "reason": "already terminal"}

        if order.status == new_status:
            return {"ok": True, "orderId": order.order_id, "status": order.status, "changed": False, "reason": "same status"}

        allowed = {
            "created": {"pending", "paid", "paid_over", "fail"},
            "pending": {"pending", "paid", "paid_over", "fail"},
        }

        if order.status in allowed and new_status in allowed[order.status]:
            changed = _mark_and_maybe_run(order, new_status)
            sess.add(order)
            sess.commit()
            try:
                if changed and order.status in TERMINAL_STATUSES:
                    finalize_order(
                        order_id=order.order_id,
                        status=order.status,
                        ton_spent=(str(order.ton_spent) if getattr(order, "ton_spent", None) else None),
                    )
            except Exception as e:
                print(f"[GSHEET] finalize_order (heleket) error: {e}")

            return {"ok": True, "orderId": order.order_id, "status": order.status, "changed": changed}

        return {"ok": True, "orderId": order.order_id, "status": order.status, "changed": False, "reason": f"transition {order.status}->{new_status} not allowed"}
    finally:
        sess.close()
