"""
Market Context
- Session aktif (London/NY/Asia)
- Trend direction
- EMA9, EMA21
- ATR %
- Momentum strength
"""
import pandas as pd
from datetime import datetime, timezone
from typing import Dict


def _ema(series: pd.Series, period: int) -> float:
    if len(series) < period:
        return float(series.iloc[-1]) if len(series) else 0
    return float(series.ewm(span=period, adjust=False).mean().iloc[-1])


def current_session() -> str:
    """
    Trading sessions (UTC):
      - Asia:    00:00 - 08:00 UTC
      - London:  08:00 - 16:00 UTC
      - NY:      13:00 - 22:00 UTC  (overlap with London 13:00-16:00)

    Return session utama.
    """
    now = datetime.now(timezone.utc)
    hour = now.hour
    if 8 <= hour < 13:
        return "LONDON"
    elif 13 <= hour < 22:
        return "NY"
    else:
        return "ASIA"


def compute_market_context(df_15m: pd.DataFrame, df_1h: pd.DataFrame,
                            df_4h: pd.DataFrame) -> Dict:
    """
    Return market context multi-TF:
      {
        session, price,
        trend: UP/DOWN/FLAT,
        ema9_15m, ema21_15m, ema9_1h, ema21_1h,
        atr_pct, momentum,
        m1_trend, m1_momentum  (aproximasi dari df_15m)
      }
    """
    if len(df_15m) == 0 or len(df_1h) == 0:
        return {}

    cp = float(df_1h["close"].iloc[-1])

    ema9_15m  = _ema(df_15m["close"], 9)
    ema21_15m = _ema(df_15m["close"], 21)
    ema9_1h   = _ema(df_1h["close"], 9)
    ema21_1h  = _ema(df_1h["close"], 21)

    # Trend dari posisi harga vs EMA21 1H dan slope
    slope_1h = _ema(df_1h["close"], 21) - _ema(df_1h["close"].shift(5), 21) if len(df_1h) > 30 else 0
    if cp > ema21_1h * 1.001 and slope_1h > 0:
        trend = "UP"
    elif cp < ema21_1h * 0.999 and slope_1h < 0:
        trend = "DOWN"
    else:
        trend = "FLAT"

    # ATR % (volatilitas)
    if len(df_15m) >= 15:
        high = df_15m["high"]
        low  = df_15m["low"]
        close_prev = df_15m["close"].shift(1)
        tr = pd.concat([high - low,
                        (high - close_prev).abs(),
                        (low - close_prev).abs()], axis=1).max(axis=1)
        atr_15m = float(tr.tail(14).mean())
        atr_pct = (atr_15m / cp * 100) if cp > 0 else 0
    else:
        atr_pct = 0

    # Momentum: perbedaan EMA9 vs EMA21
    gap_1h = ((ema9_1h - ema21_1h) / ema21_1h * 100) if ema21_1h > 0 else 0
    if abs(gap_1h) > 0.5:
        momentum = "STRONG"
    elif abs(gap_1h) > 0.15:
        momentum = "NORMAL"
    else:
        momentum = "FLAT"

    # M1 (15m) trend micro
    m1_cp = float(df_15m["close"].iloc[-1])
    if m1_cp > ema21_15m * 1.0005:
        m1_trend = "UP"
    elif m1_cp < ema21_15m * 0.9995:
        m1_trend = "DOWN"
    else:
        m1_trend = "FLAT"

    gap_15m = ((ema9_15m - ema21_15m) / ema21_15m * 100) if ema21_15m > 0 else 0
    if abs(gap_15m) > 0.2:
        m1_momentum = "STRONG"
    elif abs(gap_15m) > 0.05:
        m1_momentum = "NORMAL"
    else:
        m1_momentum = "FLAT"

    return {
        "session":     current_session(),
        "price":       round(cp, 4),
        "trend":       trend,
        "ema9_15m":    round(ema9_15m, 4),
        "ema21_15m":   round(ema21_15m, 4),
        "ema9_1h":     round(ema9_1h, 4),
        "ema21_1h":    round(ema21_1h, 4),
        "atr_pct":     round(atr_pct, 3),
        "momentum":    momentum,
        "m1_trend":    m1_trend,
        "m1_momentum": m1_momentum,
    }
