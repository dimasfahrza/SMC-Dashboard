"""
Market Data Endpoints
- /tickers              : live tickers semua watchlist
- /tickers/{symbol}     : ticker satu koin
- /ohlcv/{symbol}       : OHLCV candles untuk chart
- /structure/{symbol}   : market structure + OB + FVG + SNR
"""
from fastapi import APIRouter, HTTPException, Query
from typing import List
import time
from urllib.parse import unquote

from app.services.binance_client import binance_client
from app.services.smc_engine import (
    analyze_market_structure, detect_order_blocks, detect_fvg
)
from app.services.snr_engine import compute_snr_levels
from app.core.config import settings
from app.core.logging import get_logger
from app.schemas.api_schemas import (
    TickerData, TickersResponse, Candle, OHLCVResponse, StructureResponse,
    OrderBlockData, FVGData
)

log = get_logger(__name__)
router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/tickers", response_model=TickersResponse)
async def get_tickers():
    """Ambil ticker 24h untuk semua watchlist"""
    symbols = settings.watchlist_list
    raw = await binance_client.fetch_tickers_batch(symbols)
    tickers = [TickerData(**d) for d in raw]
    return TickersResponse(tickers=tickers, timestamp=__import__("datetime").datetime.utcnow())


@router.get("/ticker/{symbol:path}", response_model=TickerData)
async def get_ticker(symbol: str):
    """Ambil ticker satu koin. URL-encoded: BTC%2FUSDT"""
    symbol = unquote(symbol).upper()
    data = await binance_client.fetch_ticker(symbol)
    if data["price"] == 0:
        raise HTTPException(status_code=404, detail=f"Symbol {symbol} tidak ditemukan")
    return TickerData(**data)


@router.get("/ohlcv/{symbol:path}", response_model=OHLCVResponse)
async def get_ohlcv(
    symbol: str,
    timeframe: str = Query("1h", description="1m/5m/15m/30m/1h/4h/1d"),
    limit: int = Query(250, ge=10, le=1000),
):
    """Fetch OHLCV untuk chart. Output dalam format lightweight-charts compatible."""
    symbol = unquote(symbol).upper()
    df = await binance_client.fetch_ohlcv(symbol, timeframe, limit)
    if df.empty:
        raise HTTPException(status_code=404, detail=f"Data tidak ditemukan")

    candles = [
        Candle(
            time=int(ts.timestamp()),
            open=row["open"], high=row["high"], low=row["low"],
            close=row["close"], volume=row["volume"]
        )
        for ts, row in df.iterrows()
    ]
    return OHLCVResponse(symbol=symbol, timeframe=timeframe, candles=candles)


@router.get("/structure/{symbol:path}", response_model=StructureResponse)
async def get_structure(symbol: str):
    """Market structure + OB + FVG + SNR untuk satu koin"""
    symbol = unquote(symbol).upper()

    df_1d = await binance_client.fetch_ohlcv(symbol, "1d", 300)
    df_4h = await binance_client.fetch_ohlcv(symbol, "4h", 250)
    df_1h = await binance_client.fetch_ohlcv(symbol, "1h", 250)

    if df_1h.empty or df_4h.empty:
        raise HTTPException(status_code=500, detail="Data tidak bisa diambil")

    price = float(df_1h["close"].iloc[-1])
    ms_1d = analyze_market_structure(df_1d, lookback=7, recent_candles=90)
    ms_4h = analyze_market_structure(df_4h, lookback=5)
    ms_1h = analyze_market_structure(df_1h, lookback=5)

    obs = detect_order_blocks(df_4h, lookback=80)
    fvgs = detect_fvg(df_4h, lookback=50)
    snr = compute_snr_levels(df_1d, df_4h, df_1h)

    ob_data = [
        OrderBlockData(
            type=o.type, high=o.high, low=o.low, timestamp=o.timestamp,
            is_fresh=o.is_fresh, touch_count=o.touch_count,
            is_mitigated=o.is_mitigated
        ) for o in obs if not o.is_mitigated and o.touch_count <= 5
    ]
    fvg_data = [
        FVGData(type=f.type, top=f.top, bottom=f.bottom,
                timestamp=f.timestamp, filled_pct=f.filled_pct)
        for f in fvgs if f.filled_pct < 80
    ]

    return StructureResponse(
        symbol=symbol, price=price,
        bias_1d=ms_1d.bias, bias_4h=ms_4h.bias, bias_1h=ms_1h.bias,
        order_blocks=ob_data, fvgs=fvg_data, snr=snr,
    )
