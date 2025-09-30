from __future__ import annotations

import urllib.parse
from typing import Optional, Tuple

from tonsdk.boc import Cell
from fragment_exec.ton_sender_adapter import send_ton_with_payload  # отправка через тон-адаптер


def _boc_comment_from_text(text: str) -> str:
    """
    Собираем стандартный TON-комментарий (opcode 0 + UTF-8 текст) и возвращаем BOC в base64.
    """
    c = Cell()
    c.bits.write_uint(0, 32)               # opcode 0: text comment
    c.bits.write_bytes(text.encode("utf-8"))
    # False -> без индексов; адаптеру это не требуется
    return c.to_boc(False).to_base64()     # у tonsdk Cell.to_boc(...).to_base64()


def parse_ton_link(ton_link: str) -> Tuple[str, Optional[int], Optional[str]]:
    """
    Stars-only разбор ton://transfer ссылки.
    Поддерживаем только:
      - amount=<nanotons>
      - text=<comment> (по нему строим BOC комментарий)
    Возвращаем кортеж: (address, amount_int|None, boc_payload|None)
    """
    u = urllib.parse.urlparse(ton_link)
    if u.scheme != "ton" or u.netloc != "transfer":
        raise ValueError("unsupported TON link (expected ton://transfer/...)")

    address = u.path.lstrip("/")
    qs = urllib.parse.parse_qs(u.query)

    amount: Optional[int] = None
    if "amount" in qs and qs["amount"]:
        try:
            amount = int(qs["amount"][0])
        except Exception:
            amount = None

    payload_boc: Optional[str] = None
    # для звёзд ожидаем текстовый комментарий; если он есть — соберём BOC
    text = (qs.get("text") or qs.get("message") or [""])[0]
    if text:
        # query уже url-encoded; unquote_plus вернёт исходный текст
        text = urllib.parse.unquote_plus(text)
        payload_boc = _boc_comment_from_text(text)

    return address, amount, payload_boc


def send_ton_by_link(ton_link: str) -> dict:
    """
    Отправляем TON по ton://transfer ссылке для покупки звёзд.
    - amount обязателен
    - payload формируем из текстового комментария, если он есть
    """
    address, amount, payload_boc = parse_ton_link(ton_link)
    if amount is None:
        raise ValueError("TON link has no amount")

    # Для звёзд payload не обязателен, но если есть text — мы его превращаем в BOC.
    # Адаптер принимает payload=None корректно.
    return send_ton_with_payload(address, amount, payload_boc)
