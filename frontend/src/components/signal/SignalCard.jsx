import { useEffect, useState } from 'react'
import { useApp } from '../../contexts/AppContext'
import { useWSChannel } from '../../hooks/useWebSocket'
import { api } from '../../services/api'
import { fp, dcolor, scolor, coin } from '../../utils/format'
import { Badge, KVRow, Skeleton } from '../ui/index'

export default function SignalCard() {
  const { symbol } = useApp()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const live = useWSChannel(`signal:${symbol}`)

  useEffect(() => {
    let ok = true
    setLoading(true)
    api.getSignal(symbol)
      .then(d => { if (ok) { setData(d); setLoading(false) } })
      .catch(() => { if (ok) setLoading(false) })
    return () => { ok = false }
  }, [symbol])

  const s = live || data

  return (
    <div className="border-b border-white/[0.07] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">Signal</span>
        <span className="text-[11px] text-t3">{coin(symbol)}/USDT</span>
      </div>

      {loading && <LoadingSkeleton />}

      {!loading && (!s || s.direction === 'WAIT') && (
        <WaitCard explanation={s?.explanation} />
      )}

      {!loading && s && s.direction !== 'WAIT' && (
        <ActiveCard s={s} />
      )}
    </div>
  )
}

function ActiveCard({ s }) {
  const dir = s.direction
  const dirColor = dir === 'LONG' ? 'text-green' : 'text-red'
  const dirBg    = dir === 'LONG' ? 'bg-green/8 border-green/20' : 'bg-red/8 border-red/20'
  const sc = scolor(s.score)

  return (
    <div className={`rounded-xl border p-3 ${dirBg}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${dirColor}`}>{dir}</span>
          <Badge color={dir === 'LONG' ? 'green' : 'red'} size="xs">4H</Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-12 h-1.5 bg-elev rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${s.score}%`, background: sc }} />
          </div>
          <span className="text-xs mono font-semibold" style={{ color: sc }}>
            {s.score}
          </span>
        </div>
      </div>

      {/* Levels */}
      <div className="space-y-0.5">
        <KVRow label="Entry"  value={`$${fp(s.entry)}`}     valueClass="text-t1" />
        <KVRow label="SL"     value={`$${fp(s.stop_loss)}`} valueClass="text-red" />
        <KVRow label="TP1"    value={`$${fp(s.tp1)}`}       valueClass="text-green" />
        <KVRow label="TP2"    value={`$${fp(s.tp2)}`}       valueClass="text-green" />
        <KVRow label="R:R"    value={`1 : ${s.rr2}`}        valueClass="text-blue" />
      </div>

      {/* Bias badges */}
      <div className="flex gap-1 mt-3">
        {[['1D', s.bias_1d], ['4H', s.bias_4h], ['1H', s.bias_1h]].map(([tf, b]) => (
          <div key={tf} className="flex-1 text-center py-1.5 rounded-lg bg-base/60">
            <div className="text-[9px] text-t3 uppercase">{tf}</div>
            <div className="text-[10px] font-semibold"
                 style={{ color: b === 'BULLISH' ? 'var(--green)' : b === 'BEARISH' ? 'var(--red)' : 'var(--text-3)' }}>
              {b?.slice(0, 4) || '—'}
            </div>
          </div>
        ))}
      </div>

      {/* Reason */}
      {s.explanation && (
        <p className="text-[11px] text-t3 mt-2.5 leading-relaxed line-clamp-3">
          {s.explanation}
        </p>
      )}

      {s.needs_confirmation && (
        <div className="mt-2 px-2 py-1.5 bg-yellow/5 border border-yellow/20 rounded-lg text-[11px] text-yellow">
          ⚠ Menunggu rejection candle di OB
        </div>
      )}
    </div>
  )
}

function WaitCard({ explanation }) {
  return (
    <div className="rounded-xl border border-yellow/15 bg-yellow/5 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base font-bold text-yellow">WAIT</span>
      </div>
      <p className="text-[11px] text-t2 leading-relaxed">
        {explanation || 'Belum ada setup valid. Menunggu harga mendekati OB atau kondisi TF konfluen.'}
      </p>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="rounded-xl border border-white/[0.07] p-3 space-y-2">
      <Skeleton h="h-5" w="w-20" />
      <Skeleton h="h-3" w="w-full" />
      <Skeleton h="h-3" w="w-full" />
      <Skeleton h="h-3" w="w-3/4" />
    </div>
  )
}
