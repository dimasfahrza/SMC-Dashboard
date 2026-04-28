"""
Signal / Sentiment / Context / SNR endpoints
"""
from fastapi import APIRouter, HTTPException, Depends
from urllib.parse import unquote
from typing import List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.db.session import get_db
from app.models.db_models import Signal as DbSignal
from app.services.binance_client import binance_client
from app.services.smc_engine import analyze_smc
from app.services.sentiment_engine import compute_sentiment
from app.services.market_context import compute_market_context
from app.services.snr_engine import compute_snr_levels
from app.schemas.api_schemas import (
    SignalData, SentimentResponse, MarketContextResponse,
    OrderBlockData, FVGData
)
from app.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter(prefix="/api", tags=["analysis"])


@router.get("/signal/{symbol:path}", response_model=SignalData)
async def get_signal(symbol: str):
    """Analisis SMC lengkap → sinyal trading"""
    symbol = unquote(symbol).upper()

    df_1d = await binance_client.fetch_ohlcv(symbol, "1d", 300)
    df_4h = await binance_client.fetch_ohlcv(symbol, "4h", 250)
    df_1h = await binance_client.fetch_ohlcv(symbol, "1h", 250)

    setup = analyze_smc(df_1d, df_4h, df_1h, symbol)

    ob_data = None
    if setup.ob:
        ob_data = OrderBlockData(
            type=setup.ob.type, high=setup.ob.high, low=setup.ob.low,
            timestamp=setup.ob.timestamp, is_fresh=setup.ob.is_fresh,
            touch_count=setup.ob.touch_count, is_mitigated=setup.ob.is_mitigated,
        )
    fvg_data = None
    if setup.fvg:
        fvg_data = FVGData(type=setup.fvg.type, top=setup.fvg.top,
                           bottom=setup.fvg.bottom, timestamp=setup.fvg.timestamp,
                           filled_pct=setup.fvg.filled_pct)

    return SignalData(
        symbol=symbol, direction=setup.direction, score=setup.score,
        entry=setup.entry, stop_loss=setup.sl,
        tp1=setup.tp1, tp2=setup.tp2, tp3=setup.tp3, rr2=setup.rr2,
        bias_1d=setup.bias_1d, bias_4h=setup.bias_4h, bias_1h=setup.bias_1h,
        explanation=setup.explanation,
        score_breakdown=setup.score_breakdown,
        ob=ob_data, fvg=fvg_data,
        needs_confirmation=setup.needs_confirmation,
    )


@router.get("/sentiment/{symbol:path}", response_model=SentimentResponse)
async def get_sentiment(symbol: str):
    """AI Sentiment untuk satu koin"""
    symbol = unquote(symbol).upper()

    df_1d = await binance_client.fetch_ohlcv(symbol, "1d", 200)
    df_4h = await binance_client.fetch_ohlcv(symbol, "4h", 200)
    df_1h = await binance_client.fetch_ohlcv(symbol, "1h", 200)
    df_15m = await binance_client.fetch_ohlcv(symbol, "15m", 100)

    if df_4h.empty or df_1h.empty:
        raise HTTPException(status_code=500, detail="Data tidak bisa diambil")

    result = compute_sentiment(df_1d, df_4h, df_1h, df_15m)
    return SentimentResponse(symbol=symbol, **result)


@router.get("/context/{symbol:path}", response_model=MarketContextResponse)
async def get_context(symbol: str):
    """Market context — session, trend, EMA, ATR%, momentum"""
    symbol = unquote(symbol).upper()

    df_15m = await binance_client.fetch_ohlcv(symbol, "15m", 100)
    df_1h  = await binance_client.fetch_ohlcv(symbol, "1h", 200)
    df_4h  = await binance_client.fetch_ohlcv(symbol, "4h", 200)

    if df_15m.empty or df_1h.empty:
        raise HTTPException(status_code=500, detail="Data tidak bisa diambil")

    ctx = compute_market_context(df_15m, df_1h, df_4h)
    if not ctx:
        raise HTTPException(status_code=500, detail="Gagal compute context")
    return MarketContextResponse(symbol=symbol, **ctx)


@router.get("/snr/{symbol:path}")
async def get_snr(symbol: str):
    """Support & Resistance levels"""
    symbol = unquote(symbol).upper()

    df_1d = await binance_client.fetch_ohlcv(symbol, "1d", 30)
    df_4h = await binance_client.fetch_ohlcv(symbol, "4h", 200)
    df_1h = await binance_client.fetch_ohlcv(symbol, "1h", 50)

    if df_1h.empty or df_1d.empty:
        raise HTTPException(status_code=500, detail="Data tidak bisa diambil")

    return compute_snr_levels(df_1d, df_4h, df_1h)


@router.get("/signals/recent")
async def get_recent_signals(limit: int = 20, db: AsyncSession = Depends(get_db)):
    """Sinyal terbaru dari database"""
    result = await db.execute(
        select(DbSignal).order_by(desc(DbSignal.created_at)).limit(limit)
    )
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "created_at": r.created_at,
            "symbol": r.symbol,
            "direction": r.direction,
            "score": r.score,
            "entry": float(r.entry) if r.entry else 0,
            "stop_loss": float(r.stop_loss) if r.stop_loss else 0,
            "tp1": float(r.tp1) if r.tp1 else 0,
            "explanation": r.explanation,
        } for r in rows
    ]
