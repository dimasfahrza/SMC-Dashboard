"""
FastAPI Main Application
Mount semua routes + start background scanner pada startup
"""
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import setup_logging, get_logger
from app.db.session import init_db
from app.api.market import router as market_router
from app.api.analysis import router as analysis_router
from app.api.trading import router as trading_router
from app.api.journal import router as journal_router
from app.api.analytics import router as analytics_router
from app.api.calendar import router as calendar_router
from app.api.live import router as live_router
from app.websocket.routes import router as ws_router
from app.services.binance_client import binance_client
from app.services.scanner import scanner_loop

setup_logging()
log = get_logger(__name__)

_scanner_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    log.info("Starting SMC Dashboard backend")
    log.info(f"  Host: {settings.host}:{settings.port}")
    log.info(f"  Watchlist: {settings.watchlist_list}")
    log.info(f"  Scan interval: {settings.scan_interval_seconds}s")

    # Init database
    try:
        await init_db()
    except Exception as e:
        log.warning(f"DB init failed (maybe already initialized): {e}")

    # Start background scanner
    global _scanner_task
    _scanner_task = asyncio.create_task(scanner_loop())

    yield

    # Shutdown
    log.info("Shutting down")
    if _scanner_task:
        _scanner_task.cancel()
        try:
            await _scanner_task
        except asyncio.CancelledError:
            pass
    await binance_client.close()


app = FastAPI(
    title="SMC Trading Dashboard API",
    version="1.0.0",
    description="Real-time SMC trading dashboard with AI sentiment & signal engine",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(market_router)
app.include_router(analysis_router)
app.include_router(trading_router)
app.include_router(journal_router)
app.include_router(analytics_router)
app.include_router(calendar_router)
app.include_router(live_router)
app.include_router(ws_router)


@app.get("/")
async def root():
    return {
        "service": "SMC Trading Dashboard",
        "version": "1.0.0",
        "status": "ok",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "scanner_running": _scanner_task is not None and not _scanner_task.done(),
    }
