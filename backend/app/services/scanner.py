"""
Background Scanner
Setiap N detik:
  1. Fetch ticker untuk semua watchlist → broadcast ke channel "prices"
  2. Analyze SMC untuk semua watchlist → broadcast ke channel "signal:<SYMBOL>"
  3. Compute sentiment + context → broadcast

Berjalan sebagai asyncio background task di FastAPI lifespan.
"""
import asyncio
from datetime import datetime
from sqlalchemy import select, desc

from app.core.config import settings
from app.core.logging import get_logger
from app.services.binance_client import binance_client
from app.services.binance_demo import demo_client
from app.services.smc_engine import analyze_smc
from app.services.sentiment_engine import compute_sentiment
from app.services.market_context import compute_market_context
from app.websocket.manager import manager
from app.db.session import AsyncSessionLocal
from app.models.db_models import Signal as DbSignal

log = get_logger(__name__)


async def scan_live_positions():
    """
    Fetch posisi live + wallet dari Binance Demo.
    Broadcast setiap 3 detik ke channel 'live_positions' dan 'live_wallet'.
    """
    try:
        positions = await demo_client.get_open_positions()
        await manager.broadcast("live_positions", {
            "positions": positions,
            "count": len(positions),
            "timestamp": datetime.utcnow().isoformat(),
        })

        # Broadcast per-symbol channel untuk chart overlay
        for pos in positions:
            sym = pos["symbol"]
            await manager.broadcast(f"live_position:{sym}", {
                "position": pos,
                "timestamp": datetime.utcnow().isoformat(),
            })

        wallet = await demo_client.get_wallet_equity()
        if wallet:
            await manager.broadcast("live_wallet", {
                **wallet,
                "timestamp": datetime.utcnow().isoformat(),
            })
    except Exception as e:
        log.debug(f"scan_live_positions error: {e}")


async def scan_prices():
    """Fetch dan broadcast harga terbaru untuk semua watchlist"""
    try:
        symbols = settings.watchlist_list
        tickers = await binance_client.fetch_tickers_batch(symbols)
        await manager.broadcast("prices", {
            "tickers": tickers,
            "timestamp": datetime.utcnow().isoformat(),
        })
    except Exception as e:
        log.error(f"scan_prices error: {e}")


async def scan_signals():
    """Analisis SMC full untuk semua watchlist, broadcast + save ke DB jika score tinggi"""
    for symbol in settings.watchlist_list:
        try:
            df_1d = await binance_client.fetch_ohlcv(symbol, "1d", 300)
            df_4h = await binance_client.fetch_ohlcv(symbol, "4h", 250)
            df_1h = await binance_client.fetch_ohlcv(symbol, "1h", 250)
            df_15m = await binance_client.fetch_ohlcv(symbol, "15m", 100)

            if df_4h.empty or df_1h.empty:
                continue

            # Signal
            setup = analyze_smc(df_1d, df_4h, df_1h, symbol)

            signal_payload = {
                "symbol": setup.symbol,
                "direction": setup.direction,
                "score": setup.score,
                "entry": setup.entry,
                "stop_loss": setup.sl,
                "tp1": setup.tp1, "tp2": setup.tp2, "tp3": setup.tp3,
                "rr2": setup.rr2,
                "bias_1d": setup.bias_1d,
                "bias_4h": setup.bias_4h,
                "bias_1h": setup.bias_1h,
                "explanation": setup.explanation,
                "score_breakdown": setup.score_breakdown,
                "needs_confirmation": setup.needs_confirmation,
                "ob": None if not setup.ob else {
                    "type": setup.ob.type,
                    "high": setup.ob.high, "low": setup.ob.low,
                    "timestamp": setup.ob.timestamp,
                    "is_fresh": setup.ob.is_fresh,
                    "touch_count": setup.ob.touch_count,
                    "is_mitigated": setup.ob.is_mitigated,
                },
                "fvg": None if not setup.fvg else {
                    "type": setup.fvg.type,
                    "top": setup.fvg.top, "bottom": setup.fvg.bottom,
                    "timestamp": setup.fvg.timestamp,
                    "filled_pct": setup.fvg.filled_pct,
                },
                "timestamp": datetime.utcnow().isoformat(),
            }

            # Broadcast ke channel signal:<SYMBOL>
            await manager.broadcast(f"signal:{symbol}", signal_payload)
            await manager.broadcast("signals", signal_payload)  # channel umum

            # Save ke DB jika score cukup
            if setup.direction != "WAIT" and setup.score >= settings.min_score_to_emit:
                async with AsyncSessionLocal() as db:
                    # Cek apakah sudah ada sinyal serupa dalam 1 jam terakhir
                    recent = await db.execute(
                        select(DbSignal).where(DbSignal.symbol == symbol)
                        .order_by(desc(DbSignal.created_at)).limit(1)
                    )
                    last = recent.scalar_one_or_none()
                    should_save = True
                    if last:
                        age = (datetime.utcnow() - last.created_at.replace(tzinfo=None)).total_seconds()
                        if age < 3600 and last.direction == setup.direction:
                            should_save = False

                    if should_save:
                        db.add(DbSignal(
                            symbol=symbol, timeframe="4h",
                            direction=setup.direction, score=setup.score,
                            entry=setup.entry, stop_loss=setup.sl,
                            tp1=setup.tp1, tp2=setup.tp2, tp3=setup.tp3,
                            bias_1d=setup.bias_1d, bias_4h=setup.bias_4h, bias_1h=setup.bias_1h,
                            ob_high=setup.ob.high if setup.ob else None,
                            ob_low=setup.ob.low if setup.ob else None,
                            ob_type=setup.ob.type if setup.ob else None,
                            ob_touches=setup.ob.touch_count if setup.ob else 0,
                            has_fvg=bool(setup.fvg),
                            explanation=setup.explanation,
                            meta=setup.score_breakdown,
                        ))
                        await db.commit()
                        log.info(f"  Signal saved: {symbol} {setup.direction} score={setup.score}")

            # Sentiment
            sent = compute_sentiment(df_1d, df_4h, df_1h, df_15m)
            await manager.broadcast(f"sentiment:{symbol}", {
                "symbol": symbol, **sent,
                "timestamp": datetime.utcnow().isoformat(),
            })

            # Market context
            ctx = compute_market_context(df_15m, df_1h, df_4h)
            if ctx:
                await manager.broadcast(f"context:{symbol}", {
                    "symbol": symbol, **ctx,
                    "timestamp": datetime.utcnow().isoformat(),
                })

        except Exception as e:
            log.error(f"scan_signals {symbol}: {e}")


async def scanner_loop():
    """Main background loop"""
    log.info(f"Scanner started — interval {settings.scan_interval_seconds}s, "
             f"watchlist {settings.watchlist_list}")
    await asyncio.sleep(3)

    price_counter = 0
    pos_counter   = 0
    while True:
        try:
            # Price: setiap iterasi
            await scan_prices()

            # Live positions: setiap 3 detik (pos_counter * sleep interval)
            pos_counter += 1
            if pos_counter >= 3:
                await scan_live_positions()
                pos_counter = 0

            # Signals: setiap 5 iterasi (lebih berat)
            if price_counter % 5 == 0:
                await scan_signals()

            price_counter += 1
            await asyncio.sleep(1)   # 1 detik base interval
        except asyncio.CancelledError:
            log.info("Scanner stopped")
            break
        except Exception as e:
            log.error(f"Scanner loop error: {e}")
            await asyncio.sleep(10)
