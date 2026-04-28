import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { StatCard } from '../ui/index'
import { fp, coin, ccolor } from '../../utils/format'

// Mini bar chart (pure CSS/SVG, no external chart lib needed)
function BarChart({ data, valueKey = 'pnl_r', labelKey = 'month', height = 120 }) {
  if (!data?.length) return <div className="text-xs text-t3 py-4 text-center">No data</div>
  const vals = data.map(d => d[valueKey])
  const maxAbs = Math.max(...vals.map(Math.abs), 0.1)
  const w = 100 / data.length

  return (
    <svg width="100%" height={height} className="overflow-visible">
      {data.map((d, i) => {
        const v = d[valueKey]
        const barH = (Math.abs(v) / maxAbs) * (height * 0.8)
        const color = v >= 0 ? '#22c983' : '#e8455a'
        const x = i * w + w * 0.1
        const barW = w * 0.8
        const y = v >= 0 ? height / 2 - barH : height / 2

        return (
          <g key={i}>
            <rect x={`${x}%`} y={y} width={`${barW}%`} height={barH}
                  fill={color} fillOpacity={0.7} rx={2} />
            {data.length <= 12 && (
              <text x={`${x + barW / 2}%`} y={height - 4}
                    textAnchor="middle" fontSize={9} fill="#555e75">
                {d[labelKey]?.slice(-3) || ''}
              </text>
            )}
          </g>
        )
      })}
      {/* Zero line */}
      <line x1="0" y1={height / 2} x2="100%" y2={height / 2}
            stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
    </svg>
  )
}

// Equity curve SVG
function EquityCurve({ points }) {
  if (!points?.length) return <div className="text-xs text-t3 py-4 text-center">No data</div>
  const vals = points.map(p => p.cum_r)
  const minV = Math.min(...vals)
  const maxV = Math.max(...vals)
  const range = maxV - minV || 1
  const W = 600, H = 100
  const pad = 8

  const pathPoints = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1 || 1)) * (W - pad * 2)
    const y = pad + (1 - (v - minV) / range) * (H - pad * 2)
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
  }).join(' ')

  const fillPath = pathPoints + ` L ${W - pad} ${H} L ${pad} ${H} Z`
  const isProfit = (vals[vals.length - 1] || 0) >= 0
  const color = isProfit ? '#22c983' : '#e8455a'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      <defs>
        <linearGradient id="eq-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill="url(#eq-grad)" />
      <path d={pathPoints} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}

// Donut chart
function Donut({ data, size = 80 }) {
  if (!data?.length) return null
  const total = data.reduce((s, d) => s + d.count, 0)
  if (total === 0) return null

  const colors = { WIN_TP1: '#22c983', WIN_TP2: '#4a8ff0', WIN_TP3: '#8c5cf0', LOSS: '#e8455a', OPEN: '#9097ad' }
  const cx = size / 2, cy = size / 2, r = size / 2 - 4
  let angle = -90
  const slices = data.filter(d => d.count > 0).map(d => {
    const sweep = (d.count / total) * 360
    const start = angle
    angle += sweep
    return { ...d, startAngle: start, sweep }
  })

  const polarToXY = (cx, cy, r, deg) => {
    const rad = (deg * Math.PI) / 180
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
  }

  return (
    <svg width={size} height={size}>
      {slices.map((s, i) => {
        const start = polarToXY(cx, cy, r, s.startAngle)
        const end   = polarToXY(cx, cy, r, s.startAngle + s.sweep)
        const large = s.sweep > 180 ? 1 : 0
        const color = colors[s.result] || '#555e75'
        return (
          <path key={i}
            d={`M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y} Z`}
            fill={color} fillOpacity={0.8} />
        )
      })}
      <circle cx={cx} cy={cy} r={r * 0.55} fill="#191d28" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={12} fontWeight="bold" fill="#e8eaf0">
        {total}
      </text>
    </svg>
  )
}

export default function AnalyticsPage() {
  const [equity,   setEquity]   = useState(null)
  const [bySymbol, setBySymbol] = useState([])
  const [byDir,    setByDir]    = useState([])
  const [byResult, setByResult] = useState([])
  const [monthly,  setMonthly]  = useState([])
  const [summary,  setSummary]  = useState(null)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    Promise.all([
      api.getEquityCurve(),
      api.getBySymbol(),
      api.getByDirection(),
      api.getByResult(),
      api.getMonthly(),
      api.getJournalSummary(),
    ]).then(([eq, sym, dir, res, mon, sum]) => {
      setEquity(eq)
      setBySymbol(sym)
      setByDir(dir)
      setByResult(res)
      setMonthly(mon)
      setSummary(sum)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-t3 text-sm">
      Loading analytics...
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-base">
      <h1 className="text-lg font-semibold text-t1 mb-5">Analytics</h1>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          <StatCard label="Win Rate"      value={`${summary.win_rate}%`}
                    sub={`${summary.wins}W ${summary.losses}L`}
                    color={summary.win_rate >= 50 ? 'text-green' : 'text-red'} />
          <StatCard label="Total R"       value={`${summary.total_r >= 0 ? '+' : ''}${summary.total_r}R`}
                    color={summary.total_r >= 0 ? 'text-green' : 'text-red'} />
          <StatCard label="Profit Factor" value={summary.profit_factor}
                    color={summary.profit_factor >= 1.5 ? 'text-green' : 'text-yellow'} />
          <StatCard label="Max Drawdown"  value={`${summary.max_drawdown_r}R`}  color="text-red" />
          <StatCard label="Avg Hold"      value={`${summary.avg_hold_hours}h`}  color="text-blue" />
        </div>
      )}

      {/* Row 1: Equity Curve + Result donut */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="col-span-2 bg-panel border border-white/[0.07] rounded-xl p-4">
          <div className="section-label mb-3">Equity Curve</div>
          <EquityCurve points={equity?.points} />
          {equity?.points?.length === 0 && (
            <div className="text-xs text-t3 text-center py-4">No closed trades yet</div>
          )}
        </div>
        <div className="bg-panel border border-white/[0.07] rounded-xl p-4">
          <div className="section-label mb-3">Result Distribution</div>
          <div className="flex items-center gap-4">
            <Donut data={byResult} size={80} />
            <div className="space-y-1.5 flex-1">
              {byResult.map(r => (
                <div key={r.result} className="flex justify-between text-xs">
                  <span className="text-t3">{r.result}</span>
                  <span className="mono text-t1">{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Monthly P&L + by Direction */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-panel border border-white/[0.07] rounded-xl p-4">
          <div className="section-label mb-3">Monthly P&L (R)</div>
          <BarChart data={monthly} valueKey="pnl_r" labelKey="month" />
        </div>
        <div className="bg-panel border border-white/[0.07] rounded-xl p-4">
          <div className="section-label mb-3">Long vs Short</div>
          {byDir.map(d => (
            <div key={d.direction} className="mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span className={d.direction === 'LONG' ? 'text-green font-medium' : 'text-red font-medium'}>
                  {d.direction}
                </span>
                <span className="mono text-t2">{d.win_rate}% WR · {d.trades} trades</span>
              </div>
              <div className="h-2 bg-elev rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                     style={{
                       width: `${d.win_rate}%`,
                       background: d.direction === 'LONG' ? '#22c983' : '#e8455a',
                     }} />
              </div>
            </div>
          ))}
          {byDir.length === 0 && <div className="text-xs text-t3 py-4 text-center">No data</div>}
        </div>
      </div>

      {/* Row 3: By symbol */}
      <div className="bg-panel border border-white/[0.07] rounded-xl p-4">
        <div className="section-label mb-3">Performance by Symbol</div>
        {bySymbol.length === 0 ? (
          <div className="text-xs text-t3 text-center py-4">No data</div>
        ) : (
          <div className="space-y-2">
            {bySymbol.map(s => (
              <div key={s.symbol} className="flex items-center gap-4">
                <div className="flex items-center gap-2 w-16 shrink-0">
                  <div className="w-2 h-2 rounded-full" style={{ background: ccolor(s.symbol) }} />
                  <span className="text-xs font-medium text-t1">{coin(s.symbol)}</span>
                </div>
                <div className="flex-1 h-1.5 bg-elev rounded-full overflow-hidden">
                  <div className="h-full rounded-full"
                       style={{
                         width: `${s.win_rate}%`,
                         background: s.win_rate >= 55 ? '#22c983' : s.win_rate >= 45 ? '#e8a020' : '#e8455a',
                       }} />
                </div>
                <div className="flex items-center gap-4 text-xs mono shrink-0">
                  <span className="text-t2 w-12 text-right">{s.win_rate}% WR</span>
                  <span className="text-t3 w-10 text-right">{s.trades}t</span>
                  <span className={`w-14 text-right ${s.pnl_r >= 0 ? 'text-green' : 'text-red'}`}>
                    {s.pnl_r >= 0 ? '+' : ''}{s.pnl_r}R
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
