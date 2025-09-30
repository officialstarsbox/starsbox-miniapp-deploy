import os, gspread

cred_path = os.environ["GOOGLE_APPLICATION_CREDENTIALS"]
sheet_id  = os.environ["GSHEET_ID"]
ws_name   = os.environ.get("GSHEET_WORKSHEET", "????1")

gc = gspread.service_account(filename=cred_path)
sh = gc.open_by_key(sheet_id)
ws = sh.worksheet(ws_name)
ws.append_row(["TEST","ping","ok"], value_input_option="USER_ENTERED")
print("Appended OK to", ws_name)
