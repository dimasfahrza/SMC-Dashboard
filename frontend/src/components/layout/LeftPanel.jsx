import { useEffect, useState, useRef } from 'react'
import { useApp } from '../../contexts/AppContext'
import { useWSChannel } from '../../hooks/useWebSocket'
import { api } from '../../services/api'
import { fp, pct, coin, ccolor } from '../../utils/format'
import { SectionTitle, Skeleton } from '../ui/index'
import OrderBook from '../orderbook/OrderBook'

const SYMBOLS = ['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT','XRP/USDT']

// ── Watchlist ─────────────────────────────────────────
function Watchlist() {
  const { symbol, setSymbol } = useApp()
  const [tickers, setTickers] = useState([])
  const live = useWSChannel('prices')
  const prev = useRef({})

  useEffect(() => {
    api.getTickers().then(d => setTickers(d.tickers || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (live?.tickers) setTickers(live.tickers)
  }, [live])

  return (
    <div className="p-4 border-b border-white/[0.07]">
      <SectionTitle>Watchlist</SectionTitle>
      <div className="space-y-0.5">
        {tickers.length === 0 && SYMBOLS.map(s => (
          <div key={s} className="flex items-center justify-between px-2 py-2">
            <Skeleton w="w-12" h="h-3" />
            <Skeleton w="w-20" h="h-3" />
          </div>
        ))}
        {tickers.map(t => {
          const active = t.symbol === symbol
          const up = t.change_pct >= 0
          const prevP = prev.current[t.symbol]
          const flash = prevP != null
            ? t.price > prevP ? 'price-up' : t.price < prevP ? 'price-down' : ''
            : ''
          prev.current[t.symbol] = t.price
          return (
            <button key={t.symbol} onClick={() => setSymbol(t.symbol)}
              className={`w-full flex items-center justify-between px-2 py-2 rounded-lg text-xs
                transition-colors ${active ? 'bg-elev' : 'hover:bg-elev/60'}`}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: ccolor(t.symbol) }} />
                <span className={`font-medium ${active ? 'text-t1' : 'text-t2'}`}>{coin(t.symbol)}</span>
              </div>
              <div className="text-right">
                <div className={`mono font-medium ${flash} ${active ? 'text-t1' : 'text-t2'}`}>{fp(t.price)}</div>
                <div className={`text-[10px] mono ${up ? 'text-green' : 'text-red'}`}>{pct(t.change_pct)}</div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── AI Sentiment ──────────────────────────────────────
function Sentiment() {
  const { symbol } = useApp()
  const [data, setData] = useState(null)
  const live = useWSChannel(`sentiment:${symbol}`)

  useEffect(() => {
    let ok = true
    api.getSentiment(symbol).then(d => { if (ok) setData(d) }).catch(() => {})
    return () => { ok = false }
  }, [symbol])

  const s = live || data
  const label = s?.label || 'NEUTRAL'
  const bull = s?.bull_pct ?? 0
  const bear = s?.bear_pct ?? 0
  const neut = s?.neut_pct ?? 100
  const lcolor = label === 'BULLISH' ? 'text-green' : label === 'BEARISH' ? 'text-red' : 'text-yellow'

  return (
    <div className="p-4 border-b border-white/[0.07]">
      <SectionTitle>AI Sentiment</SectionTitle>
      <div className="flex items-center gap-3 mb-3">
        <div className={`text-xl font-bold ${lcolor}`}>{label}</div>
        <div className="flex-1 text-right text-xs text-t3">{coin(symbol)}</div>
      </div>
      {[
        { label: 'Bullish', pct: bull, color: 'bg-green' },
        { label: 'Bearish', pct: bear, color: 'bg-red'   },
        { label: 'Neutral', pct: neut, color: 'bg-t3'    },
      ].map(r => (
        <div key={r.label} className="flex items-center gap-2 mb-1.5">
          <span className="text-[11px] text-t3 w-12">{r.label}</span>
          <div className="flex-1 h-1 bg-elev rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${r.color}`}
                 style={{ width: `${r.pct}%` }} />
          </div>
          <span className="text-[11px] mono text-t2 w-8 text-right">{r.pct}%</span>
        </div>
      ))}
    </div>
  )
}

// ── Key Levels (SNR) ──────────────────────────────────
function KeyLevels() {
  const { symbol } = useApp()
  const [data, setData] = useState(null)

  useEffect(() => {
    let ok = true
    api.getSNR(symbol).then(d => { if (ok) setData(d) }).catch(() => {})
    return () => { ok = false }
  }, [symbol])

  const cp = data?.price || 0
  const levels = []
  if (data) {
    data.swing_highs?.slice(0, 3).forEach(s => levels.push({ label: s.label, price: s.price, type: 'res' }))
    if (data.high_24h) levels.push({ label: '24H High', price: data.high_24h, type: 'res' })
    if (data.r1)       levels.push({ label: 'R1',       price: data.r1,       type: 'res' })
    if (data.pivot)    levels.push({ label: 'Pivot',    price: data.pivot,    type: 'pivot' })
    if (data.s1)       levels.push({ label: 'S1',       price: data.s1,       type: 'sup' })
    if (data.low_24h)  levels.push({ label: '24H Low',  price: data.low_24h,  type: 'sup' })
    data.swing_lows?.slice(0, 3).forEach(s => levels.push({ label: s.label, price: s.price, type: 'sup' }))
    levels.sort((a, b) => b.price - a.price)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {!data && Array(6).fill(0).map((_, i) => (
        <div key={i} className="flex justify-between px-3 py-1.5">
          <Skeleton w="w-16" h="h-3" /><Skeleton w="w-20" h="h-3" />
        </div>
      ))}
      <div className="space-y-0.5 px-1">
        {levels.map((l, i) => {
          const isCP   = Math.abs(l.price - cp) / (cp || 1) < 0.001
          const tcolor = l.type === 'res' ? 'text-red' : l.type === 'sup' ? 'text-green' : 'text-yellow'
          const diff   = cp > 0 ? ((l.price - cp) / cp * 100) : 0
          return (
            <div key={i} className={`flex items-center justify-between px-2 py-1.5 rounded text-xs
              ${isCP ? 'bg-elev border-l-2 border-yellow' : 'hover:bg-elev/60'}`}>
              <span className="text-t3">{l.label}</span>
              <div className="flex items-center gap-3">
                <span className={`text-[10px] mono ${diff >= 0 ? 'text-green' : 'text-red'}`}>
                  {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%
                </span>
                <span className={`mono font-medium ${tcolor}`}>{fp(l.price)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Bottom Tab Panel ──────────────────────────────────
function BottomPanel() {
  const [tab, setTab] = useState('levels')

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex border-b border-white/[0.07] shrink-0">
        {[
          { id: 'levels',    label: 'Key Levels' },
          { id: 'orderbook', label: 'Order Book' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-[11px] font-medium transition-colors
              ${tab === t.id ? 'text-t1 border-b-2 border-blue -mb-px' : 'text-t3 hover:text-t2'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === 'levels'    && <KeyLevels />}
        {tab === 'orderbook' && <OrderBook />}
      </div>
    </div>
  )
}

// ── Left Panel Container ──────────────────────────────
export default function LeftPanel() {
  return (
    <aside className="w-60 bg-panel border-r border-white/[0.07] flex flex-col overflow-hidden shrink-0">
      <Watchlist />
      <Sentiment />
      <BottomPanel />
    </aside>
  )
}
