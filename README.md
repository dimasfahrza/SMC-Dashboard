# SMC Trading Dashboard + Bot Telegram

Dashboard trading berbasis **Smart Money Concepts (SMC)** yang terintegrasi dengan bot Telegram untuk auto-trading di Binance Futures (Demo/Testnet).

---

## Fitur Utama

### Dashboard
- **Live Chart** — Candlestick chart dengan OB zones (kotak transparan), EMA, Bollinger Bands
- **Drawing Tools** — Trend line, horizontal line, rectangle, Fibonacci retracement (drag & drop)
- **Order Book Live** — Bid/ask depth real-time langsung dari Binance WebSocket
- **Live Positions** — Posisi terbuka dari Binance Demo dengan unrealized PnL real-time
- **Wallet Equity** — Total equity, available margin, margin usage bar
- **Chart Overlay** — Garis entry/SL/TP1/TP2 di chart sesuai posisi aktif (toggle on/off)
- **SMC Signal** — Sinyal otomatis dari engine SMC (trend, OB, BOS, FVG)
- **Economic Calendar** — Event high-impact dari Investing.com (live scrape)
- **Journal & Analytics** — Rekap semua trade dari bot
- **Timezone Picker** — Auto-detect browser timezone + 7 preset

### Bot Telegram
- **Auto Analisis SMC** — Scan 5 simbol setiap jam, kirim sinyal ke Telegram
- **Auto Trading** — Buka/tutup posisi di Binance Demo otomatis
- **Risk Management** — Dynamic leverage, loss streak protection, breakeven otomatis
- **Backtest** — Command `/backtest <symbol>` untuk backtest 500 candle
- **Database Sync** — Semua trade, sinyal, dan backtest tersimpan ke PostgreSQL dashboard

---

## Arsitektur

```
Bot Telegram (Python)          Dashboard (React + FastAPI)
─────────────────────          ───────────────────────────
btc_signal_bot.py              frontend/  (React + Vite)
testnet_trader.py      ──────► backend/   (FastAPI + SQLAlchemy)
smc_method.py          db_log  database/  (PostgreSQL via Docker)
db_logger.py ──────────────────────────────────────────────────►
                               WebSocket broadcast setiap 3 detik
```

---

## Tech Stack

| Komponen | Teknologi |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, lightweight-charts |
| Backend | FastAPI, SQLAlchemy async, asyncpg |
| Database | PostgreSQL 15 via Docker |
| Bot | Python 3.10+, python-telegram-bot 20.7, ccxt |
| Chart Data | Binance Public API |
| Live Positions | Binance Demo Futures API |
| Order Book | Binance WebSocket public |
| Calendar | Investing.com scraper |

---

## SMC Strategy

| Parameter | Nilai |
|---|---|
| Trend | 4H timeframe — HH/HL uptrend, LL/LH downtrend |
| OB syarat | Caused BOS |
| BOS konfirmasi | 1H timeframe |
| Entry | Midpoint OB 50% |
| Stop Loss | Batas OB + 0.3x ATR |
| TP1 / TP2 / TP3 | 1.5R / 2.5R / 3.5R |
| Partial Close | 50% di TP1, SL ke breakeven |
| Min Score | 40/100 |

---

## Quick Start

### Prerequisites
- Docker Desktop
- Node.js LTS
- Python 3.10+

### 1. Clone

```bash
git clone https://github.com/USERNAME/smc-dashboard.git
cd smc-dashboard
```

### 2. Konfigurasi .env

```bash
cp backend/.env.example backend/.env
```

Isi di `docker-compose.yml` bagian environment backend:
```yaml
BINANCE_DEMO_API_KEY: isi_disini
BINANCE_DEMO_API_SECRET: isi_disini
```

### 3. Jalankan

```bash
# Backend + Database
docker-compose up -d

# Frontend
cd frontend
npm install
npm run dev
```

Buka: **http://localhost:5173**

---

## Struktur Folder

```
smc-dashboard/
├── backend/
│   ├── app/
│   │   ├── api/           # REST endpoints
│   │   ├── services/      # SMC engine, Binance, scanner
│   │   ├── models/        # Database models
│   │   └── websocket/     # WebSocket manager
│   └── .env.example
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── chart/     # Chart + drawing tools
│       │   ├── orderbook/ # Live order book
│       │   ├── positions/ # Live positions + wallet
│       │   └── layout/    # Panel kiri/kanan/nav
│       ├── utils/         # Indicators, drawing, timezone
│       └── services/      # API client, WebSocket
├── docker-compose.yml
└── README.md
```

---

## Perintah Bot Telegram

| Command | Fungsi |
|---|---|
| `/scan` | Scan semua simbol sekarang |
| `/debug <symbol>` | Detail analisis satu simbol |
| `/backtest <symbol>` | Backtest 500 candle |
| `/positions` | Posisi aktif |
| `/score <n>` | Ubah minimum score |
| `/toggle` | Toggle auto-trade |

---

## Catatan Keamanan

- Jangan commit `.env` — sudah ada di `.gitignore`
- Bot menggunakan **Binance Demo** — bukan uang nyata
- API key disimpan di environment variable, bukan di kode

---

## License

MIT License
