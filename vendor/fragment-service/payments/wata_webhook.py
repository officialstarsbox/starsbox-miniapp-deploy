# payments/wata_webhook.py — stars-only clean version

from __future__ import annotations

import os
import json
import base64
from typing import Tuple, Optional

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.exceptions import InvalidSignature

PAYMENTS_SIMULATE = os.getenv("PAYMENTS_SIMULATE", "0").strip().lower() in ("1", "true", "yes", "on")
WATA_BASE = "https://api.wata.pro"


def _get_wata_public_key() -> str:
    """
    Возвращает PEM публичного ключа для проверки X-Signature.
    1) WATA_PUBLIC_KEY из окружения (если задан);
    2) иначе GET https://api.wata.pro/api/h2h/public-key .
    """
    pem = os.getenv("WATA_PUBLIC_KEY", "").strip()
    if pem:
        return pem

    r = httpx.get(f"{WATA_BASE}/api/h2h/public-key", timeout=15.0)
    r.raise_for_status()
    data = r.json()
    pem = data.get("value") or ""
    if not pem.startswith("-----BEGIN PUBLIC KEY-----"):
        raise RuntimeError("Wata: bad public key response")
    return pem


def _extract_signature(headers: dict) -> Optional[str]:
    """
    Достаём подпись из возможных заголовков.
    """
    for k in ("x-signature", "X-Signature", "x-wata-signature", "X-Wata-Signature"):
        if k in headers:
            val = headers[k]
            if isinstance(val, (list, tuple)):
                val = val[0]
            return str(val).strip()
    return None


def verify_wata_webhook(headers: dict, body: bytes) -> Tuple[bool, Optional[str], Optional[str], str]:
    """
    Проверка вебхука Wata по RSA(SHA512) подписи из заголовка X-Signature.

    Возвращает кортеж:
      (ok, order_id, normalized_status, reason)

    normalized_status ∈ {'paid', 'fail', 'pending'}.
    """
    # Режим симуляции для локальных тестов
    if PAYMENTS_SIMULATE:
        try:
            data = json.loads(body.decode("utf-8", "ignore"))
        except Exception:
            return False, None, None, "json parse error (sim)"
        tx = str(data.get("transactionStatus") or data.get("status") or "").lower()
        norm = "paid" if tx == "paid" else ("fail" if tx == "declined" else "pending")
        return True, str(data.get("orderId") or data.get("order_id") or ""), norm, "simulated"

    sig_b64 = _extract_signature(headers)
    if not sig_b64:
        return False, None, None, "missing X-Signature"

    try:
        signature = base64.b64decode(sig_b64, validate=True)
    except Exception as e:
        return False, None, None, f"signature decode error: {e}"

    try:
        pub_pem = _get_wata_public_key()
        public_key = serialization.load_pem_public_key(pub_pem.encode("utf-8"))
        public_key.verify(signature, body, padding.PKCS1v15(), hashes.SHA512())
    except InvalidSignature:
        return False, None, None, "signature mismatch"
    except Exception as e:
        return False, None, None, f"verify error: {e}"

    # Подпись валидна — парсим тело и нормализуем статус
    try:
        data = json.loads(body.decode("utf-8"))
    except Exception as e:
        return False, None, None, f"json parse error: {e}"

    order_id = data.get("orderId") or data.get("order_id")
    raw_status = (data.get("transactionStatus") or data.get("status") or "").strip().lower()

    if not order_id:
        return False, None, None, "no orderId"
    if not raw_status:
        return False, None, None, "no status"

    if raw_status == "paid":
        normalized = "paid"
    elif raw_status == "declined":
        normalized = "fail"
    else:
        normalized = "pending"

    return True, str(order_id), normalized, "ok"
