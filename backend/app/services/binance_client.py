"""
Binance Futures client — async version menggunakan httpx
Fetch OHLCV data untuk multiple timeframes, harga ticker, 24h stats
"""
import httpx
import pandas as pd
import time
from typing import List, Dict, Optional
from app.core.logging import get_logger

log = get_logger(__name__)

BASE_URL = "https://fapi.binance.com"


class BinanceClient:
    """Binance Futures public API client (tidak perlu API key untuk market data)"""

    def __init__(self):
        self._client = httpx.AsyncClient(timeout=10.0, base_url=BASE_URL)
        self._cache: Dict[str, tuple] = {}   # {cache_key: (timestamp, data)}

    async def close(self):
        await self._client.aclose()

    @staticmethod
    def _raw_symbol(symbol: str) -> str:
        """BTC/USDT → BTCUSDT"""
        return symbol.replace("/", "").upper()

    async def fetch_ohlcv(self, symbol: str, timeframe: str, limit: int = 250) -> pd.DataFrame:
        """
        Fetch OHLCV candles.
        Returns DataFrame dengan kolom: open, high, low, close, volume
        dan index berupa UTC datetime.
        """
        sym = self._raw_symbol(symbol)
        cache_key = f"ohlcv:{sym}:{timeframe}:{limit}"

        # Cache 5 detik — cukup untuk rate limit, tidak terlalu stale
        if cache_key in self._cache:
            ts, cached = self._cache[cache_key]
            if time.time() - ts < 5:
                return cached

        try:
            r = await self._client.get("/fapi/v1/klines", params={
                "symbol": sym,
                "interval": timeframe,
                "limit": limit,
            })
            r.raise_for_status()
            raw = r.json()
        except Exception as e:
            log.error(f"Fetch OHLCV {symbol} {timeframe} gagal: {e}")
            return pd.DataFrame()

        df = pd.DataFrame(raw, columns=[
            "timestamp", "open", "high", "low", "close", "volume",
            "close_time", "quote_volume", "trades",
            "taker_buy_base", "taker_buy_quote", "ignore"
        ])
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
        df.set_index("timestamp", inplace=True)
        for col in ["open", "high", "low", "close", "volume"]:
            df[col] = df[col].astype(float)
        df = df[["open", "high", "low", "close", "volume"]]

        self._cache[cache_key] = (time.time(), df)
        return df

    async def fetch_ticker(self, symbol: str) -> Dict:
        """Fetch ticker 24h: price, change%, volume, high, low"""
        sym = self._raw_symbol(symbol)
        try:
            r = await self._client.get("/fapi/v1/ticker/24hr", params={"symbol": sym})
            r.raise_for_status()
            d = r.json()
            return {
                "symbol"       : symbol,
                "price"        : float(d.get("lastPrice", 0)),
                "change_pct"   : float(d.get("priceChangePercent", 0)),
                "change_abs"   : float(d.get("priceChange", 0)),
                "high_24h"     : float(d.get("highPrice", 0)),
                "low_24h"      : float(d.get("lowPrice", 0)),
                "volume"       : float(d.get("volume", 0)),
                "quote_volume" : float(d.get("quoteVolume", 0)),
            }
        except Exception as e:
            log.error(f"Fetch ticker {symbol} gagal: {e}")
            return {"symbol": symbol, "price": 0, "change_pct": 0}

    async def fetch_tickers_batch(self, symbols: List[str]) -> List[Dict]:
        """Fetch ticker untuk multiple symbols secara paralel"""
        import asyncio
        tasks = [self.fetch_ticker(s) for s in symbols]
        return await asyncio.gather(*tasks)


# Singleton instance
binance_client = BinanceClient()
