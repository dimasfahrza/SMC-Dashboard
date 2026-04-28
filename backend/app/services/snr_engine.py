"""
SNR Levels Engine
Auto-calculate support & resistance levels:
  - Swing Highs / Lows
  - Pivot, R1, S1
  - 24H High / Low
  - OB zones
"""
import pandas as pd
from typing import List, Dict
from app.services.smc_engine import detect_swings, classify_swings, detect_order_blocks


def _pct_from(price: float, ref: float) -> float:
    if ref <= 0:
        return 0
    return (price - ref) / ref * 100


def compute_snr_levels(df_1d: pd.DataFrame, df_4h: pd.DataFrame,
                       df_1h: pd.DataFrame) -> Dict:
    """
    Return:
      {
        price, pivot, r1, s1,
        high_24h, low_24h,
        swing_highs: [{price, pct_from_current, label}, ...],
        swing_lows:  [{price, pct_from_current, label}, ...],
        ob_zones:    [{type, low, high, pct_from_current}, ...]
      }
    """
    if len(df_1h) == 0 or len(df_1d) == 0:
        return {}

    cp = float(df_1h["close"].iloc[-1])

    # Pivot (Classical) dari daily kemarin
    if len(df_1d) >= 2:
        prev = df_1d.iloc[-2]
        pivot = (prev["high"] + prev["low"] + prev["close"]) / 3
        r1 = 2 * pivot - prev["low"]
        s1 = 2 * pivot - prev["high"]
    else:
        pivot = r1 = s1 = cp

    # 24h high/low dari df_1h (24 candle)
    recent_24h = df_1h.tail(24)
    high_24h = float(recent_24h["high"].max()) if len(recent_24h) else cp
    low_24h  = float(recent_24h["low"].min()) if len(recent_24h) else cp

    # Swing highs/lows dari 4H
    swings_4h = classify_swings(detect_swings(df_4h, lookback=5))
    swing_highs = sorted(
        [s for s in swings_4h if s.type in ("HIGH", "HH", "LH") and s.price > cp],
        key=lambda s: s.price
    )[:5]
    swing_lows = sorted(
        [s for s in swings_4h if s.type in ("LOW", "HL", "LL") and s.price < cp],
        key=lambda s: s.price, reverse=True
    )[:5]

    # OB zones terdekat
    obs = detect_order_blocks(df_4h, lookback=60)
    ob_zones = []
    for o in obs:
        if o.is_mitigated or o.touch_count > 3:
            continue
        ob_zones.append({
            "type": o.type,
            "low":  round(o.low, 6),
            "high": round(o.high, 6),
            "touches": o.touch_count,
            "is_fresh": o.is_fresh,
            "pct_from_current": round(_pct_from(o.mid, cp), 2),
            "timestamp": o.timestamp,
        })
    # Urutkan berdasarkan jarak absolut ke harga, ambil 6 terdekat
    ob_zones.sort(key=lambda x: abs(x["pct_from_current"]))
    ob_zones = ob_zones[:6]

    return {
        "price":       round(cp, 6),
        "pivot":       round(float(pivot), 6),
        "r1":          round(float(r1), 6),
        "s1":          round(float(s1), 6),
        "high_24h":    round(high_24h, 6),
        "low_24h":     round(low_24h, 6),
        "swing_highs": [
            {
                "price": round(s.price, 6),
                "label": s.type,
                "timestamp": s.timestamp,
                "pct_from_current": round(_pct_from(s.price, cp), 2),
            } for s in swing_highs
        ],
        "swing_lows": [
            {
                "price": round(s.price, 6),
                "label": s.type,
                "timestamp": s.timestamp,
                "pct_from_current": round(_pct_from(s.price, cp), 2),
            } for s in swing_lows
        ],
        "ob_zones": ob_zones,
    }
