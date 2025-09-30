import os
import datetime as dt
from typing import Optional, Dict, Any

import gspread
from gspread.exceptions import WorksheetNotFound

_SHEET_ID = os.getenv(GSHEET_ID, ).strip()
_WS_NAME  = os.getenv(GSHEET_WORKSHEET, Orders).strip() or Orders
_CREDS    = os.getenv(GOOGLE_APPLICATION_CREDENTIALS, ).strip()

_HEADERS = [
    date_created,time_created,time_finalized,order_id,provider,
    status,amount,product,qty,username,ton_spent,payment_url
]

_client = None
_ws      = None

def _now_parts(tz: Optional[dt.tzinfo] = None):
    now = dt.datetime.now(tz or dt.timezone.utc).astimezone(dt.timezone.utc)
    return now.strftime(%Y-%m-%d), now.strftime(%H:%M:%S)

def _get_ws():
    global _client, _ws
    if not (_SHEET_ID and _CREDS):
        raise RuntimeError(GSHEET_ID or GOOGLE_APPLICATION_CREDENTIALS is not set)

    if _client is None:
        _client = gspread.service_account(filename=_CREDS)
    if _ws is None:
        sh = _client.open_by_key(_SHEET_ID)
        try:
            _ws = sh.worksheet(_WS_NAME)
        except WorksheetNotFound:
            _ws = sh.add_worksheet(title=_WS_NAME, rows=100, cols=len(_HEADERS))
        # заголовки
        first_row = _ws.row_values(1)
        if first_row != _HEADERS:
            _ws.resize(rows=max(100, _ws.row_count))
            _ws.update(A1, [_HEADERS])
    return _ws

def _find_row_by_order_id(order_id: str) -> Optional[int]:
    ws = _get_ws()
    try:
        cell = ws.find(order_id, in_column=4)  # колонка D = order_id
        return cell.row
    except Exception:
        return None

def upsert_order(row: Dict[str, Any]) -> None:
    
