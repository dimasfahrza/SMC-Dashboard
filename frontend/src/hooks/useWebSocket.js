import { useEffect, useState, useRef } from 'react'
import { wsClient } from '../services/websocket'

/**
 * Hook untuk WebSocket connection status
 */
export function useWSConnection() {
  const [connected, setConnected] = useState(wsClient.connected)

  useEffect(() => {
    wsClient.onConnectionChange = setConnected
    if (!wsClient.connected) wsClient.connect()
    return () => { wsClient.onConnectionChange = null }
  }, [])

  return connected
}

/**
 * Hook subscribe ke channel dan return data terakhir
 */
export function useWSChannel(channel, initial = null) {
  const [data, setData] = useState(initial)
  const subscribedRef = useRef(false)

  useEffect(() => {
    if (!channel) return

    if (!subscribedRef.current) {
      wsClient.subscribe(channel)
      subscribedRef.current = true
    }

    const off = wsClient.on(channel, (payload) => setData(payload))

    return () => {
      off()
      wsClient.unsubscribe(channel)
      subscribedRef.current = false
    }
  }, [channel])

  return data
}
