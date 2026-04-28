"""
WebSocket Endpoint
Client flow:
  1. Connect to ws://host/ws
  2. Server kirim pesan "connected" dengan client_id
  3. Client kirim {action: "subscribe", channel: "prices"} dst.
  4. Server broadcast update ke channel yang disubscribe

Supported channels:
  - prices                — live tickers untuk semua watchlist
  - signals               — semua signal updates
  - signal:<SYMBOL>       — signal specific
  - sentiment:<SYMBOL>    — sentiment specific
  - context:<SYMBOL>      — market context specific
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
from app.websocket.manager import manager
from app.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    client_id = await manager.connect(websocket)

    try:
        # Welcome message
        await websocket.send_text(json.dumps({
            "type": "connected",
            "client_id": client_id,
            "channels_available": [
                "prices", "signals",
                "signal:<SYMBOL>", "sentiment:<SYMBOL>", "context:<SYMBOL>",
            ],
        }))

        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"error": "Invalid JSON"}))
                continue

            action = msg.get("action")
            channel = msg.get("channel", "")

            if action == "subscribe" and channel:
                await manager.subscribe(client_id, channel)
                await websocket.send_text(json.dumps({
                    "type": "subscribed", "channel": channel
                }))

            elif action == "unsubscribe" and channel:
                await manager.unsubscribe(client_id, channel)
                await websocket.send_text(json.dumps({
                    "type": "unsubscribed", "channel": channel
                }))

            elif action == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

            else:
                await websocket.send_text(json.dumps({
                    "error": f"Unknown action: {action}"
                }))

    except WebSocketDisconnect:
        await manager.disconnect(client_id)
    except Exception as e:
        log.error(f"WS error {client_id}: {e}")
        await manager.disconnect(client_id)
