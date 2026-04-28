# 🚀 Quick Start Guide

## Prerequisites

- **Docker** + Docker Compose (untuk Postgres + backend)
- **Node.js** 18+ (untuk frontend)
- **Python** 3.11+ (kalau mau jalan backend tanpa Docker)

---

## Cara Menjalankan (Recommended — pakai Docker)

### 1. Clone / extract

```bash
cd smc_dashboard
```

### 2. Jalankan PostgreSQL + Backend via Docker

```bash
docker-compose up -d

# Cek status
docker-compose ps

# Lihat log backend
docker-compose logs -f backend
```

Backend akan jalan di `http://localhost:8000`
- API docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/health`

### 3. Jalankan Frontend

Buka terminal baru:

```bash
cd frontend
npm install
npm run dev
```

Buka browser ke `http://localhost:5173`

---

## Cara Menjalankan (Tanpa Docker — Backend manual)

### 1. Jalankan PostgreSQL

Install PostgreSQL lokal, lalu:

```bash
createdb smc_dashboard
psql smc_dashboard < database/schema.sql
```

Atau pakai Docker hanya untuk Postgres:
```bash
docker run -d \
  --name smc_postgres \
  -e POSTGRES_USER=smc_user \
  -e POSTGRES_PASSWORD=smc_password \
  -e POSTGRES_DB=smc_dashboard \
  -p 5432:5432 \
  -v $(pwd)/database/schema.sql:/docker-entrypoint-initdb.d/01_schema.sql \
  postgres:15-alpine
```

### 2. Jalankan Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Copy dan edit .env
cp .env.example .env

# Run
python run.py
```

### 3. Jalankan Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Troubleshooting

### Backend tidak bisa connect ke Postgres
- Cek `DATABASE_URL` di `.env`
- Pastikan Postgres sudah jalan: `docker-compose ps` atau `pg_isready`

### Frontend error "Failed to fetch"
- Pastikan backend jalan di port 8000
- Cek `vite.config.js` — proxy `/api` dan `/ws` harus menuju ke backend

### WebSocket terus reconnect
- Cek backend log: `docker-compose logs -f backend`
- Cek browser console: tab Network > WS

### Tidak ada data sinyal
- Tunggu 1-2 menit — background scanner butuh waktu untuk analisis pertama
- Trigger manual: `GET http://localhost:8000/api/signal/BTC%2FUSDT`

---

## Folder Structure

```
smc_dashboard/
├── README.md
├── QUICKSTART.md          ← file ini
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── .env.example
│   ├── run.py
│   └── app/
│       ├── main.py
│       ├── core/          (config, logging)
│       ├── db/            (SQLAlchemy session)
│       ├── models/        (DB models)
│       ├── schemas/       (Pydantic)
│       ├── services/      (SMC engine, scanner, sentiment, Binance)
│       ├── api/           (REST endpoints)
│       └── websocket/     (WS routes & manager)
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── index.html
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       ├── components/    (15 komponen UI)
│       ├── hooks/         (useWebSocket)
│       ├── services/      (API client, WS client)
│       ├── contexts/      (AppContext)
│       ├── utils/         (formatters)
│       └── styles/        (global.css)
└── database/
    └── schema.sql
```

---

## Konfigurasi Watchlist

Edit `.env` (atau env di docker-compose):

```
WATCHLIST=BTC/USDT,ETH/USDT,SOL/USDT,BNB/USDT,XRP/USDT,DOGE/USDT
SCAN_INTERVAL_SECONDS=60
MIN_SCORE_TO_EMIT=40
```

Restart backend setelah edit.

---

## TradingView Charting Library (Optional)

Dashboard saat ini pakai **lightweight-charts** (gratis, sudah ter-include).

Kalau mau upgrade ke **Charting Library** (fitur lebih lengkap — drawing tools, indicators, studies):

1. Apply approval di https://www.tradingview.com/charting-library/
2. Download library, extract ke `frontend/public/charting_library/`
3. Update `frontend/src/components/Chart.jsx` untuk pakai `new TradingView.widget(...)` instead of `createChart(...)`

---

## Stop Services

```bash
docker-compose down           # Stop + remove containers
docker-compose down -v        # + hapus volume database
```
