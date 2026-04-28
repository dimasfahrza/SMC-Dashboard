"""
Economic Calendar API

Urutan prioritas:
  1. Trading Economics API (jika TE_API_KEY ada)
  2. Investing.com scraper (primary fallback)
  3. Database events (jika ada seed manual)
  4. Hardcode schedule (last resort)

Caching: hasil di-cache 10 menit agar tidak spam scrape.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from datetime import datetime, timedelta, timezone
from typing import Optional
import httpx
import os
import time

from app.db.session import get_db
from app.models.db_models import EconomicEvent
from app.core.config import settings
from app.core.logging import get_logger
from app.services.investing_scraper import scrape_investing_calendar

log = get_logger(__name__)
router = APIRouter(prefix="/api/calendar", tags=["calendar"])

TE_BASE = "https://api.tradingeconomics.com"

# ── Cache (10 menit) ──────────────────────────────────
_cache = {"data": None, "ts": 0, "source": None}
CACHE_TTL = 600  # 10 menit


async def fetch_from_trading_economics(api_key: str, days: int = 7):
    """Primary: Trading Economics API"""
    now = datetime.now(timezone.utc)
    end = now + timedelta(days=days)
    url = f"{TE_BASE}/calendar/country/united states/{now.strftime('%Y-%m-%d')}/{end.strftime('%Y-%m-%d')}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url, params={"c": api_key, "f": "json"})
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        log.warning(f"Trading Economics fetch failed: {e}")
        return None

    events = []
    for item in data:
        if not item.get("Date"):
            continue
        importance = item.get("Importance", 0)
        impact = "HIGH" if importance >= 3 else "MEDIUM" if importance >= 2 else "LOW"
        events.append({
            "title": item.get("Event", ""),
            "currency": item.get("Currency", "USD"),
            "impact": impact,
            "event_time": item.get("Date", ""),
            "actual": str(item.get("Actual", "") or ""),
            "forecast": str(item.get("Forecast", "") or ""),
            "previous": str(item.get("Previous", "") or ""),
            "source": "tradingeconomics",
        })
    return events


# ── Hardcode fallback ─────────────────────────────────
HARDCODE_EVENTS = [
    (5, 7, 18, "FOMC Rate Decision", "HIGH"),
    (6, 11, 12, "CPI m/m", "HIGH"),
    (6, 13, 18, "FOMC Rate Decision", "HIGH"),
    (7, 11, 12, "CPI m/m", "HIGH"),
    (7, 5, 12, "Non-Farm Payrolls", "HIGH"),
    (8, 1, 12, "Non-Farm Payrolls", "HIGH"),
    (8, 13, 12, "CPI m/m", "HIGH"),
    (9, 5, 12, "Non-Farm Payrolls", "HIGH"),
    (9, 10, 12, "CPI m/m", "HIGH"),
    (9, 17, 18, "FOMC Rate Decision", "HIGH"),
    (10, 3, 12, "Non-Farm Payrolls", "HIGH"),
    (10, 10, 12, "CPI m/m", "HIGH"),
    (11, 7, 12, "Non-Farm Payrolls", "HIGH"),
    (11, 13, 12, "CPI m/m", "HIGH"),
    (12, 5, 12, "Non-Farm Payrolls", "HIGH"),
    (12, 10, 12, "CPI m/m", "HIGH"),
    (12, 17, 18, "FOMC Rate Decision", "HIGH"),
]


def build_hardcode_events(days_ahead: int = 30):
    now = datetime.now(timezone.utc)
    year = now.year
    events = []
    for month, day, hour, title, impact in HARDCODE_EVENTS:
        try:
            dt = datetime(year, month, day, hour, 0, tzinfo=timezone.utc)
            if dt < now - timedelta(hours=1):
                dt = datetime(year + 1, month, day, hour, 0, tzinfo=timezone.utc)
            if now - timedelta(hours=1) <= dt <= now + timedelta(days=days_ahead):
                events.append({
                    "title": title, "currency": "USD", "impact": impact,
                    "event_time": dt.isoformat(),
                    "actual": "", "forecast": "", "previous": "",
                    "source": "hardcode",
                })
        except Exception:
            pass
    return sorted(events, key=lambda x: x["event_time"])


async def get_events_with_fallback(days: int = 7, db: Optional[AsyncSession] = None) -> dict:
    """
    Ambil events dengan urutan fallback + cache.
    Return: {"events": [...], "source": "..."}
    """
    # Check cache
    now_ts = time.time()
    if _cache["data"] and now_ts - _cache["ts"] < CACHE_TTL:
        return {"events": _cache["data"], "source": _cache["source"]}

    # 1. Trading Economics
    te_key = getattr(settings, "te_api_key", "") or os.getenv("TE_API_KEY", "")
    if te_key:
        te_events = await fetch_from_trading_economics(te_key, days)
        if te_events:
            _cache.update(data=te_events, ts=now_ts, source="tradingeconomics")
            return {"events": te_events, "source": "tradingeconomics"}

    # 2. Investing.com
    try:
        inv_events = await scrape_investing_calendar(days)
        if inv_events and len(inv_events) > 0:
            _cache.update(data=inv_events, ts=now_ts, source="investing.com")
            return {"events": inv_events, "source": "investing.com"}
    except Exception as e:
        log.warning(f"Investing scrape error: {e}")

    # 3. Database
    if db:
        now = datetime.now(timezone.utc)
        until = now + timedelta(days=days)
        result = await db.execute(
            select(EconomicEvent)
            .where(and_(
                EconomicEvent.event_time >= now - timedelta(hours=1),
                EconomicEvent.event_time <= until,
            ))
            .order_by(EconomicEvent.event_time)
        )
        db_events = result.scalars().all()
        if db_events:
            events = [
                {
                    "title": e.title, "currency": e.currency or "USD",
                    "impact": e.impact, "event_time": e.event_time.isoformat(),
                    "actual": "", "forecast": "", "previous": "",
                    "source": "database",
                } for e in db_events
            ]
            _cache.update(data=events, ts=now_ts, source="database")
            return {"events": events, "source": "database"}

    # 4. Hardcode
    events = build_hardcode_events(days)
    _cache.update(data=events, ts=now_ts, source="hardcode")
    return {"events": events, "source": "hardcode"}


# ═══════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════
@router.get("/upcoming")
async def get_upcoming(
    days: int = Query(7, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
):
    return await get_events_with_fallback(days, db)


@router.get("/blackout")
async def get_blackout(db: AsyncSession = Depends(get_db)):
    """High impact event dalam ±30 menit"""
    now = datetime.now(timezone.utc)
    result = await get_events_with_fallback(days=2, db=db)

    for ev in result["events"]:
        if ev["impact"] != "HIGH":
            continue
        try:
            ev_time = datetime.fromisoformat(ev["event_time"].replace("Z", "+00:00"))
            diff_min = (ev_time - now).total_seconds() / 60
            if -5 <= diff_min <= 30:
                mins = max(0, int(diff_min))
                return {
                    "active": True, "event": ev,
                    "minutes_until": mins,
                    "message": f"High impact news in {mins} min — trading paused" if mins > 0
                               else "High impact news just released — trading paused",
                }
        except Exception:
            pass
    return {"active": False, "event": None, "minutes_until": None, "message": None}


@router.get("/refresh")
async def force_refresh(db: AsyncSession = Depends(get_db)):
    """Clear cache dan fetch ulang"""
    _cache.update(data=None, ts=0, source=None)
    return await get_events_with_fallback(days=7, db=db)
