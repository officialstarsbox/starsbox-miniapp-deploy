#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Stars-only runner.

Назначение:
  - Подхватывает cookies и мнемонику из ENV или из secrets/*
  - Получает платёжные данные у Fragment (адрес/сумма/комментарий) через PaymentGet.get_data_for_payment(recipient, qty, mnemonics)
  - Собирает ton://transfer ссылку (amount + text)
  - Пытается выполнить покупку через BuyStars/buy_stars (если поддерживается библиотекой)
  - Печатает JSON-результат в stdout

Никаких payload BOC / премиума / bin-параметров.
"""

# --- bootstrap vendor/fragment_api on sys.path (do not remove) ---
import sys, os
BASE_DIR = os.path.dirname(os.path.dirname(__file__))  # /home/.../starsbox-fragment-service
VENDOR_ROOT = os.path.join(BASE_DIR, "vendor", "fragment_api")
for _p in (
    VENDOR_ROOT,
    os.path.join(VENDOR_ROOT, "FragmentApi"),
    os.path.join(VENDOR_ROOT, "Functions"),
    os.path.join(VENDOR_ROOT, "wallet"),
):
    if _p not in sys.path:
        sys.path.append(_p)
# --- end bootstrap ---

import json
import base64
import argparse
import traceback
from pathlib import Path
from urllib.parse import urlparse, parse_qs, urlencode, quote

from FragmentApi.PaymentGet import PaymentGet
try:
    from FragmentApi.BuyStars import buy_stars
except Exception:
    buy_stars = None
try:
    from FragmentApi.BuyStars import BuyStars
except Exception:
    BuyStars = None


# ----------------- util io -----------------

def _print_json(obj: dict, *, exit_code: int | None = None):
    print(json.dumps(obj, ensure_ascii=False), flush=True)
    if exit_code is not None:
        sys.exit(exit_code)

def die(message: str, **extra):
    out = {"ok": False, "error": message}
    if extra:
        out["diag"] = extra
    _print_json(out, exit_code=1)

def ok(**data):
    _print_json({"ok": True, **data})


# ----------------- env / secrets -----------------

def _b64_of(path: Path) -> str:
    if not path.exists() or path.stat().st_size == 0:
        return ""
    # если это cookies list (chrome), не перекодируем тут — ниже будет нормализация
    return base64.b64encode(path.read_bytes()).decode("utf-8")

def ensure_env_from_files():
    """
    CLI-дружелюбность: если требуемых ENV нет — подставим их из secrets/*
    """
    root = Path(__file__).resolve().parent.parent
    secrets_dir = root / "secrets"

    os.environ.setdefault("FR_COOKIES_JSON_B64", _b64_of(secrets_dir / "cookies.json"))
    os.environ.setdefault("FR_WALLETS_DATA_B64", _b64_of(secrets_dir / "mnemonics.txt"))

    # не обязательно для звёзд, но не мешает
    if not os.getenv("TONLIB_CONFIG_B64"):
        p = secrets_dir / "ton-global-config.json"
        if p.exists() and p.stat().st_size > 0:
            os.environ["TONLIB_CONFIG_B64"] = base64.b64encode(p.read_bytes()).decode("utf-8")
    if not os.getenv("FR_WALLET_STATEINIT_B64"):
        p = secrets_dir / "wallet_stateinit.boc"
        if p.exists() and p.stat().st_size > 0:
            os.environ["FR_WALLET_STATEINIT_B64"] = base64.b64encode(p.read_bytes()).decode("utf-8")
    if not os.getenv("FR_WALLET_ADDRESS_RAW"):
        p = secrets_dir / "wallet_address_raw.txt"
        if p.exists() and p.stat().st_size > 0:
            os.environ["FR_WALLET_ADDRESS_RAW"] = p.read_text(encoding="utf-8").strip()

def check_env():
    miss = []
    c = os.getenv("FR_COOKIES_JSON_B64")
    w = os.getenv("FR_WALLETS_DATA_B64")
    if not c:
        miss.append("FR_COOKIES_JSON_B64")
    if not w:
        miss.append("FR_WALLETS_DATA_B64")
    if miss:
        die("missing env", missing=miss)

    # валидация cookies.json (list|dict → валидный JSON)
    try:
        base64.b64decode(c).decode("utf-8", "ignore")
    except Exception:
        die("cookies base64 invalid")

    # валидация мнемоники
    try:
        mn = base64.b64decode(w).decode("utf-8", "ignore").strip()
        if len(mn.split()) < 12:
            die("mnemonic looks too short (<12 words)")
    except Exception:
        die("mnemonic base64/text invalid")

def write_cookies_files(c_b64: str):
    """
    Пишем cookies.json в проект и в vendor.
    Если пришёл chrome-список cookie-объектов — конвертируем в dict {name:value}.
    """
    root = Path(__file__).resolve().parent.parent
    vendor = root / "vendor" / "fragment_api"

    raw = base64.b64decode(c_b64)
    data_bytes = raw
    try:
        obj = json.loads(raw.decode("utf-8", "ignore"))
        if isinstance(obj, list):
            conv = {}
            for it in obj:
                if isinstance(it, dict) and "name" in it and "value" in it:
                    conv[str(it["name"])] = it.get("value", "")
            if conv:
                data_bytes = json.dumps(conv, ensure_ascii=False).encode("utf-8")
    except Exception:
        pass

    for target in (root / "cookies.json", vendor / "cookies.json"):
        try:
            target.write_bytes(data_bytes)
        except Exception as e:
            die("cannot write cookies.json", path=str(target), exc=type(e).__name__, msg=str(e))

def load_mnemonic(w_b64: str) -> list[str]:
    words = base64.b64decode(w_b64).decode("utf-8", "ignore").strip().split()
    if len(words) < 12:
        die("mnemonics too short", words_count=len(words))
    return words


# ----------------- stars purchase -----------------

def build_ton_link(address: str, amount_nanotons: int | None, comment: str | None) -> str:
    """
    Stars-only deeplink: ton://transfer/<address>?amount=<nanotons>&text=<comment>
    Никаких bin/payload.
    """
    q = {}
    if amount_nanotons is not None:
        try:
            q["amount"] = str(int(amount_nanotons))
        except Exception:
            pass
    if comment:
        q["text"] = str(comment)
    qs = ("?" + urlencode(q, safe=":+/=_-")) if q else ""
    return f"ton://transfer/{quote(address, safe='')}{qs}"

def parse_ton_link(url: str):
    try:
        pr = urlparse(url)
        if pr.scheme != "ton" or not pr.path:
            return None, None, None
        addr = pr.path.lstrip("/")
        q = parse_qs(pr.query)
        amt = q.get("amount", [None])[0]
        try:
            amt = int(amt) if amt is not None else None
        except Exception:
            amt = None
        comment = q.get("text", [None])[0]
        return addr, amt, comment
    except Exception:
        return None, None, None

def get_buy_link(username: str, qty: int, words: list[str]) -> str:
    """
    Получаем адрес/сумму/комментарий через PaymentGet.get_data_for_payment(recipient, qty, mnemonics)
    и собираем ton://transfer ссылку.
    """
    pg = PaymentGet()
    recipient = str(username).lstrip("@")
    qty = int(qty)

    if not hasattr(pg, "get_data_for_payment"):
        die("PaymentGet has no get_data_for_payment")

    try:
        address, amount, comment = pg.get_data_for_payment(recipient, qty, words)
    except TypeError as e:
        die("get_data_for_payment signature mismatch", exc=type(e).__name__, msg=str(e))
    except Exception as e:
        die("get_data_for_payment failed", exc=type(e).__name__, msg=str(e))

    try:
        amount = int(amount) if amount is not None else None
    except Exception:
        amount = None

    return build_ton_link(address, amount, comment)

def do_buy(ton_link: str, username: str, qty: int, words: list[str], addr: str, amt: int | None, comment: str | None):
    """
    Пытаемся совершить покупку, если библиотека это поддерживает.
    Иначе — достаточно вернуть ton_link (бекенд сам умеет отправлять по ссылке).
    """
    # Приоритет: функция buy_stars(username, qty, words, ...)
    if buy_stars:
        # разные версии библиотеки поддерживают разные сигнатуры — перебор вариантов
        for kwargs in (
            {"username": username, "quantity": int(qty), "mnemonics": words, "send_mode": 1, "testnet": False},
            {"username": username, "qty": int(qty), "words": words, "send_mode": 1, "testnet": False},
            {"ton_url": ton_link},
            {"ton_link": ton_link},
            {"url": ton_link},
        ):
            try:
                return buy_stars(**kwargs)
            except TypeError:
                continue
            except Exception as e:
                # если сама покупка упала — вернёмся к варианту "через ton_link"
                break

    # Классическая обёртка
    if BuyStars:
        try:
            bs = BuyStars()
            # пробуем разные методы
            for meth_name in ("buy_stars", "buy"):
                if hasattr(bs, meth_name):
                    meth = getattr(bs, meth_name)
                    for kwargs in ({"ton_url": ton_link}, {"ton_link": ton_link}, {"url": ton_link}):
                        try:
                            return meth(**kwargs)
                        except TypeError:
                            continue
                        except Exception:
                            break
        except Exception:
            pass

    # Если ничего не сработало — вернём None. Бекенд продолжит по ton_link.
    return None


# ----------------- cli -----------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--order", required=True)
    ap.add_argument("--username", required=True)
    ap.add_argument("--qty", type=int, required=True)
    ap.add_argument("--dry-run", action="store_true", help="не отправлять транзакцию, только сформировать ton_link")
    args = ap.parse_args()

    # автоподхват secrets/* если ENV не заданы
    ensure_env_from_files()
    check_env()

    c_b64 = os.environ["FR_COOKIES_JSON_B64"]
    w_b64 = os.environ["FR_WALLETS_DATA_B64"]

    # синхронизируем cookies.json (и в корень проекта, и во vendor)
    write_cookies_files(c_b64)
    words = load_mnemonic(w_b64)

    try:
        ton_link = get_buy_link(args.username, args.qty, words)
        addr, amt, comment = parse_ton_link(ton_link)
        if not addr:
            die("parse_ton_link failed", link=ton_link)

        result = None
        if not args.dry_run:
            result = do_buy(ton_link, args.username, args.qty, words, addr, amt, comment)

        ok(
            stage="buy",
            orderId=args.order,
            username=args.username,
            qty=args.qty,
            ton_link=ton_link,
            result=(str(result)[:500] if result is not None else None),
            dry_run=bool(args.dry_run),
        )
    except SystemExit:
        raise
    except Exception as e:
        _print_json(
            {
                "ok": False,
                "stage": "buy",
                "orderId": args.order,
                "username": args.username,
                "qty": args.qty,
                "exc": type(e).__name__,
                "msg": str(e),
                "traceback": traceback.format_exc()[-4000:],
            },
            exit_code=2,
        )

if __name__ == "__main__":
    main()
