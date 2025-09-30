#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Stars-only TON sender.

Назначение:
  - Подписать перевод из локальной сид-фразы (mnemonics) и отправить его.
  - Предпочтительно через tonlib; если tonlib недоступен — отправка через HTTP (toncenter/tonapi).
Ожидаем:
  - FR_WALLETS_DATA_B64  — base64 от мнемоники (или secrets/mnemonics.txt)
  - TONLIB_CONFIG_B64    — base64 от tonlib global-config.json (если хотим tonlib)
  - (опц) FR_WALLET_ADDRESS_RAW — если есть фиксированный исходный адрес (для логов/валидации)
  - (опц) TONCENTER_API_KEY / TONCENTER_BASE_URL — для HTTP-броадкаста
  - (опц) TONAPI_TOKEN / TONAPI_BASE_URL         — для HTTP-броадкаста (fallback)
"""

from __future__ import annotations

import os, base64, json, tempfile, time
from typing import Optional, Tuple, Any
from pathlib import Path

from tonsdk.contract.wallet import Wallets, WalletVersionEnum
from tonsdk.boc import Cell
from tonsdk.utils import Address

# tonlib — опционально
try:
    from pytonlib import TonlibClient  # type: ignore
except Exception:
    TonlibClient = None  # type: ignore


# ---------- helpers ----------

def _secrets_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "secrets"

def _read_text(path: Path) -> Optional[str]:
    try:
        if path.exists() and path.stat().st_size > 0:
            return path.read_text(encoding="utf-8").strip()
    except Exception:
        pass
    return None

def _b64_of_file(path: Path) -> Optional[str]:
    try:
        if not path.exists() or path.stat().st_size == 0:
            return None
        return base64.b64encode(path.read_bytes()).decode("utf-8")
    except Exception:
        return None

def _mnemonics_words() -> list[str]:
    b64 = os.getenv("FR_WALLETS_DATA_B64", "").strip()
    if b64:
        txt = base64.b64decode(b64).decode("utf-8", "ignore").strip()
        words = txt.split()
        if len(words) >= 12:
            return words
    # fallback: secrets/mnemonics.txt
    txt2 = _read_text(_secrets_dir() / "mnemonics.txt")
    if txt2:
        words = txt2.split()
        if len(words) >= 12:
            return words
    raise RuntimeError("mnemonics missing: set FR_WALLETS_DATA_B64 or put secrets/mnemonics.txt")

def _derive_wallet(words: list[str]) -> Tuple[Any, WalletVersionEnum, str]:
    """
    Пробуем стандартные версии кошелька; возвращаем (wallet_obj, version, raw_addr).
    """
    for ver in (WalletVersionEnum.v4r2, WalletVersionEnum.v4r1, WalletVersionEnum.v3r2, WalletVersionEnum.v3r1):
        try:
            res = Wallets.from_mnemonics(words, version=ver, workchain=0)
            w = getattr(res, "wallet", res) if hasattr(res, "wallet") else res
            raw = w.address.to_string(False)
            return w, ver, raw
        except Exception:
            continue
    raise RuntimeError("cannot derive wallet from mnemonics")

def _tonlib_available() -> bool:
    if TonlibClient is None:
        return False
    return bool(os.getenv("TONLIB_CONFIG_B64", "").strip())

def _tonlib_client() -> "TonlibClient":
    cfg_b64 = os.environ["TONLIB_CONFIG_B64"].strip()
    config = json.loads(base64.b64decode(cfg_b64).decode("utf-8", "ignore"))
    keystore = tempfile.mkdtemp(prefix="ton-keystore-")
    ls_index = int(os.getenv("TONLIB_LS_INDEX", "0"))
    # совместимость с разными сигнатурами конструктора
    try:
        c = TonlibClient(ls_index, config, keystore)  # type: ignore
    except TypeError:
        c = TonlibClient(ls_index=ls_index, config=config, keystore=keystore)  # type: ignore
    # init может быть корутиной
    import asyncio
    def _await(x):
        if asyncio.iscoroutine(x):
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop(); asyncio.set_event_loop(loop)
            return loop.run_until_complete(x)
        return x
    _await(c.init())
    return c

def _tonlib_seqno(client: "TonlibClient", addr: str) -> int:
    """
    Получаем seqno через tonlib raw_run_method.
    """
    import asyncio
    async def _run():
        try:
            res = await client.raw_run_method(addr, "seqno", [])
            stack = (res or {}).get("stack") or []
            if stack and stack[0][0] == "num":
                return int(stack[0][1], 16)
        except Exception:
            pass
        return 0
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop(); asyncio.set_event_loop(loop)
    return loop.run_until_complete(_run())

def _http_seqno(raw_addr: str) -> int:
    """
    Получаем seqno через toncenter /runGetMethod (или 0 при неудаче).
    Требует TONCENTER_API_KEY (обычно).
    """
    import requests
    base = os.getenv("TONCENTER_BASE_URL", "https://toncenter.com/api/v2").rstrip("/")
    key  = os.getenv("TONCENTER_API_KEY", "").strip()
    url  = f"{base}/runGetMethod"
    headers = {"Content-Type": "application/json"}
    if key:
        headers["X-API-Key"] = key
    payload = {"address": Address(raw_addr).to_string(True, True, True, False), "method": "seqno", "stack": []}
    try:
        r = requests.post(url, headers=headers, json=payload, timeout=25)
        data = r.json()
        st = (data.get("result") or {}).get("stack") or []
        if st and st[0][0] == "num":
            return int(st[0][1], 16)
    except Exception:
        pass
    return 0

def _http_broadcast_boc(boc_b64: str) -> dict:
    """
    Броадкаст BOC через toncenter → (опц.) tonapi.
    """
    import requests
    # 1) toncenter
    base = os.getenv("TONCENTER_BASE_URL", "https://toncenter.com/api/v2").rstrip("/")
    key  = os.getenv("TONCENTER_API_KEY", "").strip()
    url  = f"{base}/sendBoc"
    headers = {"Content-Type": "application/json"}
    if key:
        headers["X-API-Key"] = key
    try:
        r = requests.post(url, headers=headers, json={"boc": boc_b64}, timeout=30)
        if r.status_code == 200:
            j = r.json()
            if j.get("ok"):
                return {"ok": True, "via": "http/toncenter", "result": j}
            raise RuntimeError(f"toncenter sendBoc error: {j}")
    except Exception as e1:
        last = str(e1)

    # 2) tonapi (если есть токен)
    token = os.getenv("TONAPI_TOKEN", "").strip()
    if token:
        base2 = os.getenv("TONAPI_BASE_URL", "https://tonapi.io").rstrip("/")
        url2  = f"{base2}/v2/send/boc"
        headers2 = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
        try:
            r = requests.post(url2, headers=headers2, json={"boc": boc_b64}, timeout=30)
            if r.status_code in (200, 202):
                try:
                    j2 = r.json()
                except Exception:
                    j2 = {"raw": r.text}
                return {"ok": True, "via": "http/tonapi", "result": j2}
            raise RuntimeError(f"tonapi send: {r.status_code} {r.text[:400]}")
        except Exception as e2:
            last = f"{last}; {e2}"

    raise RuntimeError(f"http broadcast failed: {last}")

def _state_init_from_env_or_wallet(wallet) -> Optional[Cell]:
    """
    Если это первый выход кошелька (seqno=0) — нужен state_init.
    Пробуем взять из ENV/файлов, иначе генерим из tonsdk кошелька.
    """
    # ENV/files
    b64 = os.getenv("FR_WALLET_STATEINIT_B64", "").strip()
    if not b64:
        p = _secrets_dir() / "wallet_stateinit.boc"
        if p.exists() and p.stat().st_size > 0:
            b64 = base64.b64encode(p.read_bytes()).decode("utf-8")
    if b64:
        try:
            return Cell.one_from_boc(base64.b64decode(b64))
        except Exception:
            pass
    # из кошелька
    try:
        return wallet.create_state_init()["state_init"]
    except Exception:
        return None


# ---------- main API ----------

def send_ton_with_payload(address: str, amount: int, payload_b64: Optional[str]):
    """
    Подписывает и отправляет перевод:
      - address (friendly/raw)
      - amount (nanoton)
      - payload_b64: BOC комментарий (может быть None для звёзд)
    Возвращает dict с минимумом полезной информации.
    """
    if not address or not isinstance(amount, int):
        raise ValueError("address/amount invalid")

    words = _mnemonics_words()
    wallet, version, wallet_raw = _derive_wallet(words)
    wallet_friendly = wallet.address.to_string(True, True, True, False)

    # seqno: tonlib → http
    use_tonlib = _tonlib_available()
    seq_before = 0
    tl_err = None
    client = None

    if use_tonlib:
        try:
            client = _tonlib_client()
            seq_before = _tonlib_seqno(client, wallet_raw)
        except Exception as e:
            use_tonlib = False
            tl_err = str(e)

    if not use_tonlib:
        seq_before = _http_seqno(wallet_raw) or 0

    # первый выход → state_init
    state_init_cell = _state_init_from_env_or_wallet(wallet) if seq_before == 0 else None

    # payload
    body_cell = None
    if payload_b64:
        try:
            body_cell = Cell.one_from_boc(base64.b64decode(payload_b64))
        except Exception:
            body_cell = None

    # сборка и подпись
    msg = wallet.create_transfer_message(
        to_addr=Address(address),
        amount=amount,
        seqno=seq_before,
        payload=body_cell,
        send_mode=3,
        state_init=state_init_cell
    )
    boc_bytes = msg["message"].to_boc(False)
    boc_b64 = base64.b64encode(boc_bytes).decode("utf-8")

    # отправка
    if use_tonlib and client is not None:
        # raw_send_message / send_boc в разных билдах pytonlib
        import asyncio
        async def _send_all():
            # 1) raw_send_message
            if hasattr(client, "raw_send_message"):
                try:
                    return {"ok": True, "via": "tonlib/raw_send_message", "result": await client.raw_send_message(boc_b64)}
                except Exception:
                    pass
            # 2) send_boc
            if hasattr(client, "send_boc"):
                try:
                    return {"ok": True, "via": "tonlib/send_boc", "result": await client.send_boc(boc_b64)}
                except Exception:
                    pass
            # 3) raw_execute
            if hasattr(client, "raw_execute"):
                try:
                    return {"ok": True, "via": "tonlib/raw_execute", "result": await client.raw_execute({"@type": "raw.sendMessage", "body": boc_b64})}
                except Exception:
                    pass
            raise RuntimeError("tonlib send methods failed")

        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop(); asyncio.set_event_loop(loop)
        try:
            sent = loop.run_until_complete(_send_all())
        except Exception as e:
            # фоллбэк на HTTP
            sent = _http_broadcast_boc(boc_b64)
    else:
        sent = _http_broadcast_boc(boc_b64)

    # контрольный seqno (best-effort)
    time.sleep(1.0)
    try:
        seq_after = _tonlib_seqno(client, wallet_raw) if (use_tonlib and client is not None) else _http_seqno(wallet_raw)
    except Exception:
        seq_after = seq_before

    return {
        "from_raw": wallet_raw,
        "from": wallet_friendly,
        "to": address,
        "amount": amount,
        "wallet_version": str(version),
        "seqno_before": seq_before,
        "seqno_after": seq_after,
        "via": sent.get("via"),
        "send_result": sent.get("result"),
        "boc_base64": boc_b64[:256] + ("..." if len(boc_b64) > 256 else ""),
        "tonlib_error": tl_err,
    }
