import { useEffect, useState } from 'react'
import { api } from '../../services/api'

const TYPE_STYLE = {
  performance: { bg: 'bg-blue/5',   border: 'border-blue/20',   icon_bg: 'bg-blue/10',   text: 'text-blue'   },
  symbol:      { bg: 'bg-green/5',  border: 'border-green/20',  icon_bg: 'bg-green/10',  text: 'text-green'  },
  direction:   { bg: 'bg-blue/5',   border: 'border-blue/20',   icon_bg: 'bg-blue/10',   text: 'text-blue'   },
  warning:     { bg: 'bg-red/5',    border: 'border-red/20',    icon_bg: 'bg-red/10',    text: 'text-red'    },
  risk:        { bg: 'bg-yellow/5', border: 'border-yellow/20', icon_bg: 'bg-yellow/10', text: 'text-yellow' },
  exit:        { bg: 'bg-green/5',  border: 'border-green/20',  icon_bg: 'bg-green/10',  text: 'text-green'  },
  duration:    { bg: 'bg-elev',     border: 'border-white/[0.07]', icon_bg: 'bg-elev',  text: 'text-t2'     },
  info:        { bg: 'bg-elev',     border: 'border-white/[0.07]', icon_bg: 'bg-elev',  text: 'text-t2'     },
}

function InsightCard({ insight }) {
  const style = TYPE_STYLE[insight.type] || TYPE_STYLE.info
  return (
    <div className={`p-4 rounded-xl border ${style.bg} ${style.border} flex items-start gap-3`}>
      <div className={`w-9 h-9 rounded-lg ${style.icon_bg} flex items-center justify-center text-base shrink-0`}>
        {insight.icon}
      </div>
      <div className="flex-1">
        <p className="text-sm text-t1 leading-relaxed">{insight.text}</p>
      </div>
    </div>
  )
}

// Static SMC learning cards — always visible
const SMC_LESSONS = [
  {
    title: 'OB Fresh vs Touched',
    body: 'Order Block fresh (belum pernah disentuh) memiliki probabilitas lebih tinggi karena order institusi belum habis. OB yang sudah 3x+ disentuh sebaiknya dihindari.',
    icon: '📦',
    tag: 'SMC Fundamental',
    tagColor: 'text-blue bg-blue/10',
  },
  {
    title: 'TF Alignment',
    body: '3 dari 3 TF (1D + 4H + 1H) searah = setup paling kuat. 2 dari 3 = setup valid. Jangan masuk jika hanya 1 TF yang support arah trade.',
    icon: '🔗',
    tag: 'Multi-Timeframe',
    tagColor: 'text-green bg-green/10',
  },
  {
    title: 'FVG sebagai Konfirmasi',
    body: 'Fair Value Gap yang berada dekat zona OB menambah probabilitas. Harga cenderung mengisi FVG sebelum lanjut ke arah bias, ini menjadi entry zone yang lebih tepat.',
    icon: '⚡',
    tag: 'Confluence',
    tagColor: 'text-purple bg-purple/10',
  },
  {
    title: 'TP Management',
    body: 'Close 40% posisi di TP1 dan geser SL ke breakeven. Ini memastikan trade tidak bisa rugi setelah TP1 tercapai, sementara sisa posisi mengejar TP2 dan TP3.',
    icon: '🎯',
    tag: 'Risk Management',
    tagColor: 'text-yellow bg-yellow/10',
  },
  {
    title: 'No-Trade Window',
    body: 'Hindari buka posisi baru 30 menit sebelum high impact news (FOMC, CPI, NFP). Volatilitas mendadak bisa kena SL bahkan setup yang valid secara teknikal.',
    icon: '🗓',
    tag: 'News Trading',
    tagColor: 'text-red bg-red/10',
  },
  {
    title: 'Break of Structure (BoS)',
    body: 'BoS bearish = close di bawah swing low terakhir. BoS bullish = close di atas swing high terakhir. BoS mengkonfirmasi perubahan arah bias, bukan sekadar koreksi.',
    icon: '📊',
    tag: 'Market Structure',
    tagColor: 'text-blue bg-blue/10',
  },
]

export default function LessonsPage() {
  const [insights, setInsights] = useState([])
  const [loading, setLoading]  = useState(true)

  useEffect(() => {
    api.getInsights()
      .then(d => { setInsights(d.insights || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-base">
      <h1 className="text-lg font-semibold text-t1 mb-1">Lessons</h1>
      <p className="text-sm text-t2 mb-6">
        Auto-generated insights dari trade history kamu + fundamental SMC concepts.
      </p>

      {/* Auto insights dari data */}
      {(insights.length > 0 || loading) && (
        <section className="mb-8">
          <div className="section-label mb-3">Your Trading Insights</div>
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="skeleton h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
            </div>
          )}
        </section>
      )}

      {/* Static SMC lessons */}
      <section>
        <div className="section-label mb-3">SMC Concepts</div>
        <div className="grid grid-cols-2 gap-3">
          {SMC_LESSONS.map((l, i) => (
            <div key={i} className="bg-panel border border-white/[0.07] rounded-xl p-4
                                    hover:border-white/[0.12] transition-colors">
              <div className="flex items-start gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-elev flex items-center justify-center text-base shrink-0">
                  {l.icon}
                </div>
                <div>
                  <div className="text-sm font-semibold text-t1">{l.title}</div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${l.tagColor}`}>
                    {l.tag}
                  </span>
                </div>
              </div>
              <p className="text-xs text-t2 leading-relaxed">{l.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
