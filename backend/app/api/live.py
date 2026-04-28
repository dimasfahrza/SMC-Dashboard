"""
Live Positions & Wallet API
Fetch dari Binance Demo + merge SL/TP dari database.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from urllib.parse import unquote
from app.services.binance_demo import demo_client
from app.db.session import get_db
from app.models.db_models import Position
from app.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter(prefix="/api/live", tags=["live"])


async def _merge_sl_tp(positions: list, db: AsyncSession) -> list:
    """
    Ambil SL/TP dari tabel positions (database) dan merge ke data Binance.
    Binance positionRisk tidak menyimpan SL/TP — hanya di order terpisah.
    """
    if not positions:
        return positions

    # Ambil semua posisi OPEN dari database
    result = await db.execute(
        select(Position)
        .where(Position.status == "OPEN")
        .order_by(desc(Position.open_time))
    )
    db_positions = result.scalars().all()

    # Build lookup: symbol_raw → db_position
    db_lookup = {}
    for dbp in db_positions:
        sym_raw = dbp.symbol.replace("/", "").upper()
        db_lookup[sym_raw] = dbp

    # Merge
    merged = []
    for pos in positions:
        sym_raw = pos["symbol_raw"].upper()
        dbp = db_lookup.get(sym_raw)
        if dbp:
            pos = dict(pos)
            pos["stop_loss"] = float(dbp.stop_loss) if dbp.stop_loss else None
            pos["tp1"]       = float(dbp.tp1)       if dbp.tp1       else None
            pos["tp2"]       = float(dbp.tp2)       if dbp.tp2       else None
            pos["tp3"]       = float(dbp.tp3)       if dbp.tp3       else None
            pos["db_id"]     = dbp.id
        else:
            pos = dict(pos)
            pos["stop_loss"] = None
            pos["tp1"]       = None
            pos["tp2"]       = None
            pos["tp3"]       = None
        merged.append(pos)

    return merged


@router.get("/positions")
async def get_live_positions(db: AsyncSession = Depends(get_db)):
    """Posisi terbuka dari Binance Demo + SL/TP dari database."""
    positions = await demo_client.get_open_positions()
    positions = await _merge_sl_tp(positions, db)
    return {"positions": positions, "count": len(positions)}


@router.get("/positions/{symbol:path}")
async def get_live_position(symbol: str, db: AsyncSession = Depends(get_db)):
    """Posisi untuk satu simbol."""
    symbol = unquote(symbol).upper()
    pos = await demo_client.get_position_for_symbol(symbol)
    if not pos:
        return {"has_position": False, "position": None}
    merged = await _merge_sl_tp([pos], db)
    return {"has_position": True, "position": merged[0]}


@router.get("/wallet")
async def get_wallet():
    """Wallet balance + equity dari Binance Demo."""
    wallet = await demo_client.get_wallet_equity()
    if not wallet:
        return {
            "wallet_balance": 0, "unrealized_pnl": 0,
            "equity": 0, "available": 0,
            "used_margin": 0, "margin_ratio": 0,
            "error": "API key belum dikonfigurasi atau tidak dapat terhubung ke Binance Demo",
        }
    return wallet


@router.get("/status")
async def get_live_status():
    """Cek apakah API key sudah terkonfigurasi."""
    from app.core.config import settings
    has_keys = bool(
        getattr(settings, "binance_demo_api_key", "") and
        getattr(settings, "binance_demo_api_secret", "")
    )
    return {
        "configured": has_keys,
        "message": "API key terkonfigurasi" if has_keys
                   else "Tambahkan BINANCE_DEMO_API_KEY ke .env",
    }
