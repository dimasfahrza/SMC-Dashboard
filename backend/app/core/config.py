"""
Configuration loader menggunakan pydantic-settings
Semua env variable dimuat dari .env dan divalidasi
"""
from pydantic_settings import BaseSettings
from pydantic import Field
from typing import List
import os


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://smc_user:smc_password@localhost:5432/smc_dashboard"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # Binance public API (untuk market data — tidak perlu key)
    binance_api_key: str = ""
    binance_api_secret: str = ""
    binance_testnet: bool = False

    # Binance Demo Futures (untuk live positions + wallet)
    # Sama dengan API key yang dipakai bot Telegram
    binance_demo_api_key: str = ""
    binance_demo_api_secret: str = ""

    # Scan
    scan_interval_seconds: int = 60
    watchlist: str = "BTC/USDT,ETH/USDT,SOL/USDT,BNB/USDT,XRP/USDT"

    # Trading Economics (opsional — untuk economic calendar)
    te_api_key: str = ""

    # SMC
    min_score_to_emit: int = 40
    max_ob_touches: int = 3
    ob_sl_buffer_atr: float = 0.3

    class Config:
        env_file = ".env"
        case_sensitive = False

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def watchlist_list(self) -> List[str]:
        return [s.strip() for s in self.watchlist.split(",") if s.strip()]


settings = Settings()
