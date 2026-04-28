import { useEffect, useState } from 'react'
import { useApp } from '../../contexts/AppContext'
import { useWSChannel } from '../../hooks/useWebSocket'
import { api } from '../../services/api'
import { fp, dt, ago, icolor, coin } from '../../utils/format'
import { SectionTitle, Badge, KVRow } from '../ui/index'
import SignalCard    from '../signal/SignalCard'
import LivePositions from '../positions/LivePositions'
import WalletEquity  from '../positions/WalletEquity'

// ── Market Context ────────────────────────────────────
function MarketContext() {
  const { symbol } = useApp()
  const [data, setData] = useState(null)
  const live = useWSChannel(`context:${symbol}`)

  useEffect(() => {
    let ok = true
    api.getContext(symbol).then(d => { if (ok) setData(d) }).catch(() => {})
    return () => { ok = false }
  }, [symbol])

  const c = live || data
  const tc = t => t === 'UP' ? 'text-green' : t === 'DOWN' ? 'text-red' : 'text-yellow'

  return (
    <div className="p-4 border-b border-white/[0.07]">
      <SectionTitle>Market Context</SectionTitle>
      {!c ? (
        <div className="text-xs text-t3 py-2">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {[
              { label: 'Session',  val: c.session,     color: 'text-blue' },
              { label: 'Trend',    val: c.trend,        color: tc(c.trend) },
              { label: 'ATR %',    val: c.atr_pct ? `${c.atr_pct.toFixed(3)}%` : '—', color: 'text-yellow mono' },
              { label: 'Momentum', val: c.momentum,     color: c.momentum === 'STRONG' ? 'text-yellow' : 'text-t2' },
            ].map(item => (
              <div key={item.label} className="bg-elev rounded-lg p-2">
                <div className="text-[9px] text-t3 uppercase tracking-wider mb-0.5">{item.label}</div>
                <div className={`text-xs font-semibold ${item.color}`}>{item.val || '—'}</div>
              </div>
            ))}
          </div>
          <KVRow label="EMA21 (1H)"  value={fp(c.ema21_1h)}  valueClass="mono text-t1" />
          <KVRow label="EMA21 (15m)" value={fp(c.ema21_15m)} valueClass="mono text-t1" />
        </>
      )}
    </div>
  )
}

// ── Blackout Banner ───────────────────────────────────
function BlackoutBanner() {
  const [bo, setBo] = useState(null)

  useEffect(() => {
    let ok = true
    const load = () => api.getBlackout().then(d => { if (ok) setBo(d) }).catch(() => {})
    load()
    const id = setInterval(load, 30_000)
    return () => { ok = false; clearInterval(id) }
  }, [])

  if (!bo?.active) return null

  return (
    <div className="mx-4 mb-3 p-3 rounded-xl bg-red/8 border border-red/25">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-full bg-red pulse-dot" />
        <span className="text-xs font-semibold text-red uppercase tracking-wide">No-Trade Window</span>
      </div>
      <p className="text-xs text-red/80">{bo.message}</p>
      <p className="text-[11px] text-t3 mt-1">{bo.event?.title}</p>
    </div>
  )
}

// ── Economic Calendar ─────────────────────────────────
function EconomicCalendar() {
  const { timezone } = useApp()
  const [events, setEvents] = useState([])
  const [source, setSource] = useState('')

  useEffect(() => {
    let ok = true
    const load = () => {
      api.getCalendar(7)
        .then(d => { if (ok) { setEvents(d.events || []); setSource(d.source || '') } })
        .catch(() => {})
    }
    load()
    const id = setInterval(load, 300_000)
    return () => { ok = false; clearInterval(id) }
  }, [])

  const high = events.filter(e => e.impact === 'HIGH').length

  return (
    <div className="p-4 flex-1 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">Economic Calendar</span>
        <div className="flex items-center gap-1.5">
          {high > 0 && <Badge color="red" size="xs">{high} HIGH</Badge>}
          {source === 'investing.com' && <Badge color="blue" size="xs">LIVE</Badge>}
          {source === 'tradingeconomics' && <Badge color="blue" size="xs">TE</Badge>}
          {source === 'hardcode' && <Badge color="yellow" size="xs">OFFLINE</Badge>}
        </div>
      </div>
      {events.length === 0 && (
        <div className="text-xs text-t3 text-center py-6">No upcoming events</div>
      )}
      <div className="space-y-2">
        {events.slice(0, 8).map((ev, i) => {
          const ic = icolor(ev.impact)
          const isHigh = ev.impact === 'HIGH'
          return (
            <div key={i} className={`p-3 rounded-xl border transition-colors
              ${isHigh ? 'bg-red/5 border-red/20' : 'bg-elev border-white/[0.07]'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] mono text-t3">{dt(ev.event_time, 'full', timezone)}</span>
                <span className="text-[10px] mono font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: `${ic}18`, color: ic }}>
                  {ev.impact}
                </span>
              </div>
              <p className="text-xs font-medium text-t1 mb-1">{ev.title}</p>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-t3">{ev.currency}</span>
                <span className="text-[10px] text-t3">{ago(ev.event_time)}</span>
              </div>
              {(ev.actual || ev.forecast || ev.previous) && (
                <div className="flex gap-3 mt-1 text-[10px] mono">
                  {ev.actual   && <span className="text-green">A: {ev.actual}</span>}
                  {ev.forecast && <span className="text-yellow">F: {ev.forecast}</span>}
                  {ev.previous && <span className="text-t3">P: {ev.previous}</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Right Panel Container ─────────────────────────────
export default function RightPanel() {
  return (
    <aside className="w-64 bg-panel border-l border-white/[0.07] flex flex-col overflow-y-auto shrink-0">
      <WalletEquity />
      <LivePositions />
      <SignalCard />
      <MarketContext />
      <BlackoutBanner />
      <EconomicCalendar />
    </aside>
  )
}
