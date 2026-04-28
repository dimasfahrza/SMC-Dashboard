"""SQLAlchemy models — mirror dari schema.sql"""
from sqlalchemy import (
    Column, BigInteger, Integer, String, Numeric, Boolean, Text, DateTime, ARRAY, ForeignKey
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.db.session import Base


class Signal(Base):
    __tablename__ = "signals"

    id          = Column(BigInteger, primary_key=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    symbol      = Column(String(20), nullable=False, index=True)
    timeframe   = Column(String(10), nullable=False)
    direction   = Column(String(10), nullable=False)
    entry       = Column(Numeric(20, 8))
    stop_loss   = Column(Numeric(20, 8))
    tp1         = Column(Numeric(20, 8))
    tp2         = Column(Numeric(20, 8))
    tp3         = Column(Numeric(20, 8))
    score       = Column(Integer, nullable=False)
    bias_1d     = Column(String(10))
    bias_4h     = Column(String(10))
    bias_1h     = Column(String(10))
    ob_high     = Column(Numeric(20, 8))
    ob_low      = Column(Numeric(20, 8))
    ob_type     = Column(String(10))
    ob_touches  = Column(Integer, default=0)
    has_fvg     = Column(Boolean, default=False)
    explanation = Column(Text)
    meta        = Column(JSONB)


class Position(Base):
    __tablename__ = "positions"

    id          = Column(BigInteger, primary_key=True)
    signal_id   = Column(BigInteger, ForeignKey("signals.id", ondelete="SET NULL"))
    symbol      = Column(String(20), nullable=False, index=True)
    side        = Column(String(10), nullable=False)
    status      = Column(String(20), nullable=False, index=True)
    open_time   = Column(DateTime(timezone=True), server_default=func.now())
    close_time  = Column(DateTime(timezone=True))
    entry_price = Column(Numeric(20, 8), nullable=False)
    exit_price  = Column(Numeric(20, 8))
    stop_loss   = Column(Numeric(20, 8))
    tp1         = Column(Numeric(20, 8))
    tp2         = Column(Numeric(20, 8))
    tp3         = Column(Numeric(20, 8))
    size        = Column(Numeric(20, 8))
    leverage    = Column(Integer)
    margin_used = Column(Numeric(20, 8))
    risk_usdt   = Column(Numeric(20, 8))
    result      = Column(String(20))
    pnl_usdt    = Column(Numeric(20, 8))
    pnl_r       = Column(Numeric(10, 4))
    fee_usdt    = Column(Numeric(20, 8))
    notes       = Column(Text)
    meta        = Column(JSONB)


class BacktestResult(Base):
    __tablename__ = "backtest_results"

    id            = Column(BigInteger, primary_key=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())
    symbol        = Column(String(20), nullable=False, index=True)
    timeframe     = Column(String(10), nullable=False)
    candles_used  = Column(Integer)
    total_trades  = Column(Integer)
    wins          = Column(Integer)
    losses        = Column(Integer)
    win_rate      = Column(Numeric(5, 2))
    total_r       = Column(Numeric(10, 2))
    profit_factor = Column(Numeric(10, 2))
    max_drawdown  = Column(Numeric(10, 2))
    trades_json   = Column(JSONB)


class EconomicEvent(Base):
    __tablename__ = "economic_events"

    id         = Column(BigInteger, primary_key=True)
    event_time = Column(DateTime(timezone=True), nullable=False)
    title      = Column(String(255), nullable=False)
    currency   = Column(String(10))
    impact     = Column(String(10), nullable=False)
    affects    = Column(ARRAY(String))
    notes      = Column(Text)


class UserSetting(Base):
    __tablename__ = "user_settings"

    id         = Column(BigInteger, primary_key=True)
    key        = Column(String(100), unique=True, nullable=False)
    value      = Column(JSONB)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
