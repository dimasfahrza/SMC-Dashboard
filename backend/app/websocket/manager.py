"""
WebSocket Connection Manager
Mengelola semua koneksi client dan broadcast update real-time.

Channel types:
  - price:<SYMBOL>    — price updates
  - signal:<SYMBOL>   — signal updates
  - position:<SYMBOL> — position updates
  - journal          — journal updates
  - global           — broadcast ke semua client
"""
from fastapi import WebSocket
from typing import Dict, Set, Any
import json
import asyncio
from app.core.logging import get_logger

log = get_logger(__name__)


class ConnectionManager:
    def __init__(self):
        # client_id -> (websocket, set of subscribed channels)
        self._connections: Dict[str, tuple[WebSocket, Set[str]]] = {}
        self._lock = asyncio.Lock()
        self._next_id = 0

    async def connect(self, websocket: WebSocket) -> str:
        await websocket.accept()
        async with self._lock:
            self._next_id += 1
            client_id = f"c{self._next_id}"
            self._connections[client_id] = (websocket, set())
        log.info(f"WS connected: {client_id} (total: {len(self._connections)})")
        return client_id

    async def disconnect(self, client_id: str):
        async with self._lock:
            self._connections.pop(client_id, None)
        log.info(f"WS disconnected: {client_id} (total: {len(self._connections)})")

    async def subscribe(self, client_id: str, channel: str):
        async with self._lock:
            if client_id in self._connections:
                _, channels = self._connections[client_id]
                channels.add(channel)
                log.debug(f"WS {client_id} subscribed to {channel}")

    async def unsubscribe(self, client_id: str, channel: str):
        async with self._lock:
            if client_id in self._connections:
                _, channels = self._connections[client_id]
                channels.discard(channel)

    async def broadcast(self, channel: str, data: Any):
        """Broadcast message ke semua client yang subscribe ke channel"""
        message = json.dumps({"channel": channel, "data": data}, default=str)
        dead = []

        async with self._lock:
            targets = [
                (cid, ws) for cid, (ws, chans) in self._connections.items()
                if channel in chans or channel == "global"
            ]

        for cid, ws in targets:
            try:
                await ws.send_text(message)
            except Exception as e:
                log.warning(f"WS send failed to {cid}: {e}")
                dead.append(cid)

        for cid in dead:
            await self.disconnect(cid)

    async def send_to_client(self, client_id: str, data: Any):
        async with self._lock:
            entry = self._connections.get(client_id)
        if entry:
            ws, _ = entry
            try:
                await ws.send_text(json.dumps(data, default=str))
            except Exception:
                await self.disconnect(client_id)

    @property
    def connection_count(self) -> int:
        return len(self._connections)


manager = ConnectionManager()
