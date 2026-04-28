/**
 * OrderBook Live Component
 *
 * Data dari Binance WebSocket public (tidak butuh API key):
 *   wss://stream.binance.com:9443/ws/<symbol>@depth20@100ms
 *
 * Tampilan:
 *   - 12 level ask (merah) di atas
 *   - Spread + mid price di tengah
 *   - 12 level bid (hijau) di bawah
 *   - Bar horizontal menunjukkan volume relatif
 *   - Imbalance indicator (bias beli vs jual)
 *   - Highlight order besar (>2x rata-rata)
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useApp } from '../../contexts/AppContext'
import { fp, coin } from '../../utils/format'

const LEVELS      = 12    // jumlah level yang ditampilkan
const WS_BASE     = 'wss://stream.binance.com:9443/ws'
const RECONNECT_MS = 3000

function formatVol(v) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M'
  if (v >= 1_000)     return (v / 1_000).toFixed(1) + 'K'
  return v.toFixed(2)
}

function formatPrice(p, ref) {
  if (!ref) return fp(p)
  // Gunakan desimal yang sama dengan harga referensi
  const d = ref < 1 ? 6 : ref < 10 ? 4 : ref < 1000 ? 2 : 1
  return p.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export default function OrderBook() {
  const { symbol } = useApp()
  const [bids, setBids]         = useState([])   // [[price, qty], ...]
  const [asks, setAsks]         = useState([])
  const [connected, setConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)
  const wsRef   = useRef(null)
  const timerRef = useRef(null)

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
    }

    const sym = symbol.replace('/', '').toLowerCase()
    const url = `${WS_BASE}/${sym}@depth20@100ms`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
    }

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        // Binance depth20: { bids: [[price, qty]], asks: [[price, qty]] }
        const newBids = (data.bids || [])
          .slice(0, LEVELS)
          .map(([p, q]) => [parseFloat(p), parseFloat(q)])
          .filter(([p, q]) => q > 0)

        const newAsks = (data.asks || [])
          .slice(0, LEVELS)
          .map(([p, q]) => [parseFloat(p), parseFloat(q)])
          .filter(([p, q]) => q > 0)
          .reverse()   // asks ditampilkan terbalik (tinggi di atas)

        setBids(newBids)
        setAsks(newAsks)
        setLastUpdate(Date.now())
      } catch {}
    }

    ws.onerror = () => {
      setConnected(false)
    }

    ws.onclose = () => {
      setConnected(false)
      // Auto reconnect
      timerRef.current = setTimeout(connect, RECONNECT_MS)
    }
  }, [symbol])

  // Connect/reconnect saat simbol ganti
  useEffect(() => {
    connect()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
      }
    }
  }, [connect])

  // Hitung stats
  const totalBidVol = bids.reduce((s, [, q]) => s + q, 0)
  const totalAskVol = asks.reduce((s, [, q]) => s + q, 0)
  const totalVol    = totalBidVol + totalAskVol
  const bidPct      = totalVol > 0 ? (totalBidVol / totalVol * 100) : 50
  const askPct      = 100 - bidPct
  const imbalance   = bidPct - 50   // positif = lebih banyak bid

  // Max volume untuk bar width
  const allVols  = [...bids, ...asks].map(([, q]) => q)
  const maxVol   = allVols.length ? Math.max(...allVols) : 1
  const avgVol   = allVols.length ? allVols.reduce((a, b) => a + b, 0) / allVols.length : 0

  // Mid price dan spread
  const bestBid  = bids[0]?.[0] || 0
  const bestAsk  = asks[asks.length - 1]?.[0] || 0
  const midPrice = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : 0
  const spread   = bestAsk && bestBid ? bestAsk - bestBid : 0
  const spreadPct = midPrice > 0 ? (spread / midPrice * 100) : 0

  return (
    <div className="flex flex-col h-full bg-panel">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.07] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-t1">Order Book</span>
          <span className="text-[10px] text-t3">{coin(symbol)}</span>
        </div>
        <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green pulse-dot' : 'bg-red'}`} />
      </div>

      {/* Column headers */}
      <div className="flex items-center justify-between px-3 py-1.5 shrink-0">
        <span className="text-[10px] text-t3 uppercase tracking-wide">Price</span>
        <span className="text-[10px] text-t3 uppercase tracking-wide">Amount</span>
        <span className="text-[10px] text-t3 uppercase tracking-wide">Total</span>
      </div>

      {/* Asks (sell orders) — merah, tinggi di atas */}
      <div className="flex flex-col px-1 shrink-0">
        {asks.map(([price, qty], i) => {
          const cumVol  = asks.slice(i).reduce((s, [, q]) => s + q, 0)
          const barW    = Math.min((qty / maxVol) * 100, 100)
          const isLarge = qty > avgVol * 2.5
          return (
            <OrderRow
              key={`ask-${i}`}
              price={price}
              qty={qty}
              cumVol={cumVol}
              barW={barW}
              side="ask"
              isLarge={isLarge}
              ref_price={midPrice}
            />
          )
        })}
      </div>

      {/* Spread / mid price */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-elev/60 border-y border-white/[0.07] shrink-0">
        <span className="text-xs font-bold mono text-t1">
          {midPrice > 0 ? formatPrice(midPrice, midPrice) : '—'}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-t3">Spread</span>
          <span className="text-[10px] mono text-yellow">
            {spread > 0 ? formatPrice(spread, midPrice) : '—'}
          </span>
          <span className="text-[10px] text-t3">
            ({spreadPct.toFixed(3)}%)
          </span>
        </div>
      </div>

      {/* Bids (buy orders) — hijau, tinggi di atas */}
      <div className="flex flex-col px-1 overflow-y-auto flex-1">
        {bids.map(([price, qty], i) => {
          const cumVol  = bids.slice(0, i + 1).reduce((s, [, q]) => s + q, 0)
          const barW    = Math.min((qty / maxVol) * 100, 100)
          const isLarge = qty > avgVol * 2.5
          return (
            <OrderRow
              key={`bid-${i}`}
              price={price}
              qty={qty}
              cumVol={cumVol}
              barW={barW}
              side="bid"
              isLarge={isLarge}
              ref_price={midPrice}
            />
          )
        })}
      </div>

      {/* Imbalance bar */}
      <div className="px-3 py-2 border-t border-white/[0.07] shrink-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-green font-medium">{bidPct.toFixed(1)}%</span>
          <span className="text-[10px] text-t3">
            {Math.abs(imbalance) > 5
              ? (imbalance > 0 ? '▲ Buy pressure' : '▼ Sell pressure')
              : '≈ Balanced'}
          </span>
          <span className="text-[10px] text-red font-medium">{askPct.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-base overflow-hidden flex">
          <div
            className="h-full bg-green transition-all duration-300"
            style={{ width: `${bidPct}%` }}
          />
          <div
            className="h-full bg-red transition-all duration-300"
            style={{ width: `${askPct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-t3 mono">
          <span>{formatVol(totalBidVol)}</span>
          <span>{formatVol(totalAskVol)}</span>
        </div>
      </div>
    </div>
  )
}

function OrderRow({ price, qty, cumVol, barW, side, isLarge, ref_price }) {
  const isAsk = side === 'ask'
  const color = isAsk ? 'text-red' : 'text-green'
  const barColor = isAsk ? 'rgba(232,69,90,0.15)' : 'rgba(34,201,131,0.15)'
  const barColorLarge = isAsk ? 'rgba(232,69,90,0.35)' : 'rgba(34,201,131,0.35)'

  return (
    <div className="relative flex items-center justify-between px-2 py-[2px] hover:bg-white/[0.03] rounded">
      {/* Background bar */}
      <div
        className="absolute inset-y-0 right-0 rounded transition-all duration-100"
        style={{
          width: `${barW}%`,
          background: isLarge ? barColorLarge : barColor,
        }}
      />
      <span className={`relative text-[11px] mono font-medium z-10 ${color} ${isLarge ? 'font-bold' : ''}`}>
        {formatPrice(price, ref_price)}
        {isLarge && <span className="ml-1 text-[9px] opacity-70">●</span>}
      </span>
      <span className="relative text-[11px] mono text-t2 z-10">
        {formatVol(qty)}
      </span>
      <span className="relative text-[10px] mono text-t3 z-10">
        {formatVol(cumVol)}
      </span>
    </div>
  )
}
