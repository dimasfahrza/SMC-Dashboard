"""Pydantic schemas untuk API response"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


# ── Ticker ──
class TickerData(BaseModel):
    symbol: str
    price: float
    change_pct: float
    change_abs: Optional[float] = 0
    high_24h: Optional[float] = 0
    low_24h: Optional[float] = 0
    volume: Optional[float] = 0


class TickersResponse(BaseModel):
    tickers: List[TickerData]
    timestamp: datetime


# ── OHLCV ──
class Candle(BaseModel):
    time: int           # Unix timestamp (seconds)
    open: float
    high: float
    low: float
    close: float
    volume: float


class OHLCVResponse(BaseModel):
    symbol: str
    timeframe: str
    candles: List[Candle]


# ── Order Block ──
class OrderBlockData(BaseModel):
    type: str
    high: float
    low: float
    timestamp: str
    is_fresh: bool
    touch_count: int
    is_mitigated: bool


class FVGData(BaseModel):
    type: str
    top: float
    bottom: float
    timestamp: str
    filled_pct: float


# ── Structure ──
class StructureResponse(BaseModel):
    symbol: str
    price: float
    bias_1d: str
    bias_4h: str
    bias_1h: str
    order_blocks: List[OrderBlockData]
    fvgs: List[FVGData]
    snr: Dict[str, Any]


# ── Signal ──
class SignalData(BaseModel):
    symbol: str
    direction: str
    score: int
    entry: float
    stop_loss: float
    tp1: float
    tp2: float
    tp3: float
    rr2: float
    bias_1d: str
    bias_4h: str
    bias_1h: str
    explanation: str
    score_breakdown: Dict[str, int] = {}
    ob: Optional[OrderBlockData] = None
    fvg: Optional[FVGData] = None
    needs_confirmation: bool = False


# ── Sentiment ──
class SentimentResponse(BaseModel):
    symbol: str
    bull_pct: int
    bear_pct: int
    neut_pct: int
    label: str
    factors: Dict[str, Any]


# ── Context ──
class MarketContextResponse(BaseModel):
    symbol: str
    session: str
    price: float
    trend: str
    ema9_15m: float
    ema21_15m: float
    ema9_1h: float
    ema21_1h: float
    atr_pct: float
    momentum: str
    m1_trend: str
    m1_momentum: str


# ── Economic Event ──
class EconomicEventData(BaseModel):
    id: int
    event_time: datetime
    title: str
    currency: Optional[str] = None
    impact: str
    affects: Optional[List[str]] = []
    notes: Optional[str] = None


# ── Position ──
class PositionData(BaseModel):
    id: int
    symbol: str
    side: str
    status: str
    open_time: datetime
    close_time: Optional[datetime] = None
    entry_price: float
    exit_price: Optional[float] = None
    stop_loss: Optional[float] = None
    tp1: Optional[float] = None
    tp2: Optional[float] = None
    tp3: Optional[float] = None
    size: Optional[float] = None
    leverage: Optional[int] = None
    pnl_usdt: Optional[float] = None
    pnl_r: Optional[float] = None
    result: Optional[str] = None

    class Config:
        from_attributes = True


# ── Risk Settings ──
class RiskSettings(BaseModel):
    risk_per_trade_pct: float = 1.0
    max_daily_loss_pct: float = 5.0
    max_open_positions: int = 3
    current_open: int = 0
    daily_pnl_usdt: float = 0
    daily_pnl_pct: float = 0
    loss_streak: int = 0
    risk_multiplier: float = 1.0
    paused: bool = False


# ── Backtest ──
class BacktestTradeData(BaseModel):
    timestamp: str
    direction: str
    entry: float
    exit: float
    result: str
    pnl_r: float
    ob_low: float
    ob_high: float
    ob_timestamp: str


class BacktestResponse(BaseModel):
    symbol: str
    timeframe: str
    total_trades: int
    wins: int
    losses: int
    win_rate: float
    total_r: float
    profit_factor: float
    max_drawdown: float
    trades: List[BacktestTradeData]
