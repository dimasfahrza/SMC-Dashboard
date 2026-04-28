"""
AI Sentiment Engine
Menggabungkan beberapa faktor SMC menjadi sentiment BULLISH/BEARISH/NEUTRAL
dengan persentase confidence.

Faktor:
  - TF alignment (1D/4H/1H bias)
  - BoS confirmation
  - OB proximity dan status
  - Momentum (RSI/ADX approximation)
  - Price position relative to EMA21
"""
import pandas as pd
import numpy as np
from typing import Dict, Optional
from app.services.smc_engine import (
    analyze_market_structure, detect_order_blocks, calc_atr
)


def _bias_score(bias: str) -> int:
    return {"BULLISH": 1, "BEARISH": -1, "NEUTRAL": 0}.get(bias, 0)


def _ema(series: pd.Series, period: int = 21) -> float:
    if len(series) < period:
        return float(series.iloc[-1]) if len(series) else 0
    return float(series.ewm(span=period, adjust=False).mean().iloc[-1])


def _adx_approx(df: pd.DataFrame, period: int = 14) -> float:
    """ADX approximation untuk momentum strength"""
    if len(df) < period * 2:
        return 0.0
    high, low, close = df["high"], df["low"], df["close"]
    plus_dm = (high - high.shift(1)).clip(lower=0)
    minus_dm = (low.shift(1) - low).clip(lower=0)
    tr = pd.concat([high - low,
                    (high - close.shift(1)).abs(),
                    (low - close.shift(1)).abs()], axis=1).max(axis=1)
    atr = tr.rolling(period).mean()
    plus_di = 100 * (plus_dm.rolling(period).mean() / atr.replace(0, np.nan))
    minus_di = 100 * (minus_dm.rolling(period).mean() / atr.replace(0, np.nan))
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    adx = dx.rolling(period).mean().iloc[-1]
    return float(adx) if not pd.isna(adx) else 0.0


def compute_sentiment(df_1d: pd.DataFrame, df_4h: pd.DataFrame, df_1h: pd.DataFrame,
                       df_15m: Optional[pd.DataFrame] = None) -> Dict:
    """
    Return:
      {
        bull_pct, bear_pct, neut_pct,
        label: "BULLISH" | "BEARISH" | "NEUTRAL",
        factors: { ... }
      }
    """
    if len(df_4h) == 0 or len(df_1h) == 0:
        return {"bull_pct": 33, "bear_pct": 33, "neut_pct": 34,
                "label": "NEUTRAL", "factors": {}}

    ms_1d = analyze_market_structure(df_1d, lookback=7, recent_candles=90)
    ms_4h = analyze_market_structure(df_4h, lookback=5)
    ms_1h = analyze_market_structure(df_1h, lookback=5)

    # Faktor 1: TF bias alignment (bobot 40%)
    bias_sum = _bias_score(ms_1d.bias) * 1.2 + _bias_score(ms_4h.bias) * 1.5 + _bias_score(ms_1h.bias) * 1.0
    bias_norm = bias_sum / 3.7    # range -1..+1

    # Faktor 2: Price vs EMA21 4H (bobot 20%)
    ema21_4h = _ema(df_4h["close"], 21)
    cp = float(df_1h["close"].iloc[-1])
    ema_diff = (cp - ema21_4h) / ema21_4h if ema21_4h > 0 else 0
    ema_norm = max(-1, min(1, ema_diff * 20))  # scale ke -1..+1

    # Faktor 3: Momentum ADX (bobot 15%)
    adx_4h = _adx_approx(df_4h)
    # ADX tidak punya direction, amplify sign dari bias
    momentum_norm = min(1.0, adx_4h / 50) * (1 if bias_norm >= 0 else -1)

    # Faktor 4: OB proximity (bobot 25%)
    obs = detect_order_blocks(df_4h, lookback=60)
    has_bear = any(o.type == "BEARISH" and not o.is_mitigated and o.touch_count <= 3
                   and o.low >= cp * 0.97 for o in obs)
    has_bull = any(o.type == "BULLISH" and not o.is_mitigated and o.touch_count <= 3
                   and o.high <= cp * 1.03 for o in obs)
    ob_norm = 0
    if has_bear and not has_bull:
        ob_norm = -0.6
    elif has_bull and not has_bear:
        ob_norm = 0.6
    # Kalau keduanya ada, tidak menggeser sentiment

    # Weighted sum
    total = (bias_norm * 0.40 + ema_norm * 0.20 +
             momentum_norm * 0.15 + ob_norm * 0.25)
    total = max(-1, min(1, total))

    # Convert ke persentase
    # total > 0 → bull dominan; total < 0 → bear dominan
    if total >= 0:
        bull_pct = 50 + int(total * 35)   # 50..85
        bear_pct = max(5, int((1 - total) * 20))
        neut_pct = 100 - bull_pct - bear_pct
        label = "BULLISH" if bull_pct >= 55 else "NEUTRAL"
    else:
        bear_pct = 50 + int(abs(total) * 35)
        bull_pct = max(5, int((1 - abs(total)) * 20))
        neut_pct = 100 - bull_pct - bear_pct
        label = "BEARISH" if bear_pct >= 55 else "NEUTRAL"

    # Clamp biar total 100
    total_sum = bull_pct + bear_pct + neut_pct
    if total_sum != 100:
        diff = 100 - total_sum
        neut_pct += diff

    return {
        "bull_pct": bull_pct,
        "bear_pct": bear_pct,
        "neut_pct": neut_pct,
        "label": label,
        "factors": {
            "bias_1d": ms_1d.bias,
            "bias_4h": ms_4h.bias,
            "bias_1h": ms_1h.bias,
            "ema21_4h": round(ema21_4h, 4),
            "price": round(cp, 4),
            "adx_4h": round(adx_4h, 2),
            "has_bear_ob_near": has_bear,
            "has_bull_ob_near": has_bull,
            "bias_norm": round(bias_norm, 3),
            "ema_norm": round(ema_norm, 3),
            "momentum_norm": round(momentum_norm, 3),
            "ob_norm": round(ob_norm, 3),
            "total_score": round(total, 3),
        }
    }
