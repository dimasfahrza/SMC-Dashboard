import { useEffect, useState } from 'react'
import { useApp } from '../../contexts/AppContext'
import { useWSChannel } from '../../hooks/useWebSocket'
import { api } from '../../services/api'
import { fp, pct, coin, ccolor } from '../../utils/format'
import { SectionTitle, Badge } from '../ui/index'

export default function LivePositions() {
  const { setSymbol } = useApp()
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(true)

  // WebSocket live update
  const live = useWSChannel('live_positions')

  // Initial fetch
  useEffect(() => {
    api.getLiveStatus().then(s => setConfigured(s.configured)).catch(() => {})
    api.getLivePositions()
      .then(d => { setPositions(d.positions || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Apply live updates
  useEffect(() => {
    if (live?.positions) setPositions(live.positions)
  }, [live])

  if (!configured) return <NotConfigured />

  return (
    <div className="p-4 border-b border-white/[0.07]">
      <div className="flex items-center justify-between mb-3">
        <SectionTitle>Open Positions</SectionTitle>
        {positions.length > 0 && (
          <Badge color="green" size="xs">{positions.length} OPEN</Badge>
        )}
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="skeleton h-16 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!loading && positions.length === 0 && (
        <div className="text-xs text-t3 text-center py-4">
          Tidak ada posisi terbuka
        </div>
      )}

      {!loading && positions.map((pos, i) => (
        <PositionCard
          key={i}
          pos={pos}
          onClick={() => setSymbol(pos.symbol)}
        />
      ))}
    </div>
  )
}

function PositionCard({ pos, onClick }) {
  const isLong   = pos.side === 'LONG'
  const isProfit = pos.unreal_pnl >= 0
  const pnlColor = isProfit ? 'text-green' : 'text-red'
  const sideBg   = isLong   ? 'border-green/20 bg-green/5' : 'border-red/20 bg-red/5'

  return (
    <button
      onClick={onClick}
      title="Klik untuk buka chart simbol ini"
      className={`w-full p-3 rounded-xl border mb-2 text-left
                  hover:brightness-110 transition-all ${sideBg}`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: ccolor(pos.symbol) }} />
          <span className="text-xs font-semibold text-t1">{coin(pos.symbol)}</span>
          <Badge color={isLong ? 'green' : 'red'} size="xs">{pos.side}</Badge>
          <span className="text-[10px] text-t3">{pos.leverage}x</span>
        </div>
        <div className={`text-sm font-bold mono ${pnlColor}`}>
          {pos.unreal_pnl >= 0 ? '+' : ''}{pos.unreal_pnl.toFixed(2)}
          <span className="text-[10px] ml-0.5">USDT</span>
        </div>
      </div>

      {/* Price info */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span className="text-t3">Entry</span>
          <span className="mono text-t1">{fp(pos.entry_price)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-t3">Mark</span>
          <span className="mono text-t1">{fp(pos.mark_price)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-t3">Size</span>
          <span className="mono text-t2">{pos.size}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-t3">PnL%</span>
          <span className={`mono font-medium ${pnlColor}`}>
            {pos.pnl_pct >= 0 ? '+' : ''}{pos.pnl_pct}%
          </span>
        </div>
      </div>

      {/* PnL bar */}
      <div className="mt-2 h-1 bg-elev rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isProfit ? 'bg-green' : 'bg-red'}`}
          style={{ width: `${Math.min(Math.abs(pos.pnl_pct) * 2, 100)}%` }}
        />
      </div>
    </button>
  )
}

function NotConfigured() {
  return (
    <div className="p-4 border-b border-white/[0.07]">
      <div className="section-label mb-3">Open Positions</div>
      <div className="p-3 rounded-xl bg-yellow/5 border border-yellow/20 text-xs text-yellow">
        <div className="font-semibold mb-1">API Key belum dikonfigurasi</div>
        <div className="text-yellow/70 text-[11px]">
          Tambahkan BINANCE_DEMO_API_KEY ke file .env dashboard, lalu restart backend.
        </div>
      </div>
    </div>
  )
}
