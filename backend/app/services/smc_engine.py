"""
SMC Trading Engine v2
Strategy: Smart Money Concepts (Multi-Timeframe 4H & 1H)

Pipeline (sesuai task.txt):
  1. Trend 4H  — HH/HL = uptrend, LL/LH = downtrend
  2. OB 4H     — last opposite candle sebelum impulsive move yang menyebabkan BOS
  3. BOS 1H    — konfirmasi direction sebelum entry
  4. Entry     — midpoint OB (50%)
  5. SL        — last swing low (long) / swing high (short) di 4H
  6. TP        — TP1 = 1:1, TP2 = 2:1, TP3 = 3:1
  7. FVG       — scoring bonus jika FVG konfluent dengan OB
  8. Filter    — ATR volatility + session filter
"""
import pandas as pd
import numpy as np
from dataclasses import dataclass, field
from typing import List, Optional, Tuple, Dict
from app.core.logging import get_logger

log = get_logger(__name__)

# ═══════════════════════════════════════════════════════
# KONFIGURASI
# ═══════════════════════════════════════════════════════
SWING_LOOKBACK   = 5      # candle kiri/kanan untuk konfirmasi swing
BOS_LOOKBACK     = 50     # candle ke belakang untuk cari BOS
OB_LOOKBACK      = 80     # candle ke belakang untuk detect OB
MAX_OB_TOUCHES   = 3      # OB valid maksimal sudah 3x disentuh
FVG_MIN_ATR      = 0.3    # FVG minimal 0.3x ATR agar dianggap signifikan
OB_PROXIMITY_PCT = 0.008  # 0.8% — harga dianggap "mendekati" OB
MIN_SCORE        = 40     # score minimum untuk emit sinyal
TP_RR_1          = 1.5    # TP1 = 1.5R (lebih realistis dari 1:1)
TP_RR_2          = 2.5    # TP2 = 2.5R
TP_RR_3          = 3.5    # TP3 = 3.5R
TP1_CLOSE_PCT    = 0.5    # close 50% posisi di TP1


# ═══════════════════════════════════════════════════════
# DATA STRUCTURES
# ═══════════════════════════════════════════════════════
@dataclass
class SwingPoint:
    type:      str    # "HH" | "HL" | "LH" | "LL" | "HIGH" | "LOW"
    price:     float
    idx:       int
    timestamp: str


@dataclass
class BoS:
    type:      str    # "BULLISH" | "BEARISH"
    level:     float
    idx:       int
    timestamp: str


@dataclass
class MarketStructure:
    bias:      str             # "BULLISH" | "BEARISH" | "NEUTRAL"
    swings:    List[SwingPoint]
    last_bos:  Optional[BoS]
    desc:      str
    strength:  int             # 0-3
    last_swing_low:  float = 0.0   # untuk SL long
    last_swing_high: float = 0.0   # untuk SL short


@dataclass
class OrderBlock:
    type:         str    # "BULLISH" | "BEARISH"
    high:         float
    low:          float
    open:         float
    close:        float
    idx:          int
    timestamp:    str
    is_fresh:     bool
    touch_count:  int
    is_mitigated: bool
    caused_bos:   bool = False   # OB ini yang menyebabkan BOS
    bos_level:    float = 0.0

    @property
    def mid(self):
        return (self.high + self.low) / 2

    @property
    def size(self):
        return self.high - self.low


@dataclass
class FVG:
    type:       str
    top:        float
    bottom:     float
    timestamp:  str
    filled_pct: float


@dataclass
class SMCSetup:
    symbol:     str
    direction:  str   # "LONG" | "SHORT" | "WAIT"
    score:      int
    ob:         Optional[OrderBlock]
    fvg:        Optional[FVG]
    entry:      float
    sl:         float
    tp1:        float
    tp2:        float
    tp3:        float
    rr2:        float
    bias_4h:    str
    bias_1h:    str
    bias_1d:    str = "NEUTRAL"
    bos_1h:     Optional[BoS] = None
    needs_confirmation: bool = False
    explanation: str = ""
    score_breakdown: Dict = field(default_factory=dict)
    setup_notes: str = ""


# ═══════════════════════════════════════════════════════
# UTILITIES
# ═══════════════════════════════════════════════════════
def calc_atr(df: pd.DataFrame, period: int = 14) -> float:
    if len(df) < period + 1:
        return 0.0
    h = df["high"].values
    l = df["low"].values
    c = df["close"].values
    tr = np.maximum(h[1:] - l[1:],
         np.maximum(abs(h[1:] - c[:-1]), abs(l[1:] - c[:-1])))
    return float(np.mean(tr[-period:]))


def detect_swings(df: pd.DataFrame, lookback: int = SWING_LOOKBACK) -> List[SwingPoint]:
    swings = []
    n = len(df)
    for i in range(lookback, n - lookback):
        hi = float(df["high"].iloc[i])
        lo = float(df["low"].iloc[i])
        left_h  = df["high"].iloc[i-lookback:i]
        right_h = df["high"].iloc[i+1:i+lookback+1]
        left_l  = df["low"].iloc[i-lookback:i]
        right_l = df["low"].iloc[i+1:i+lookback+1]
        if hi >= left_h.max() and hi >= right_h.max():
            swings.append(SwingPoint("HIGH", hi, i, str(df.index[i])))
        if lo <= left_l.min() and lo <= right_l.min():
            swings.append(SwingPoint("LOW", lo, i, str(df.index[i])))
    return sorted(swings, key=lambda s: s.idx)


def classify_swings(swings: List[SwingPoint]) -> List[SwingPoint]:
    """Klasifikasi HIGH/LOW menjadi HH/HL/LH/LL"""
    classified = []
    prev_h = prev_l = None
    for s in swings:
        if s.type == "HIGH":
            if prev_h is None:
                s.type = "HH"
            elif s.price > prev_h:
                s.type = "HH"
            else:
                s.type = "LH"
            prev_h = s.price
        elif s.type == "LOW":
            if prev_l is None:
                s.type = "HL"
            elif s.price > prev_l:
                s.type = "HL"
            else:
                s.type = "LL"
            prev_l = s.price
        classified.append(s)
    return classified


def detect_bos(df: pd.DataFrame, swings: List[SwingPoint],
               lookback: int = BOS_LOOKBACK) -> Optional[BoS]:
    """Deteksi Break of Structure terbaru"""
    if not swings:
        return None
    n   = len(df)
    start = max(0, n - lookback)
    closes = df["close"].values

    highs = sorted([s for s in swings if s.type in ("HH", "LH") and s.idx >= start],
                   key=lambda s: s.idx)
    lows  = sorted([s for s in swings if s.type in ("HL", "LL") and s.idx >= start],
                   key=lambda s: s.idx)

    last_bos = None
    # Bullish BOS: close menembus previous swing HIGH
    for swing in highs:
        for i in range(swing.idx + 1, n):
            if closes[i] > swing.price:
                ts = str(df.index[i]) if i < len(df.index) else ""
                last_bos = BoS("BULLISH", swing.price, i, ts)
                break

    # Bearish BOS: close menembus previous swing LOW
    for swing in lows:
        for i in range(swing.idx + 1, n):
            if closes[i] < swing.price:
                ts = str(df.index[i]) if i < len(df.index) else ""
                if last_bos is None or i > last_bos.idx:
                    last_bos = BoS("BEARISH", swing.price, i, ts)
                break

    return last_bos


# ═══════════════════════════════════════════════════════
# MARKET STRUCTURE ANALYSIS (4H / 1H)
# ═══════════════════════════════════════════════════════
def analyze_market_structure(df: pd.DataFrame, lookback: int = SWING_LOOKBACK,
                              recent_candles: int = 0) -> MarketStructure:
    df_use = df.iloc[-recent_candles:] if recent_candles and len(df) > recent_candles else df
    if len(df_use) < lookback * 2 + 1:
        return MarketStructure("NEUTRAL", [], None, "Data tidak cukup", 0)

    raw     = detect_swings(df_use, lookback)
    swings  = classify_swings(raw)
    last_bos = detect_bos(df_use, swings)

    if not swings:
        return MarketStructure("NEUTRAL", [], last_bos, "Tidak ada swing", 0)

    # Trend dari 10 swing terakhir
    recent = swings[-10:]
    hh = sum(1 for s in recent if s.type == "HH")
    hl = sum(1 for s in recent if s.type == "HL")
    lh = sum(1 for s in recent if s.type == "LH")
    ll = sum(1 for s in recent if s.type == "LL")

    bull_score = hh + hl
    bear_score = lh + ll

    # BOS bonus
    if last_bos:
        if last_bos.type == "BULLISH": bull_score += 2
        else:                          bear_score += 2

    if bull_score > bear_score:
        bias, strength = "BULLISH", min(bull_score, 3)
        desc = f"Uptrend — HH:{hh} HL:{hl}"
    elif bear_score > bull_score:
        bias, strength = "BEARISH", min(bear_score, 3)
        desc = f"Downtrend — LH:{lh} LL:{ll}"
    else:
        bias, strength = "NEUTRAL", 0
        desc = "Sideways"

    # Last swing low/high untuk SL
    lows  = [s for s in swings if s.type in ("HL", "LL")]
    highs = [s for s in swings if s.type in ("HH", "LH")]
    last_swing_low  = float(lows[-1].price)  if lows  else 0.0
    last_swing_high = float(highs[-1].price) if highs else 0.0

    return MarketStructure(bias, swings, last_bos, desc, strength,
                            last_swing_low, last_swing_high)


# ═══════════════════════════════════════════════════════
# ORDER BLOCK DETECTION — wajib menyebabkan BOS
# ═══════════════════════════════════════════════════════
def detect_order_blocks(df: pd.DataFrame, lookback: int = OB_LOOKBACK) -> List[OrderBlock]:
    """
    OB valid = candle terakhir yang berlawanan sebelum impulsive move yang menyebabkan BOS.

    Bearish OB: candle bullish sebelum penurunan impulsif yang break swing LOW
    Bullish OB: candle bearish sebelum kenaikan impulsif yang break swing HIGH
    """
    atr = calc_atr(df)
    if atr <= 0:
        return []

    n     = len(df)
    start = max(0, n - lookback)
    obs   = []

    # Detect swings untuk cari level BOS
    raw    = detect_swings(df, SWING_LOOKBACK)
    swings = classify_swings(raw)

    # Kumpulkan swing HIGH dan LOW sebagai reference BOS
    swing_highs = [s for s in swings if s.type in ("HH", "LH") and s.idx >= start]
    swing_lows  = [s for s in swings if s.type in ("HL", "LL") and s.idx >= start]

    closes = df["close"].values
    highs  = df["high"].values
    lows   = df["low"].values
    opens  = df["open"].values

    # ── Bearish OB: candle bullish → impulsive move bawah → break swing LOW ──
    for i in range(start, n - 3):
        candle_bull = closes[i] > opens[i]
        if not candle_bull:
            continue

        # Impulsive move minimal 1x ATR dalam 3 candle ke depan
        move_down = highs[i] - min(lows[i+1:min(i+4, n)])
        if move_down < atr * 1.0:
            continue

        # Cek apakah move ini menyebabkan BOS (break previous swing LOW)
        caused_bos = False
        bos_level  = 0.0
        relevant_lows = [s for s in swing_lows if s.idx < i]
        if relevant_lows:
            prev_low = relevant_lows[-1]
            for j in range(i + 1, min(i + 10, n)):
                if closes[j] < prev_low.price:
                    caused_bos = True
                    bos_level  = prev_low.price
                    break

        if not caused_bos:
            continue

        # Mitigasi dan touch count
        future       = df.iloc[i+1:]
        is_mitigated = bool((future["close"] > highs[i]).any()) if len(future) else False
        touch_count  = int(
            ((future["low"] <= highs[i]) & (future["high"] >= lows[i])).sum()
        ) if len(future) else 0

        obs.append(OrderBlock(
            type="BEARISH", high=float(highs[i]), low=float(lows[i]),
            open=float(opens[i]), close=float(closes[i]),
            idx=i, timestamp=str(df.index[i]),
            is_fresh=(touch_count == 0),
            touch_count=touch_count, is_mitigated=is_mitigated,
            caused_bos=caused_bos, bos_level=bos_level,
        ))

    # ── Bullish OB: candle bearish → impulsive move atas → break swing HIGH ──
    for i in range(start, n - 3):
        candle_bear = closes[i] < opens[i]
        if not candle_bear:
            continue

        move_up = max(highs[i+1:min(i+4, n)]) - lows[i]
        if move_up < atr * 1.0:
            continue

        caused_bos = False
        bos_level  = 0.0
        relevant_highs = [s for s in swing_highs if s.idx < i]
        if relevant_highs:
            prev_high = relevant_highs[-1]
            for j in range(i + 1, min(i + 10, n)):
                if closes[j] > prev_high.price:
                    caused_bos = True
                    bos_level  = prev_high.price
                    break

        if not caused_bos:
            continue

        future       = df.iloc[i+1:]
        is_mitigated = bool((future["close"] < lows[i]).any()) if len(future) else False
        touch_count  = int(
            ((future["low"] <= highs[i]) & (future["high"] >= lows[i])).sum()
        ) if len(future) else 0

        obs.append(OrderBlock(
            type="BULLISH", high=float(highs[i]), low=float(lows[i]),
            open=float(opens[i]), close=float(closes[i]),
            idx=i, timestamp=str(df.index[i]),
            is_fresh=(touch_count == 0),
            touch_count=touch_count, is_mitigated=is_mitigated,
            caused_bos=caused_bos, bos_level=bos_level,
        ))

    return obs


# ═══════════════════════════════════════════════════════
# FVG DETECTION
# ═══════════════════════════════════════════════════════
def detect_fvg(df: pd.DataFrame, lookback: int = 50) -> List[FVG]:
    fvgs = []
    atr  = calc_atr(df)
    if atr <= 0:
        return fvgs
    n     = len(df)
    start = max(0, n - lookback)

    for i in range(start + 1, n - 1):
        h0, l0 = float(df["high"].iloc[i-1]), float(df["low"].iloc[i-1])
        h1, l1 = float(df["high"].iloc[i]),   float(df["low"].iloc[i])
        h2, l2 = float(df["high"].iloc[i+1]), float(df["low"].iloc[i+1])

        # Bearish FVG: gap antara high candle i+1 dan low candle i-1
        if l0 > h2 and (l0 - h2) / atr >= FVG_MIN_ATR:
            gap = l0 - h2
            fill = float(df["close"].iloc[i+1:].apply(
                lambda x: 0).mean()) if False else 0
            future_highs = df["high"].iloc[i+2:] if i+2 < n else pd.Series([])
            filled = (future_highs >= h2).any() if len(future_highs) else False
            filled_pct = 100.0 if filled else max(0, (h1 - h2) / gap * 100) if gap > 0 else 0
            fvgs.append(FVG("BEARISH", l0, h2, str(df.index[i]), min(filled_pct, 100)))

        # Bullish FVG: gap antara low candle i+1 dan high candle i-1
        if h0 < l2 and (l2 - h0) / atr >= FVG_MIN_ATR:
            gap = l2 - h0
            future_lows = df["low"].iloc[i+2:] if i+2 < n else pd.Series([])
            filled = (future_lows <= l2).any() if len(future_lows) else False
            filled_pct = 100.0 if filled else max(0, (h0 - l1) / gap * 100 + 50) if gap > 0 else 0
            fvgs.append(FVG("BULLISH", l2, h0, str(df.index[i]), min(filled_pct, 100)))

    return fvgs


# ═══════════════════════════════════════════════════════
# KONFIRMASI — rejection candle di OB
# ═══════════════════════════════════════════════════════
def check_rejection_candle(df_1h: pd.DataFrame, ob: OrderBlock) -> bool:
    """Cek apakah ada rejection candle di 1H dalam zona OB"""
    if len(df_1h) < 3:
        return False
    recent = df_1h.iloc[-5:]
    for i in range(len(recent)):
        c = recent.iloc[i]
        body   = abs(c["close"] - c["open"])
        total  = c["high"] - c["low"]
        if total <= 0:
            continue
        in_ob  = c["low"] <= ob.high and c["high"] >= ob.low

        if ob.type == "BEARISH" and in_ob:
            upper_wick = c["high"] - max(c["open"], c["close"])
            if upper_wick / total > 0.4 or c["close"] < c["open"]:
                return True

        if ob.type == "BULLISH" and in_ob:
            lower_wick = min(c["open"], c["close"]) - c["low"]
            if lower_wick / total > 0.4 or c["close"] > c["open"]:
                return True

    return False


# ═══════════════════════════════════════════════════════
# LEVELS — Entry midpoint, SL swing, TP 1:1/2:1/3:1
# ═══════════════════════════════════════════════════════
def calculate_levels(ob: OrderBlock, direction: str, ms_4h: MarketStructure,
                     atr: float) -> Dict:
    """
    Entry : midpoint OB (50%) — dari strategy baru
    SL    : batas OB + 0.3x ATR buffer — konsisten, tidak terlalu jauh
    TP    : 1.5R / 2.5R / 3.5R — balance antara sering hit dan reward
    """
    entry    = ob.mid
    sl_buf   = atr * 0.3
    min_risk = atr * 0.5   # minimal risk agar TP tidak terlalu dekat

    if direction == "LONG":
        sl   = ob.low - sl_buf
        risk = max(entry - sl, min_risk)
        sl   = entry - risk
        tp1  = entry + risk * TP_RR_1
        tp2  = entry + risk * TP_RR_2
        tp3  = entry + risk * TP_RR_3

    else:  # SHORT
        sl   = ob.high + sl_buf
        risk = max(sl - entry, min_risk)
        sl   = entry + risk
        tp1  = entry - risk * TP_RR_1
        tp2  = entry - risk * TP_RR_2
        tp3  = entry - risk * TP_RR_3

    rr2 = round(abs(tp2 - entry) / risk, 2) if risk > 0 else 0
    return {
        "entry": round(entry, 6), "sl":  round(sl,  6),
        "tp1":   round(tp1,  6),  "tp2": round(tp2, 6),
        "tp3":   round(tp3,  6),  "risk": round(risk, 6),
        "rr2":   rr2,
    }


# ═══════════════════════════════════════════════════════
# SCORING — confluence
# ═══════════════════════════════════════════════════════
def score_setup(ob: OrderBlock, fvg: Optional[FVG],
                ms_4h: MarketStructure, ms_1h: MarketStructure,
                bos_1h: Optional[BoS], direction: str,
                levels: Dict, in_ob: bool) -> Tuple[int, Dict]:
    score = 0
    bd: Dict[str, int] = {}

    # 1. 4H trend alignment — paling penting
    if direction == "SHORT" and ms_4h.bias == "BEARISH":
        score += 30; bd["4H Downtrend"] = 30
    elif direction == "LONG" and ms_4h.bias == "BULLISH":
        score += 30; bd["4H Uptrend"] = 30

    # 2. 1H BOS konfirmasi
    if bos_1h:
        match = (direction == "SHORT" and bos_1h.type == "BEARISH") or \
                (direction == "LONG"  and bos_1h.type == "BULLISH")
        if match:
            score += 25; bd["1H BOS konfirmasi"] = 25

    # 3. OB quality
    if ob.is_fresh:
        score += 20; bd["Fresh OB (belum tersentuh)"] = 20
    elif ob.touch_count == 1:
        score += 14; bd["OB 1x touched"] = 14
    elif ob.touch_count == 2:
        score += 8;  bd["OB 2x touched"] = 8
    elif ob.touch_count == 3:
        score += 4;  bd["OB 3x touched"] = 4

    # 4. Harga di dalam OB (sudah retraced ke zona)
    if in_ob:
        score += 15; bd["Harga di zona OB"] = 15

    # 5. FVG konfluent dengan OB
    if fvg:
        score += 10; bd[f"FVG {fvg.filled_pct:.0f}% filled"] = 10

    # 6. OB caused BOS — validasi kualitas OB
    if ob.caused_bos:
        score += 10; bd["OB caused BOS"] = 10

    # 7. 4H structure strength
    str_bonus = ms_4h.strength * 3
    if str_bonus:
        score += str_bonus; bd[f"4H strength x{ms_4h.strength}"] = str_bonus

    return min(score, 100), bd


# ═══════════════════════════════════════════════════════
# MAIN: FULL SMC ANALYSIS
# ═══════════════════════════════════════════════════════
def analyze_smc(df_1d: pd.DataFrame, df_4h: pd.DataFrame, df_1h: pd.DataFrame,
                 symbol: str) -> SMCSetup:
    """
    Pipeline SMC sesuai task.txt:
    1. Trend 4H
    2. OB 4H (wajib caused BOS)
    3. BOS 1H konfirmasi
    4. Entry midpoint, SL swing, TP 1:1/2:1/3:1
    """
    cp     = float(df_1h["close"].iloc[-1]) if len(df_1h) else 0
    atr_4h = calc_atr(df_4h)

    # Structure analysis
    ms_4h = analyze_market_structure(df_4h, lookback=SWING_LOOKBACK)
    ms_1h = analyze_market_structure(df_1h, lookback=SWING_LOOKBACK)
    ms_1d = analyze_market_structure(df_1d, lookback=7, recent_candles=90) \
            if len(df_1d) >= 20 else MarketStructure("NEUTRAL", [], None, "N/A", 0)

    def wait(reason: str) -> SMCSetup:
        return SMCSetup(
            symbol=symbol, direction="WAIT", score=0,
            ob=None, fvg=None,
            entry=0, sl=0, tp1=0, tp2=0, tp3=0, rr2=0,
            bias_4h=ms_4h.bias, bias_1h=ms_1h.bias, bias_1d=ms_1d.bias,
            explanation=reason,
        )

    if cp <= 0 or atr_4h <= 0:
        return wait("Data tidak cukup")

    # ── STEP 1: Trend 4H ─────────────────────────────────
    if ms_4h.bias == "NEUTRAL":
        return wait(f"4H sideways ({ms_4h.desc}) — tunggu trend jelas")

    direction = "SHORT" if ms_4h.bias == "BEARISH" else "LONG"

    # ── STEP 2: Cari OB 4H yang caused BOS ───────────────
    all_obs = detect_order_blocks(df_4h, lookback=OB_LOOKBACK)
    ob_type = "BEARISH" if direction == "SHORT" else "BULLISH"

    valid_obs = [
        o for o in all_obs
        if o.type == ob_type
        and not o.is_mitigated
        and o.touch_count <= MAX_OB_TOUCHES
    ]

    if not valid_obs:
        return wait(f"Tidak ada OB {ob_type} valid di 4H")

    # ── STEP 3: BOS 1H konfirmasi ─────────────────────────
    bos_1h = ms_1h.last_bos
    bos_confirmed = (
        bos_1h is not None and
        ((direction == "SHORT" and bos_1h.type == "BEARISH") or
         (direction == "LONG"  and bos_1h.type == "BULLISH"))
    )

    # ── STEP 4: Pilih OB terbaik ──────────────────────────
    # OB yang caused BOS lebih diutamakan
    # Pilih yang paling dekat ke harga saat ini
    def ob_distance(o):
        return abs(o.mid - cp)

    # Prioritas: caused_bos dulu, lalu yang terdekat
    caused_obs  = sorted([o for o in valid_obs if o.caused_bos],  key=ob_distance)
    generic_obs = sorted([o for o in valid_obs if not o.caused_bos], key=ob_distance)
    candidates  = caused_obs + generic_obs

    if not candidates:
        return wait(f"Tidak ada OB {ob_type} valid")

    # Pilih OB yang harga mendekati atau sudah di dalam zona
    best_ob = None
    for ob in candidates:
        in_ob   = ob.low <= cp <= ob.high
        near_ob = (
            (direction == "SHORT" and cp >= ob.low * (1 - OB_PROXIMITY_PCT) and cp <= ob.high * 1.05) or
            (direction == "LONG"  and cp <= ob.high * (1 + OB_PROXIMITY_PCT) and cp >= ob.low * 0.95)
        )
        if in_ob or near_ob:
            best_ob = ob
            break

    if best_ob is None:
        # Tunjukkan OB terdekat sebagai info
        closest = candidates[0]
        if direction == "SHORT":
            dist_pct = (closest.low - cp) / cp * 100
            return wait(f"Harga {cp:.4f} belum mendekati OB bearish "
                        f"{closest.low:.4f}–{closest.high:.4f} "
                        f"(+{dist_pct:.1f}% lagi)")
        else:
            dist_pct = (cp - closest.high) / cp * 100
            return wait(f"Harga {cp:.4f} belum mendekati OB bullish "
                        f"{closest.low:.4f}–{closest.high:.4f} "
                        f"(-{dist_pct:.1f}% lagi)")

    in_ob = best_ob.low <= cp <= best_ob.high

    # ── STEP 5: Rejection confirmation untuk OB sudah disentuh ──
    needs_conf = not best_ob.is_fresh
    if needs_conf:
        has_rej = check_rejection_candle(df_1h, best_ob)
        if not has_rej:
            return wait(
                f"OB sudah {best_ob.touch_count}x disentuh — "
                f"menunggu rejection candle di zona {best_ob.low:.4f}–{best_ob.high:.4f}"
            )

    # ── STEP 6: Hitung levels ─────────────────────────────
    levels = calculate_levels(best_ob, direction, ms_4h, atr_4h)

    # ── STEP 7: FVG dekat OB ─────────────────────────────
    fvg_type = "BEARISH" if direction == "SHORT" else "BULLISH"
    fvgs     = detect_fvg(df_4h, lookback=40)
    fvg_near = None
    for f in fvgs:
        if f.type != fvg_type or f.filled_pct > 80:
            continue
        overlap = (min(f.top, best_ob.high) - max(f.bottom, best_ob.low))
        if overlap > 0:
            fvg_near = f
            break

    # ── STEP 8: Score ─────────────────────────────────────
    score, bd = score_setup(
        best_ob, fvg_near, ms_4h, ms_1h,
        bos_1h, direction, levels, in_ob
    )

    # ── Explanation ───────────────────────────────────────
    bos_str = f"BOS 1H {bos_1h.type} ✓" if bos_confirmed else "BOS 1H belum konfirmasi"
    exp = (
        f"Setup {direction} — 4H {ms_4h.bias} ({ms_4h.desc}). "
        f"{bos_str}. "
        f"OB {ob_type} {best_ob.low:.4f}–{best_ob.high:.4f} "
        f"({'fresh' if best_ob.is_fresh else f'{best_ob.touch_count}x touched'}"
        f"{', caused BOS' if best_ob.caused_bos else ''}). "
        f"Entry {levels['entry']:.4f} | SL {levels['sl']:.4f} | "
        f"TP1 {levels['tp1']:.4f} | TP2 {levels['tp2']:.4f}."
    )
    if fvg_near:
        exp += f" FVG {fvg_type} konfluent ({fvg_near.filled_pct:.0f}% filled)."

    return SMCSetup(
        symbol=symbol, direction=direction, score=score,
        ob=best_ob, fvg=fvg_near,
        entry=levels["entry"], sl=levels["sl"],
        tp1=levels["tp1"], tp2=levels["tp2"], tp3=levels["tp3"],
        rr2=levels["rr2"],
        bias_4h=ms_4h.bias, bias_1h=ms_1h.bias, bias_1d=ms_1d.bias,
        bos_1h=bos_1h,
        needs_confirmation=needs_conf,
        explanation=exp,
        score_breakdown=bd,
        setup_notes=exp,
    )
