-- SMC Dashboard Database Schema
-- PostgreSQL 15+

CREATE TABLE IF NOT EXISTS signals (
    id          BIGSERIAL PRIMARY KEY,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    symbol      VARCHAR(20) NOT NULL,
    timeframe   VARCHAR(10) NOT NULL,
    direction   VARCHAR(10) NOT NULL,       -- LONG / SHORT / WAIT
    entry       NUMERIC(20, 8),
    stop_loss   NUMERIC(20, 8),
    tp1         NUMERIC(20, 8),
    tp2         NUMERIC(20, 8),
    tp3         NUMERIC(20, 8),
    score       INTEGER NOT NULL,
    bias_1d     VARCHAR(10),
    bias_4h     VARCHAR(10),
    bias_1h     VARCHAR(10),
    ob_high     NUMERIC(20, 8),
    ob_low      NUMERIC(20, 8),
    ob_type     VARCHAR(10),
    ob_touches  INTEGER DEFAULT 0,
    has_fvg     BOOLEAN DEFAULT FALSE,
    explanation TEXT,
    meta        JSONB
);
CREATE INDEX IF NOT EXISTS idx_signals_symbol     ON signals(symbol);
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals(created_at DESC);

CREATE TABLE IF NOT EXISTS positions (
    id            BIGSERIAL PRIMARY KEY,
    signal_id     BIGINT REFERENCES signals(id) ON DELETE SET NULL,
    symbol        VARCHAR(20) NOT NULL,
    side          VARCHAR(10) NOT NULL,     -- LONG / SHORT
    status        VARCHAR(20) NOT NULL,     -- OPEN / CLOSED / CANCELED
    open_time     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    close_time    TIMESTAMPTZ,
    entry_price   NUMERIC(20, 8) NOT NULL,
    exit_price    NUMERIC(20, 8),
    stop_loss     NUMERIC(20, 8),
    tp1           NUMERIC(20, 8),
    tp2           NUMERIC(20, 8),
    tp3           NUMERIC(20, 8),
    size          NUMERIC(20, 8),
    leverage      INTEGER,
    margin_used   NUMERIC(20, 8),
    risk_usdt     NUMERIC(20, 8),
    result        VARCHAR(20),              -- WIN_TP1/TP2/TP3 / LOSS / BREAKEVEN
    pnl_usdt      NUMERIC(20, 8),
    pnl_r         NUMERIC(10, 4),
    fee_usdt      NUMERIC(20, 8),
    notes         TEXT,
    meta          JSONB
);
CREATE INDEX IF NOT EXISTS idx_positions_symbol    ON positions(symbol);
CREATE INDEX IF NOT EXISTS idx_positions_status    ON positions(status);
CREATE INDEX IF NOT EXISTS idx_positions_open_time ON positions(open_time DESC);

CREATE TABLE IF NOT EXISTS backtest_results (
    id            BIGSERIAL PRIMARY KEY,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    symbol        VARCHAR(20) NOT NULL,
    timeframe     VARCHAR(10) NOT NULL,
    candles_used  INTEGER,
    total_trades  INTEGER,
    wins          INTEGER,
    losses        INTEGER,
    win_rate      NUMERIC(5, 2),
    total_r       NUMERIC(10, 2),
    profit_factor NUMERIC(10, 2),
    max_drawdown  NUMERIC(10, 2),
    trades_json   JSONB
);
CREATE INDEX IF NOT EXISTS idx_bt_symbol ON backtest_results(symbol);

CREATE TABLE IF NOT EXISTS economic_events (
    id          BIGSERIAL PRIMARY KEY,
    event_time  TIMESTAMPTZ NOT NULL,
    title       VARCHAR(255) NOT NULL,
    currency    VARCHAR(10),
    impact      VARCHAR(10) NOT NULL,       -- LOW / MEDIUM / HIGH
    affects     TEXT[],                     -- array of symbols affected
    notes       TEXT
);
CREATE INDEX IF NOT EXISTS idx_econ_time   ON economic_events(event_time);
CREATE INDEX IF NOT EXISTS idx_econ_impact ON economic_events(impact);

CREATE TABLE IF NOT EXISTS user_settings (
    id                BIGSERIAL PRIMARY KEY,
    key               VARCHAR(100) UNIQUE NOT NULL,
    value             JSONB,
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default economic events (FOMC, CPI, NFP)
INSERT INTO economic_events (event_time, title, currency, impact, affects) VALUES
  (NOW() + INTERVAL '2 hours',  'FOMC Member Speaks',       'USD', 'HIGH',   ARRAY['BTC/USDT','ETH/USDT']),
  (NOW() + INTERVAL '1 day',    'CPI m/m',                   'USD', 'HIGH',   ARRAY['BTC/USDT','ETH/USDT','SOL/USDT']),
  (NOW() + INTERVAL '3 days',   'Unemployment Claims',       'USD', 'MEDIUM', ARRAY['BTC/USDT']),
  (NOW() + INTERVAL '1 week',   'Non-Farm Payrolls',         'USD', 'HIGH',   ARRAY['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT','XRP/USDT'])
ON CONFLICT DO NOTHING;
