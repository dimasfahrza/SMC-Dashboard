"""
Journal API
CRUD untuk trade journal dari tabel positions + signals
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, and_
from datetime import datetime, timezone
from typing import Optional

from app.db.session import get_db
from app.models.db_models import Position, Signal
from app.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter(prefix="/api/journal", tags=["journal"])


@router.get("/trades")
async def get_trades(
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    symbol: Optional[str] = None,
    result: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Ambil semua trade journal dengan filter opsional"""
    q = select(Position).order_by(desc(Position.open_time))
    if symbol:
        q = q.where(Position.symbol == symbol)
    if result:
        if result == "WIN":
            q = q.where(Position.result.like("WIN%"))
        elif result == "OPEN":
            q = q.where(Position.status == "OPEN")
        else:
            q = q.where(Position.result == result)
    q = q.limit(limit).offset(offset)

    rows = (await db.execute(q)).scalars().all()
    total = (await db.execute(
        select(func.count(Position.id))
        .where(Position.symbol == symbol if symbol else True)
    )).scalar()

    return {
        "trades": [_fmt_position(p) for p in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/summary")
async def get_journal_summary(db: AsyncSession = Depends(get_db)):
    """Summary statistik journal"""
    closed = (await db.execute(
        select(Position).where(Position.status == "CLOSED")
    )).scalars().all()

    if not closed:
        return _empty_summary()

    wins   = [p for p in closed if p.result and p.result.startswith("WIN")]
    losses = [p for p in closed if p.result == "LOSS"]
    total_r    = sum(float(p.pnl_r or 0) for p in closed)
    total_usdt = sum(float(p.pnl_usdt or 0) for p in closed)
    gross_win  = sum(float(p.pnl_r or 0) for p in wins)
    gross_loss = abs(sum(float(p.pnl_r or 0) for p in losses))
    win_rate   = len(wins) / len(closed) * 100 if closed else 0
    pf         = round(gross_win / gross_loss, 2) if gross_loss > 0 else 99.0

    # Max drawdown
    cum, peak, dd = 0.0, 0.0, 0.0
    for p in sorted(closed, key=lambda x: x.close_time or datetime.min):
        cum += float(p.pnl_r or 0)
        if cum > peak:
            peak = cum
        if peak - cum > dd:
            dd = peak - cum

    # Avg hold hours
    holds = []
    for p in closed:
        if p.open_time and p.close_time:
            holds.append((p.close_time - p.open_time).total_seconds() / 3600)

    return {
        "total_trades": len(closed),
        "open_trades": (await db.execute(
            select(func.count(Position.id)).where(Position.status == "OPEN")
        )).scalar() or 0,
        "wins": len(wins),
        "losses": len(losses),
        "win_rate": round(win_rate, 1),
        "total_r": round(total_r, 2),
        "total_usdt": round(total_usdt, 2),
        "profit_factor": pf,
        "max_drawdown_r": round(dd, 2),
        "avg_hold_hours": round(sum(holds) / len(holds), 1) if holds else 0,
        "best_trade_r": round(max((float(p.pnl_r or 0) for p in closed), default=0), 2),
        "worst_trade_r": round(min((float(p.pnl_r or 0) for p in closed), default=0), 2),
    }


def _fmt_position(p: Position) -> dict:
    ep = float(p.entry_price or 0)
    fmt = lambda v: round(float(v), 6 if ep < 1 else 4 if ep < 10 else 2) if v else None
    return {
        "id": p.id,
        "symbol": p.symbol,
        "side": p.side,
        "status": p.status,
        "open_time": p.open_time.isoformat() if p.open_time else None,
        "close_time": p.close_time.isoformat() if p.close_time else None,
        "entry_price": fmt(p.entry_price),
        "exit_price": fmt(p.exit_price),
        "stop_loss": fmt(p.stop_loss),
        "tp1": fmt(p.tp1),
        "tp2": fmt(p.tp2),
        "tp3": fmt(p.tp3),
        "size": float(p.size or 0),
        "leverage": p.leverage,
        "margin_used": round(float(p.margin_used or 0), 2),
        "risk_usdt": round(float(p.risk_usdt or 0), 2),
        "result": p.result,
        "pnl_usdt": round(float(p.pnl_usdt or 0), 2) if p.pnl_usdt else None,
        "pnl_r": round(float(p.pnl_r or 0), 2) if p.pnl_r else None,
        "notes": p.notes,
    }


def _empty_summary():
    return {
        "total_trades": 0, "open_trades": 0,
        "wins": 0, "losses": 0, "win_rate": 0,
        "total_r": 0, "total_usdt": 0, "profit_factor": 0,
        "max_drawdown_r": 0, "avg_hold_hours": 0,
        "best_trade_r": 0, "worst_trade_r": 0,
    }
