"""
Analytics API
Performance breakdown:
  - Equity curve
  - Win/loss by OB type, TF alignment, FVG
  - Performance by symbol, session, timeframe
  - Insights & lesson auto-generation
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from collections import defaultdict

from app.db.session import get_db
from app.models.db_models import Position, Signal
from app.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/equity-curve")
async def get_equity_curve(db: AsyncSession = Depends(get_db)):
    """Equity curve — running PnL per trade"""
    rows = (await db.execute(
        select(Position)
        .where(Position.status == "CLOSED")
        .order_by(Position.close_time)
    )).scalars().all()

    points = []
    cum_r = 0.0
    cum_usdt = 0.0
    for p in rows:
        r = float(p.pnl_r or 0)
        u = float(p.pnl_usdt or 0)
        cum_r    += r
        cum_usdt += u
        points.append({
            "time": p.close_time.isoformat() if p.close_time else None,
            "symbol": p.symbol,
            "result": p.result,
            "pnl_r": round(r, 2),
            "pnl_usdt": round(u, 2),
            "cum_r": round(cum_r, 2),
            "cum_usdt": round(cum_usdt, 2),
        })
    return {"points": points}


@router.get("/by-symbol")
async def get_by_symbol(db: AsyncSession = Depends(get_db)):
    """Performance breakdown per koin"""
    rows = (await db.execute(
        select(Position).where(Position.status == "CLOSED")
    )).scalars().all()

    data = defaultdict(lambda: {"trades": 0, "wins": 0, "losses": 0,
                                 "pnl_r": 0.0, "pnl_usdt": 0.0})
    for p in rows:
        s = data[p.symbol]
        s["trades"] += 1
        s["pnl_r"]    += float(p.pnl_r or 0)
        s["pnl_usdt"] += float(p.pnl_usdt or 0)
        if p.result and p.result.startswith("WIN"):
            s["wins"] += 1
        elif p.result == "LOSS":
            s["losses"] += 1

    result = []
    for sym, d in sorted(data.items(), key=lambda x: -x[1]["trades"]):
        wr = d["wins"] / d["trades"] * 100 if d["trades"] else 0
        result.append({
            "symbol": sym,
            "trades": d["trades"],
            "wins": d["wins"],
            "losses": d["losses"],
            "win_rate": round(wr, 1),
            "pnl_r": round(d["pnl_r"], 2),
            "pnl_usdt": round(d["pnl_usdt"], 2),
        })
    return result


@router.get("/by-direction")
async def get_by_direction(db: AsyncSession = Depends(get_db)):
    """LONG vs SHORT performance"""
    rows = (await db.execute(
        select(Position).where(Position.status == "CLOSED")
    )).scalars().all()

    data = defaultdict(lambda: {"trades": 0, "wins": 0, "pnl_r": 0.0})
    for p in rows:
        d = data[p.side or "UNKNOWN"]
        d["trades"] += 1
        d["pnl_r"]  += float(p.pnl_r or 0)
        if p.result and p.result.startswith("WIN"):
            d["wins"] += 1

    return [
        {
            "direction": side,
            "trades": d["trades"],
            "wins": d["wins"],
            "win_rate": round(d["wins"] / d["trades"] * 100, 1) if d["trades"] else 0,
            "pnl_r": round(d["pnl_r"], 2),
        }
        for side, d in data.items()
    ]


@router.get("/by-result")
async def get_by_result(db: AsyncSession = Depends(get_db)):
    """Breakdown TP1 / TP2 / TP3 / Loss count"""
    rows = (await db.execute(
        select(Position).where(Position.status == "CLOSED")
    )).scalars().all()

    data = defaultdict(int)
    for p in rows:
        data[p.result or "UNKNOWN"] += 1

    return [{"result": k, "count": v} for k, v in sorted(data.items())]


@router.get("/monthly")
async def get_monthly(db: AsyncSession = Depends(get_db)):
    """P&L per bulan"""
    rows = (await db.execute(
        select(Position)
        .where(Position.status == "CLOSED")
        .order_by(Position.close_time)
    )).scalars().all()

    data = defaultdict(lambda: {"pnl_r": 0.0, "pnl_usdt": 0.0, "trades": 0, "wins": 0})
    for p in rows:
        if not p.close_time:
            continue
        key = p.close_time.strftime("%Y-%m")
        d = data[key]
        d["pnl_r"]    += float(p.pnl_r or 0)
        d["pnl_usdt"] += float(p.pnl_usdt or 0)
        d["trades"]   += 1
        if p.result and p.result.startswith("WIN"):
            d["wins"] += 1

    return [
        {
            "month": k,
            "pnl_r": round(d["pnl_r"], 2),
            "pnl_usdt": round(d["pnl_usdt"], 2),
            "trades": d["trades"],
            "win_rate": round(d["wins"] / d["trades"] * 100, 1) if d["trades"] else 0,
        }
        for k, d in sorted(data.items())
    ]


@router.get("/insights")
async def get_insights(db: AsyncSession = Depends(get_db)):
    """
    Auto-generate trading insights dari data historis.
    Rule-based — tidak ada fake AI.
    """
    rows = (await db.execute(
        select(Position).where(Position.status == "CLOSED")
    )).scalars().all()

    if len(rows) < 5:
        return {"insights": [
            {"type": "info", "text": "Butuh minimal 5 trade untuk generate insights.", "icon": "📊"}
        ]}

    insights = []
    closed = rows
    wins = [p for p in closed if p.result and p.result.startswith("WIN")]
    losses = [p for p in closed if p.result == "LOSS"]
    wr = len(wins) / len(closed) * 100 if closed else 0

    # 1. Overall win rate
    icon = "✅" if wr >= 55 else "⚠️" if wr >= 45 else "❌"
    insights.append({
        "type": "performance",
        "text": f"Win rate keseluruhan: {wr:.1f}% dari {len(closed)} trade.",
        "icon": icon,
    })

    # 2. Best symbol
    sym_data = defaultdict(lambda: {"w": 0, "t": 0})
    for p in closed:
        sym_data[p.symbol]["t"] += 1
        if p.result and p.result.startswith("WIN"):
            sym_data[p.symbol]["w"] += 1
    best_sym = max(sym_data.items(), key=lambda x: x[1]["w"] / x[1]["t"] if x[1]["t"] >= 3 else 0, default=None)
    if best_sym and best_sym[1]["t"] >= 3:
        bwr = best_sym[1]["w"] / best_sym[1]["t"] * 100
        insights.append({
            "type": "symbol",
            "text": f"{best_sym[0].replace('/USDT', '')} adalah koin terbaik kamu: {bwr:.0f}% win rate dari {best_sym[1]['t']} trade.",
            "icon": "🏆",
        })

    # 3. Long vs Short
    long_t  = [p for p in closed if p.side == "LONG"]
    short_t = [p for p in closed if p.side == "SHORT"]
    if long_t and short_t:
        lwr = sum(1 for p in long_t  if p.result and p.result.startswith("WIN")) / len(long_t) * 100
        swr = sum(1 for p in short_t if p.result and p.result.startswith("WIN")) / len(short_t) * 100
        better = "LONG" if lwr > swr else "SHORT"
        diff = abs(lwr - swr)
        if diff > 10:
            insights.append({
                "type": "direction",
                "text": f"Setup {better} {diff:.0f}% lebih profitable dari arah sebaliknya ({lwr:.0f}% vs {swr:.0f}%).",
                "icon": "📈" if better == "LONG" else "📉",
            })

    # 4. Loss streak warning
    streak = 0
    max_streak = 0
    recent_results = [p.result for p in sorted(closed, key=lambda x: x.close_time or x.open_time)]
    for r in reversed(recent_results):
        if r == "LOSS":
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            break
    if streak >= 2:
        insights.append({
            "type": "warning",
            "text": f"⚠️ Kamu sedang dalam loss streak {streak}x berturut-turut. Pertimbangkan kurangi size atau istirahat.",
            "icon": "🔴",
        })
    elif max_streak >= 3:
        insights.append({
            "type": "risk",
            "text": f"Max loss streak: {max_streak}x. Pastikan daily loss limit terpasang.",
            "icon": "⚠️",
        })

    # 5. TP1 vs TP2 breakdown
    tp1_count = sum(1 for p in closed if p.result == "WIN_TP1")
    tp2_count = sum(1 for p in closed if p.result == "WIN_TP2")
    tp3_count = sum(1 for p in closed if p.result == "WIN_TP3")
    if wins:
        insights.append({
            "type": "exit",
            "text": f"Dari {len(wins)} win: TP1={tp1_count} | TP2={tp2_count} | TP3={tp3_count}. "
                    f"{'Banyak yang exit di TP1 — coba hold lebih lama ke TP2.' if tp1_count > tp2_count + tp3_count else 'Exit distribution bagus.'}",
            "icon": "🎯",
        })

    # 6. Average hold
    holds = []
    for p in closed:
        if p.open_time and p.close_time:
            holds.append((p.close_time - p.open_time).total_seconds() / 3600)
    if holds:
        avg_h = sum(holds) / len(holds)
        insights.append({
            "type": "duration",
            "text": f"Rata-rata hold: {avg_h:.1f} jam. {'Trade kamu cenderung cepat — pastikan tidak exit terlalu dini.' if avg_h < 8 else 'Hold duration normal untuk TF 4H.'}",
            "icon": "⏱️",
        })

    return {"insights": insights}
