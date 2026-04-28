"""
Economic Calendar / Positions / Risk Management endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, and_
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from app.db.session import get_db
from app.models.db_models import EconomicEvent, Position
from app.schemas.api_schemas import EconomicEventData, PositionData, RiskSettings
from app.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter(prefix="/api", tags=["trading"])


# ═══════════════════════════════════════════════════════
# ECONOMIC CALENDAR
# ═══════════════════════════════════════════════════════
@router.get("/economic/upcoming", response_model=List[EconomicEventData])
async def get_upcoming_events(
    hours: int = 168,  # default 7 days
    db: AsyncSession = Depends(get_db)
):
    """Event ekonomi dalam N jam ke depan"""
    now = datetime.now(timezone.utc)
    until = now + timedelta(hours=hours)
    result = await db.execute(
        select(EconomicEvent)
        .where(and_(EconomicEvent.event_time >= now - timedelta(hours=1),
                    EconomicEvent.event_time <= until))
        .order_by(EconomicEvent.event_time)
    )
    return result.scalars().all()


@router.get("/economic/active-blackout")
async def get_active_blackout(db: AsyncSession = Depends(get_db)):
    """
    Cek apakah saat ini dalam periode blackout (high impact news ± 30 menit).
    Return: { active: bool, event: {...} if active }
    """
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(minutes=30)
    window_end   = now + timedelta(minutes=30)

    result = await db.execute(
        select(EconomicEvent)
        .where(and_(
            EconomicEvent.impact == "HIGH",
            EconomicEvent.event_time >= window_start,
            EconomicEvent.event_time <= window_end,
        ))
        .order_by(EconomicEvent.event_time)
        .limit(1)
    )
    event = result.scalar_one_or_none()

    if event:
        return {
            "active": True,
            "event": {
                "id": event.id,
                "event_time": event.event_time,
                "title": event.title,
                "currency": event.currency,
                "impact": event.impact,
                "affects": event.affects or [],
            }
        }
    return {"active": False, "event": None}


@router.post("/economic/seed")
async def seed_economic_events(db: AsyncSession = Depends(get_db)):
    """Seed contoh event ekonomi (untuk testing)"""
    now = datetime.now(timezone.utc)
    samples = [
        EconomicEvent(
            event_time=now + timedelta(hours=2),
            title="FOMC Member Speaks", currency="USD", impact="HIGH",
            affects=["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT"]
        ),
        EconomicEvent(
            event_time=now + timedelta(hours=6),
            title="Unemployment Claims", currency="USD", impact="MEDIUM",
            affects=["BTC/USDT", "ETH/USDT"]
        ),
        EconomicEvent(
            event_time=now + timedelta(days=1),
            title="CPI m/m", currency="USD", impact="HIGH",
            affects=["BTC/USDT", "ETH/USDT", "SOL/USDT"]
        ),
        EconomicEvent(
            event_time=now + timedelta(days=3),
            title="Non-Farm Payrolls", currency="USD", impact="HIGH",
            affects=["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT"]
        ),
        EconomicEvent(
            event_time=now + timedelta(days=5),
            title="Philly Fed Manufacturing Index", currency="USD", impact="MEDIUM",
            affects=["BTC/USDT"]
        ),
    ]
    for e in samples:
        db.add(e)
    await db.commit()
    return {"ok": True, "added": len(samples)}


# ═══════════════════════════════════════════════════════
# POSITIONS
# ═══════════════════════════════════════════════════════
@router.get("/positions/open", response_model=List[PositionData])
async def get_open_positions(db: AsyncSession = Depends(get_db)):
    """Semua posisi yang masih OPEN"""
    result = await db.execute(
        select(Position).where(Position.status == "OPEN")
        .order_by(desc(Position.open_time))
    )
    return [PositionData.model_validate(p) for p in result.scalars().all()]


@router.get("/positions/history", response_model=List[PositionData])
async def get_position_history(limit: int = 50, db: AsyncSession = Depends(get_db)):
    """History posisi (closed)"""
    result = await db.execute(
        select(Position).where(Position.status == "CLOSED")
        .order_by(desc(Position.close_time)).limit(limit)
    )
    return [PositionData.model_validate(p) for p in result.scalars().all()]


# ═══════════════════════════════════════════════════════
# RISK SETTINGS
# ═══════════════════════════════════════════════════════
@router.get("/risk", response_model=RiskSettings)
async def get_risk_settings(db: AsyncSession = Depends(get_db)):
    """Ambil risk settings + status hari ini"""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    # Count open positions
    open_result = await db.execute(
        select(Position).where(Position.status == "OPEN")
    )
    open_count = len(open_result.scalars().all())

    # Daily PnL
    closed_today = await db.execute(
        select(Position).where(and_(
            Position.status == "CLOSED",
            Position.close_time >= today_start,
        ))
    )
    closed_list = closed_today.scalars().all()
    daily_pnl = sum(float(p.pnl_usdt or 0) for p in closed_list)

    # Loss streak — consecutive losses paling baru
    recent_result = await db.execute(
        select(Position).where(Position.status == "CLOSED")
        .order_by(desc(Position.close_time)).limit(10)
    )
    recent_closed = recent_result.scalars().all()
    loss_streak = 0
    for p in recent_closed:
        if p.result == "LOSS":
            loss_streak += 1
        else:
            break

    # Risk multiplier dari loss streak
    mul_table = {0: 1.0, 1: 1.0, 2: 0.75, 3: 0.5}
    risk_mul = mul_table.get(loss_streak, 0.25) if loss_streak >= 2 else 1.0

    # Daily PnL % (asumsi balance default 1000 untuk demo — production harus dari settings)
    daily_pnl_pct = (daily_pnl / 1000) * 100

    return RiskSettings(
        risk_per_trade_pct=1.0,
        max_daily_loss_pct=5.0,
        max_open_positions=3,
        current_open=open_count,
        daily_pnl_usdt=round(daily_pnl, 2),
        daily_pnl_pct=round(daily_pnl_pct, 2),
        loss_streak=loss_streak,
        risk_multiplier=risk_mul,
        paused=(daily_pnl_pct <= -5.0),
    )
