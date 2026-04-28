import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { fp, dt, coin, ccolor } from '../../utils/format'
import { StatCard, Badge } from '../ui/index'

const FILTERS = [
  { label: 'All',    value: ''     },
  { label: 'Win',    value: 'WIN'  },
  { label: 'Loss',   value: 'LOSS' },
  { label: 'Open',   value: 'OPEN' },
]

function resultBadge(result) {
  if (!result) return <Badge color="default" size="xs">—</Badge>
  if (result.startsWith('WIN')) return <Badge color="green" size="xs">{result.replace('WIN_', '')}</Badge>
  if (result === 'LOSS')        return <Badge color="red"   size="xs">LOSS</Badge>
  if (result === 'OPEN')        return <Badge color="blue"  size="xs">OPEN</Badge>
  return <Badge color="default" size="xs">{result}</Badge>
}

export default function JournalPage() {
  const [trades, setTrades] = useState([])
  const [summary, setSummary] = useState(null)
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.getTrades({ limit: 200 }),
      api.getJournalSummary(),
    ]).then(([t, s]) => {
      setTrades(t.trades || [])
      setSummary(s)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const filtered = trades.filter(t => {
    const matchFilter =
      !filter ? true :
      filter === 'WIN' ? t.result?.startsWith('WIN') :
      filter === 'OPEN' ? t.status === 'OPEN' :
      t.result === filter
    const matchSearch = !search ||
      t.symbol?.toLowerCase().includes(search.toLowerCase()) ||
      t.result?.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-base">
      <h1 className="text-lg font-semibold text-t1 mb-5">Trade Journal</h1>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <StatCard label="Total Trades"  value={summary.total_trades}
                    sub={`${summary.open_trades} open`} />
          <StatCard label="Win Rate"      value={`${summary.win_rate}%`}
                    sub={`${summary.wins}W / ${summary.losses}L`}
                    color={summary.win_rate >= 50 ? 'text-green' : 'text-red'} />
          <StatCard label="Total P&L"
                    value={`${summary.total_r >= 0 ? '+' : ''}${summary.total_r}R`}
                    sub={`$${summary.total_usdt >= 0 ? '+' : ''}${summary.total_usdt}`}
                    color={summary.total_r >= 0 ? 'text-green' : 'text-red'} />
          <StatCard label="Profit Factor" value={summary.profit_factor}
                    sub={`DD: ${summary.max_drawdown_r}R`}
                    color={summary.profit_factor >= 1.5 ? 'text-green' : 'text-yellow'} />
        </div>
      )}

      {/* Filters + search */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-1 bg-panel border border-white/[0.07] rounded-lg p-1">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1 text-xs rounded-md transition-colors
                ${filter === f.value ? 'bg-elev text-t1' : 'text-t3 hover:text-t2'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search symbol..."
          className="bg-panel border border-white/[0.07] rounded-lg px-3 py-1.5 text-xs text-t1
                     placeholder:text-t3 focus:outline-none focus:border-white/[0.15] w-40"
        />
        <span className="text-xs text-t3 ml-auto">{filtered.length} trades</span>
      </div>

      {/* Table */}
      <div className="bg-panel border border-white/[0.07] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.07]">
                {['Date', 'Pair', 'Side', 'Entry', 'Exit', 'SL', 'Size', 'Lev', 'Result', 'P&L (R)', 'P&L ($)'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-t3 font-medium uppercase tracking-wider text-[10px]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && Array(5).fill(0).map((_, i) => (
                <tr key={i} className="border-b border-white/[0.04]">
                  {Array(11).fill(0).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="skeleton h-3 w-16" />
                    </td>
                  ))}
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-t3">
                    No trades found
                  </td>
                </tr>
              )}
              {!loading && filtered.map((t, i) => {
                const isWin  = t.result?.startsWith('WIN')
                const isLoss = t.result === 'LOSS'
                const pnlColor = isWin ? 'text-green' : isLoss ? 'text-red' : 'text-t2'
                return (
                  <tr key={t.id || i}
                      className="border-b border-white/[0.04] hover:bg-elev/50 transition-colors">
                    <td className="px-4 py-3 text-t3 mono">{dt(t.open_time, 'full')}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: ccolor(t.symbol) }} />
                        <span className="font-medium text-t1">{coin(t.symbol)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={t.side === 'LONG' ? 'green' : 'red'} size="xs">{t.side}</Badge>
                    </td>
                    <td className="px-4 py-3 mono text-t1">{fp(t.entry_price)}</td>
                    <td className="px-4 py-3 mono text-t2">{t.exit_price ? fp(t.exit_price) : '—'}</td>
                    <td className="px-4 py-3 mono text-red">{fp(t.stop_loss)}</td>
                    <td className="px-4 py-3 mono text-t2">{t.size ?? '—'}</td>
                    <td className="px-4 py-3 mono text-t2">{t.leverage ? `${t.leverage}x` : '—'}</td>
                    <td className="px-4 py-3">{resultBadge(t.result || (t.status === 'OPEN' ? 'OPEN' : null))}</td>
                    <td className={`px-4 py-3 mono font-medium ${pnlColor}`}>
                      {t.pnl_r != null ? `${t.pnl_r >= 0 ? '+' : ''}${t.pnl_r}R` : '—'}
                    </td>
                    <td className={`px-4 py-3 mono font-medium ${pnlColor}`}>
                      {t.pnl_usdt != null ? `$${t.pnl_usdt >= 0 ? '+' : ''}${t.pnl_usdt}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
