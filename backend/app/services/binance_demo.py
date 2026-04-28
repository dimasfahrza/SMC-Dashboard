"""
Binance Demo (Testnet) Client
Fetch posisi live dan wallet equity dari demo-fapi.binance.com
Sama persis dengan yang dipakai bot Telegram.

Membutuhkan API key Binance Demo — diambil dari .env dashboard.
"""
import hmac
import hashlib
import time
import httpx
from typing import List, Dict, Optional
from app.core.config import settings
from app.core.logging import get_logger

log = get_logger(__name__)

DEMO_BASE = "https://demo-fapi.binance.com"


def _sign(secret: str, query: str) -> str:
    return hmac.new(
        secret.encode("utf-8"),
        query.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()


def _build_query(params: dict) -> str:
    return "&".join(f"{k}={v}" for k, v in params.items())


class BinanceDemoClient:
    """Client untuk Binance Demo Futures — butuh API key"""

    def __init__(self):
        self._client = httpx.AsyncClient(timeout=8.0, base_url=DEMO_BASE)

    async def close(self):
        await self._client.aclose()

    def _has_keys(self) -> bool:
        return bool(
            getattr(settings, "binance_demo_api_key", "") and
            getattr(settings, "binance_demo_api_secret", "")
        )

    async def _get(self, path: str, params: dict = None) -> Optional[dict | list]:
        if not self._has_keys():
            return None
        params = params or {}
        params["timestamp"] = int(time.time() * 1000)
        qs = _build_query(params)
        sig = _sign(settings.binance_demo_api_secret, qs)
        qs += f"&signature={sig}"
        try:
            r = await self._client.get(
                f"{path}?{qs}",
                headers={
                    "X-MBX-APIKEY": settings.binance_demo_api_key,
                    "Content-Type": "application/json",
                }
            )
            r.raise_for_status()
            return r.json()
        except Exception as e:
            log.debug(f"BinanceDemo {path}: {e}")
            return None

    async def get_open_positions(self) -> List[Dict]:
        """
        Ambil semua posisi terbuka dari Binance Demo.
        Return list of position dicts, sudah di-filter yang non-zero.
        """
        data = await self._get("/fapi/v2/positionRisk")
        if not data:
            return []

        positions = []
        for p in data:
            # Binance kadang return string "0" bukan float 0
            try:
                amt = float(p.get("positionAmt", 0) or 0)
            except (ValueError, TypeError):
                amt = 0
            if amt == 0:
                continue

            try:
                entry    = float(p.get("entryPrice",        0) or 0)
                mark     = float(p.get("markPrice",         0) or 0)
                unreal   = float(p.get("unRealizedProfit",  0) or 0)
                liq      = float(p.get("liquidationPrice",  0) or 0)
                leverage = int(float(p.get("leverage",      1) or 1))
                notional = abs(float(p.get("notional",      0) or 0))
            except (ValueError, TypeError):
                continue

            margin = notional / leverage if leverage > 0 else 0
            side   = "LONG" if amt > 0 else "SHORT"

            # Hitung PnL %
            if entry > 0:
                pnl_pct = ((mark - entry) / entry * 100) * (1 if side == "LONG" else -1) * leverage
            else:
                pnl_pct = 0

            # Format simbol: XRPUSDT → XRP/USDT
            # Binance Demo pakai format XRPUSDT (bukan XRPPERP)
            sym_raw = p.get("symbol", "")
            if "USDT" in sym_raw:
                base   = sym_raw.replace("USDT", "")
                symbol = f"{base}/USDT"
            else:
                symbol = sym_raw

            positions.append({
                "symbol":      symbol,
                "symbol_raw":  sym_raw,
                "side":        side,
                "size":        abs(amt),
                "entry_price": round(entry, 8),
                "mark_price":  round(mark,  8),
                "unreal_pnl":  round(unreal, 4),
                "pnl_pct":     round(pnl_pct, 2),
                "liquidation": round(liq, 8),
                "leverage":    leverage,
                "margin":      round(margin, 2),
                "notional":    round(notional, 2),
            })

        return positions

    async def get_wallet_equity(self) -> Dict:
        """
        Ambil wallet balance dari Binance Demo.
        Return dict: balance, unrealized_pnl, available_margin, equity
        """
        data = await self._get("/fapi/v2/account")
        if not data:
            return {}

        total_wallet  = float(data.get("totalWalletBalance", 0))
        total_unreal  = float(data.get("totalUnrealizedProfit", 0))
        total_equity  = float(data.get("totalMarginBalance", 0))
        avail_balance = float(data.get("availableBalance", 0))
        total_margin  = float(data.get("totalInitialMargin", 0))

        return {
            "wallet_balance":  round(total_wallet, 2),
            "unrealized_pnl":  round(total_unreal, 4),
            "equity":          round(total_equity, 2),
            "available":       round(avail_balance, 2),
            "used_margin":     round(total_margin, 2),
            "margin_ratio":    round(total_margin / total_equity * 100, 2) if total_equity > 0 else 0,
        }

    async def get_position_for_symbol(self, symbol: str) -> Optional[Dict]:
        """
        Ambil posisi untuk simbol tertentu.
        symbol: "XRP/USDT" atau "XRPUSDT"
        """
        # Normalisasi ke dua format
        sym_slash = symbol.upper()                          # XRP/USDT
        sym_raw   = symbol.upper().replace("/", "")        # XRPUSDT
        # Handle jika input sudah tanpa slash: XRPUSDT → XRP/USDT
        if "/" not in sym_slash and "USDT" in sym_slash:
            base      = sym_slash.replace("USDT", "")
            sym_slash = f"{base}/USDT"

        positions = await self.get_open_positions()
        for p in positions:
            # Coba match dengan berbagai format
            if (p["symbol_raw"] == sym_raw or
                p["symbol"]     == sym_slash or
                p["symbol_raw"] == sym_slash.replace("/", "")):
                return p
        return None


# Singleton
demo_client = BinanceDemoClient()
