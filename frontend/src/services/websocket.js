/**
 * WebSocket Client
 *
 * Features:
 *   - Auto-reconnect dengan exponential backoff
 *   - Channel subscription management
 *   - Event-based listener (.on / .off)
 *   - Ping/pong keepalive
 */

const WS_URL = import.meta.env.VITE_WS_URL ||
  (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'

class WSClient {
  constructor() {
    this.ws = null
    this.listeners = new Map()        // event -> Set<callback>
    this.subscribedChannels = new Set()
    this.reconnectAttempts = 0
    this.maxReconnect = 10
    this.reconnectTimer = null
    this.pingTimer = null
    this.connected = false
    this.onConnectionChange = null
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return

    try {
      this.ws = new WebSocket(WS_URL)
    } catch (e) {
      console.error('WS connect failed:', e)
      this._scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      console.log('[WS] Connected')
      this.connected = true
      this.reconnectAttempts = 0
      this.onConnectionChange?.(true)

      // Re-subscribe semua channel yang sebelumnya aktif
      this.subscribedChannels.forEach(ch => this._send({ action: 'subscribe', channel: ch }))

      // Start ping
      this.pingTimer = setInterval(() => this._send({ action: 'ping' }), 25000)
    }

    this.ws.onmessage = (event) => {
      let msg
      try { msg = JSON.parse(event.data) } catch { return }

      // Channel broadcast
      if (msg.channel && msg.data !== undefined) {
        this._emit(msg.channel, msg.data)
        this._emit('*', { channel: msg.channel, data: msg.data })
      }
      // Direct message (connected, subscribed, pong, error)
      if (msg.type) {
        this._emit(msg.type, msg)
      }
    }

    this.ws.onclose = () => {
      console.log('[WS] Disconnected')
      this.connected = false
      this.onConnectionChange?.(false)
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null }
      this._scheduleReconnect()
    }

    this.ws.onerror = (e) => {
      console.warn('[WS] Error', e)
    }
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return
    if (this.reconnectAttempts >= this.maxReconnect) {
      console.error('[WS] Max reconnect reached')
      return
    }
    const delay = Math.min(30000, 1000 * Math.pow(2, this.reconnectAttempts))
    this.reconnectAttempts++
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  _send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj))
      return true
    }
    return false
  }

  subscribe(channel) {
    this.subscribedChannels.add(channel)
    this._send({ action: 'subscribe', channel })
  }

  unsubscribe(channel) {
    this.subscribedChannels.delete(channel)
    this._send({ action: 'unsubscribe', channel })
  }

  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event).add(callback)
    return () => this.off(event, callback)
  }

  off(event, callback) {
    this.listeners.get(event)?.delete(callback)
  }

  _emit(event, data) {
    this.listeners.get(event)?.forEach(cb => {
      try { cb(data) } catch (e) { console.error('WS listener error:', e) }
    })
  }

  disconnect() {
    if (this.pingTimer) clearInterval(this.pingTimer)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
  }
}

// Singleton
export const wsClient = new WSClient()
