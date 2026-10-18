# Connectly — Python FastAPI Backend

This directory contains the Python FastAPI backend implementation for **Connectly — Real-Time Messaging & Permission-Controlled Chat Platform**.

## Architecture & Stack
- **Framework:** FastAPI with async WebSocket support
- **ORM:** SQLAlchemy 2.0 with PostgreSQL / SQLite
- **Password Security:** Argon2id (`argon2-cffi`)
- **Authentication:** JWT Access & Refresh Tokens (`python-jose`)
- **Validation:** Pydantic v2
- **Testing:** Pytest with HTTPX & pytest-asyncio

## Setup & Running with PostgreSQL

### 1. Prerequisites
- Python 3.10+
- PostgreSQL 14+

### 2. Environment Variables
Create a `.env` file in this directory:
```bash
DATABASE_URL=postgresql://connectly_user:connectly_pass@localhost:5432/connectly_db
SECRET_KEY=your_super_secret_jwt_key_at_least_32_characters_long
ACCESS_TOKEN_EXPIRE_MINUTES=120
REFRESH_TOKEN_EXPIRE_DAYS=7
```

### 3. Installation
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 4. Database Migrations (Alembic)
```bash
alembic init alembic
alembic revision --autogenerate -m "Initial schema"
alembic upgrade head
```

### 5. Start the Server
```bash
uvicorn backend_python.main:app --host 0.0.0.0 --port 8000 --reload
```
API Documentation will be live at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### 6. Run Automated Tests
```bash
pytest backend_python/tests/ -v
```
