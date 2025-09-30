import os
import datetime as dt
import gspread
from typing import Optional

_SHEET = None
_WS = None

def _ensure_ws():
    global _SHEET, _WS
    if _WS:
        return _WS
    cred_path = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
    sheet_id  = os.environ.get('GSHEET_ID')
    ws_name   = os.environ.get('GSHEET_WORKSHEET', 'Orders')
    if not cred_path or not sheet_id:
        raise RuntimeError('GSHEET: missing GOOGLE_APPLICATION_CREDENTIALS or GSHEET_ID')
    gc = gspread.service_account(filename=cred_path)
    _SHEET = gc.open_by_key(sheet_id)
    try:
        _WS = _SHEET.worksheet(ws_name)
    except gspread.WorksheetNotFound:
        _WS = _SHEET.add_worksheet(title=ws_name, rows=1000, cols=20)
        _WS.append_row([
            'created_date','created_time','finalized_time','order_id','provider',
            'status','amount','product','qty','username','ton_spent','payment_url'
        ], value_input_option='USER_ENTERED')
    return _WS

def _now_parts():
    now = dt.datetime.now(dt.timezone.utc)
    return now.strftime('%Y-%m-%d'), now.strftime('%H:%M:%S')

def append_new_order(*, order_id: str, provider: str, amount: Optional[str], product: str,
                     qty: int, username: str, payment_url: Optional[str]):
    """Логируем момент создания заказа."""
    ws = _ensure_ws()
    created_date, created_time = _now_parts()
    row = [
        created_date,          # A created_date
        created_time,          # B created_time
        '',                    # C finalized_time
        order_id,              # D order_id
        provider,              # E provider
        'created',             # F status
        amount or '',          # G amount (строкой/минорные как строка)
        product,               # H product
        qty,                   # I qty
        username,              # J username
        '',                    # K ton_spent
        payment_url or '',     # L payment_url
    ]
    ws.append_row(row, value_input_option='USER_ENTERED')

def finalize_order(*, order_id: str, status: str, ton_spent: Optional[str] = None):
    """
    Заполняем finalized_time, status, ton_spent для существующей строки; если нет — добавляем компактную.
    Ищем order_id в колонке D (4).
    """
    ws = _ensure_ws()
    try:
        cell = ws.find(order_id, in_column=4)  # D
    except Exception:
        cell = None

    finalized_at = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%d %H:%M:%S')

    if not cell:
        ws.append_row(['', '', finalized_at, order_id, '', status, '', '', '', '', ton_spent or '', ''],
                      value_input_option='USER_ENTERED')
        return

    row_idx = cell.row
    ws.update_cell(row_idx, 3, finalized_at)   # C finalized_time
    ws.update_cell(row_idx, 6, status)         # F status
    if ton_spent is not None:
        ws.update_cell(row_idx, 11, ton_spent) # K ton_spent
