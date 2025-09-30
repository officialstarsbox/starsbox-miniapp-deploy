# Starsbox Fragment Service

FastAPI-сервис с интеграциями платежей (Wata, Heleket) и автопокупкой Stars на Fragment.

## Запуск локально
1) Python 3.10+
2) `python -m venv .venv && source .venv/bin/activate`
3) `pip install -r requirements.txt`
4) Настроить переменные окружения (см. `.env.example`)
5) `uvicorn app:app --reload --host 127.0.0.1 --port 10000`
