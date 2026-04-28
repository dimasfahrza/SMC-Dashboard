import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { fp, dt, coin, ccolor, dcolor, scolor } from '../../utils/format'
import { Badge } from '../ui/index'

export default function SignalsPage() {
  const [signals, setSignals] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getRecentSignals(50)
      .then(d => { setSignals(d || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-base">
      <h1 className="text-lg font-semibold text-t1 mb-5">Signal History</h1>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {loading && Array(6).fill(0).map((_, i) => (
          <div key={i} className="bg-panel border border-white/[0.07] rounded-xl p-4">
            <div className="skeleton h-4 w-24 mb-3" />
            <div className="skeleton h-3 w-full mb-2" />
            <div className="skeleton h-3 w-3/4" />
          </div>
        ))}
        {!loading && signals.length === 0 && (
          <div className="col-span-3 text-center py-16 text-t3 text-sm">
            Tidak ada sinyal tersimpan. Sinyal akan muncul setelah scanner berjalan.
          </div>
        )}
        {!loading && signals.map((s, i) => {
          const dc = dcolor(s.direction)
          const sc = scolor(s.score)
          const isLong = s.direction === 'LONG'
          return (
            <div key={s.id || i}
                 className="bg-panel border border-white/[0.07] rounded-xl p-4
                             hover:border-white/[0.12] transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: ccolor(s.symbol) }} />
                  <span className="text-xs font-semibold text-t1">{coin(s.symbol)}</span>
                </div>
                <span className="text-[10px] text-t3 mono">{dt(s.created_at, 'full')}</span>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <span className="text-base font-bold" style={{ color: dc }}>{s.direction}</span>
                <div className="flex-1" />
                <div className="flex items-center gap-1">
                  <div className="w-8 h-1 bg-elev rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${s.score}%`, background: sc }} />
                  </div>
                  <span className="text-xs mono font-semibold" style={{ color: sc }}>{s.score}</span>
                </div>
              </div>

              <div className="space-y-0.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-t3">Entry</span>
                  <span className="mono text-t1">${fp(s.entry)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-t3">SL</span>
                  <span className="mono text-red">${fp(s.stop_loss)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-t3">TP1</span>
                  <span className="mono text-green">${fp(s.tp1)}</span>
                </div>
              </div>

              {s.explanation && (
                <p className="text-[11px] text-t3 mt-2 leading-relaxed line-clamp-2">
                  {s.explanation}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
