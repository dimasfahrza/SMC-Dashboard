import { useEffect, useState } from 'react'
import Chart from '../chart/Chart'
import { useApp } from '../../contexts/AppContext'
import { useWSChannel } from '../../hooks/useWebSocket'
import { api } from '../../services/api'
import { dcolor, scolor, coin } from '../../utils/format'

function BottomBar() {
  const { symbol } = useApp()
  const [signal, setSignal] = useState(null)
  const [blackout, setBlackout] = useState(null)
  const live = useWSChannel(`signal:${symbol}`)

  useEffect(() => {
    let ok = true
    api.getSignal(symbol).then(d => { if (ok) setSignal(d) }).catch(() => {})
    api.getBlackout().then(d => { if (ok) setBlackout(d) }).catch(() => {})
    return () => { ok = false }
  }, [symbol])

  const s = live || signal
  const dir = s?.direction || 'WAIT'
  const dc  = dcolor(dir)

  return (
    <div className="shrink-0 border-t border-white/[0.07] bg-panel">
      {/* Blackout bar */}
      {blackout?.active && (
        <div className="flex items-center justify-between px-5 py-2 bg-red/8 border-b border-red/20">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red pulse-dot" />
            <span className="text-xs font-semibold text-red">{blackout.message}</span>
          </div>
          <span className="text-[11px] text-t3">{blackout.event?.title}</span>
        </div>
      )}

      {/* Signal explanation */}
      <div className="flex items-start gap-4 px-5 py-3">
        <div className="px-3 py-1.5 rounded-lg border shrink-0 text-sm font-bold mono"
             style={{ color: dc, borderColor: `${dc}30`, background: `${dc}10` }}>
          {dir}
        </div>
        <div className="flex-1">
          <p className="text-xs text-t2 leading-relaxed line-clamp-2">
            {s?.explanation || 'Analisis berjalan... Menunggu data signal terbaru.'}
          </p>
        </div>
        {s?.score > 0 && (
          <div className="shrink-0 text-right">
            <div className="text-[10px] text-t3">Score</div>
            <div className="text-sm font-bold mono" style={{ color: scolor(s.score) }}>
              {s.score}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function CenterPanel() {
  return (
    <main className="flex-1 flex flex-col overflow-hidden min-w-0">
      <Chart />
      <BottomBar />
    </main>
  )
}
