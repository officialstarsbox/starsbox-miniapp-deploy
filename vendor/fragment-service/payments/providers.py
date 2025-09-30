# payments/providers.py — stars-only clean version

from __future__ import annotations

import os
import json
import base64
import hashlib
import hmac
from typing import Optional, Tuple

import httpx

# === Общие настройки ===
PAYMENTS_SIMULATE = os.getenv("PAYMENTS_SIMULATE", "0").strip() in ("1", "true", "yes", "on")

# === WATA ===
# Документация (кратко):
#  - POST {aud}/links  (Bearer <token>)
#  - Публичный ключ для вебхука: GET https://api.wata.pro/api/h2h/public-key
WATA_ACCESS_TOKEN = os.getenv("WATA_ACCESS_TOKEN", "").strip()
WATA_BASE = "https://api.wata.pro"

_WATA_PUBKEY_CACHE: Optional[str] = None


class WataClient:
    """
    Клиент Wata для создания инвойсов и проверки вебхука.
    """

    def __init__(self, access_token: str = WATA_ACCESS_TOKEN):
        self.access_token = access_token or ""
        if not PAYMENTS_SIMULATE and not self.access_token:
            raise RuntimeError("Wata: missing access token")

    # Вытаскиваем базовый URL из JWT 'aud'
    def _aud_base(self) -> str:
        if not self.access_token:
            return "https://api.wata.pro/api/h2h"
        try:
            head, payload, sig = self.access_token.split(".")
            # b64url decode payload
            pad = "=" * ((4 - len(payload) % 4) % 4)
            pl = json.loads(base64.urlsafe_b64decode((payload + pad).encode()))
            aud = str(pl.get("aud", "")).rstrip("/")
            if aud.startswith("http"):
                return aud
        except Exception:
            pass
        return "https://api.wata.pro/api/h2h"

    def create_invoice(
        self,
        order_id: str,
        amount: str,              # "100.00"
        currency: str,
        description: str = "",
        success_url: str = "",
        fail_url: str = "",
        url_callback: str = "",
    ) -> Tuple[str, str]:
        """
        Создаёт инвойс в Wata. Возвращает (payment_url, id).
        """
        if PAYMENTS_SIMULATE:
            return (f"https://example.local/wata/pay/{order_id}", f"sim-{order_id}")

        # amount должен быть числом — приведём аккуратно
        try:
            amount_num = float(str(amount).replace(",", "."))
        except Exception:
            raise RuntimeError(f"Wata: bad amount format: {amount!r}")

        payload = {
            "amount": amount_num,
            "currency": currency,
            "orderId": order_id,
        }
        if description:
            payload["description"] = description
        if success_url:
            payload["successRedirectUrl"] = success_url
        if fail_url:
            payload["failRedirectUrl"] = fail_url
        if url_callback:
            payload["callbackUrl"] = url_callback

        url = f"{self._aud_base()}/links"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

        r = httpx.post(url, headers=headers, json=payload, timeout=30.0)
        if r.status_code >= 400:
            req_id = r.headers.get("request-id") or r.headers.get("Request-Id") or ""
            try:
                body = r.json()
            except Exception:
                body = r.text
            raise RuntimeError(f"Wata API {r.status_code}: {body} (request-id: {req_id})")

        data = r.json() if r.content else {}
        pay_url = data.get("url")
        link_id = data.get("id")
        if not pay_url or not link_id:
            raise RuntimeError(f"Wata: invalid response: {data}")
        return str(pay_url), str(link_id)

    @staticmethod
    def _get_public_key() -> str:
        r = httpx.get(f"{WATA_BASE}/api/h2h/public-key", timeout=15.0)
        r.raise_for_status()
        data = r.json()
        pem = data.get("value") or ""
        if not pem.startswith("-----BEGIN PUBLIC KEY-----"):
            raise RuntimeError("Wata: bad public key")
        return pem

    def verify_webhook(self, headers: dict, body_bytes: bytes) -> Tuple[bool, Optional[str], Optional[str], str]:
        """
        Проверяем вебхук Wata.
        Возвращает: (ok, order_id, normalized_status, why)
        normalized_status ∈ {'paid','fail','pending'}.
        """
        if PAYMENTS_SIMULATE:
            try:
                j = json.loads(body_bytes.decode("utf-8", "ignore"))
            except Exception:
                return False, None, None, "json parse error"
            st = str(j.get("transactionStatus") or j.get("status") or "").lower()
            norm = "paid" if st == "paid" else ("fail" if st == "declined" else "pending")
            return True, str(j.get("orderId") or j.get("order_id") or ""), norm, "simulated"

        sig = (
            headers.get("x-signature")
            or headers.get("X-Signature")
            or headers.get("x-wata-signature")
            or headers.get("X-Wata-Signature")
        )
        if not sig:
            return False, None, None, "missing signature"

        pub_pem = os.getenv("WATA_PUBLIC_KEY", "").strip()
        global _WATA_PUBKEY_CACHE
        if not pub_pem:
            if _WATA_PUBKEY_CACHE:
                pub_pem = _WATA_PUBKEY_CACHE
            else:
                try:
                    pub_pem = self._get_public_key()
                    _WATA_PUBKEY_CACHE = pub_pem
                except Exception as e:
                    return False, None, None, f"get_public_key failed: {e}"

        # RSA(SHA512) проверка
        try:
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import padding
            from cryptography.exceptions import InvalidSignature

            signature = base64.b64decode(sig)
            public_key = serialization.load_pem_public_key(pub_pem.encode("utf-8"))
            public_key.verify(signature, body_bytes, padding.PKCS1v15(), hashes.SHA512())
        except InvalidSignature:
            return False, None, None, "signature mismatch"
        except Exception as e:
            return False, None, None, f"verify error: {e}"

        try:
            data = json.loads(body_bytes.decode("utf-8"))
        except Exception as e:
            return False, None, None, f"json parse error: {e}"

        order_id = data.get("orderId") or data.get("order_id")
        tx_status = (data.get("transactionStatus") or data.get("status") or "").strip().lower()
        if not order_id:
            return False, None, None, "no orderId"
        if not tx_status:
            return False, None, None, "no status"

        if tx_status == "paid":
            normalized = "paid"
        elif tx_status == "declined":
            normalized = "fail"
        else:
            normalized = "pending"
        return True, str(order_id), normalized, "ok"


# === HELEKET ===
# Документация (кратко):
#  - POST https://api.heleket.com/v1/payment  (headers: merchant, sign)
#  - sign = md5(base64(json_body) + API_KEY)
#  - Вебхук: в body поле sign, статус: paid / paid_over / ...
HELEKET_MERCHANT_ID = os.getenv("HELEKET_MERCHANT_ID", "").strip()
HELEKET_API_KEY = os.getenv("HELEKET_API_KEY", "").strip()
HELEKET_BASE = "https://api.heleket.com"


def _heleket_sign(data_obj: dict, api_key: str) -> str:
    raw = json.dumps(data_obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.md5(base64.b64encode(raw) + api_key.encode("utf-8")).hexdigest()


class HeleketClient:
    """
    Клиент Heleket для создания инвойсов и проверки вебхука.
    """

    def __init__(self, merchant_id: str = HELEKET_MERCHANT_ID, api_key: str = HELEKET_API_KEY):
        self.merchant_id = (merchant_id or "").strip()
        self.api_key = (api_key or "").strip()

    def create_invoice(
        self,
        order_id: str,
        amount_str: str,
        currency: str,
        url_success: str = "",
        url_return: str = "",
        url_callback: str = "",
        additional_data: Optional[str] = None,
    ) -> Tuple[str, str]:
        """
        Создаёт инвойс в Heleket. Возвращает (payment_url, uuid).
        amount_str — строка: "15" или "10.28".
        """
        if PAYMENTS_SIMULATE:
            return (f"https://example.local/heleket/pay/{order_id}", f"sim-{order_id}")

        if not self.merchant_id or not self.api_key:
            raise RuntimeError("Heleket: missing merchant or api key")

        payload = {
            "amount": amount_str,
            "currency": currency,
            "order_id": order_id,
        }
        if url_return:
            payload["url_return"] = url_return
        if url_success:
            payload["url_success"] = url_success
        if url_callback:
            payload["url_callback"] = url_callback
        if additional_data is not None:
            payload["additional_data"] = additional_data

        headers = {
            "merchant": self.merchant_id,
            "sign": _heleket_sign(payload, self.api_key),
            "Content-Type": "application/json",
        }

        r = httpx.post(f"{HELEKET_BASE}/v1/payment", headers=headers, json=payload, timeout=30.0)
        if r.status_code >= 400:
            try:
                body = r.json()
            except Exception:
                body = r.text
            raise RuntimeError(f"Heleket API {r.status_code}: {body}")

        data = r.json() if r.content else {}
        obj = data.get("result") or data
        payment_url = obj.get("url") or obj.get("payment_url")
        uuid = obj.get("uuid") or obj.get("id")
        if not payment_url or not uuid:
            raise RuntimeError(f"Heleket: invalid response: {data}")
        return str(payment_url), str(uuid)

    def verify_webhook(self, headers: dict, body_bytes: bytes) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Проверяем подпись в body.sign: md5(base64(json_without_sign) + API_KEY).
        Возвращает (ok, order_id, normalized_status).
        """
        if PAYMENTS_SIMULATE:
            try:
                j = json.loads(body_bytes.decode("utf-8", "ignore"))
            except Exception:
                return False, None, None
            st = str(j.get("status") or "").lower()
            norm = "paid" if st in ("paid", "paid_over") else ("failed" if st in ("fail", "cancel", "system_fail", "refund_fail", "wrong_amount") else "pending")
            return True, str(j.get("order_id") or ""), norm

        try:
            data = json.loads(body_bytes.decode("utf-8", "ignore"))
        except Exception:
            return False, None, None

        recv_sign = str(data.get("sign") or "")
        if not recv_sign:
            return False, None, None

        body_wo_sign = {k: v for k, v in data.items() if k != "sign"}
        calc = _heleket_sign(body_wo_sign, self.api_key)
        if not hmac.compare_digest(calc, recv_sign):
            return False, None, None

        order_id = str(data.get("order_id") or "")
        st = str(data.get("status") or "").lower()
        if st in ("paid", "paid_over"):
            status = "paid"
        elif st in ("fail", "cancel", "system_fail", "refund_fail", "wrong_amount"):
            status = "failed"
        else:
            status = "pending"
        return True, order_id, status
