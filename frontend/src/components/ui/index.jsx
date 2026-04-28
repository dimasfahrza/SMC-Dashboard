// Shared UI primitives

export function Badge({ children, color = 'default', size = 'sm' }) {
  const colors = {
    green:   'bg-green/10 text-green border-green/20',
    red:     'bg-red/10 text-red border-red/20',
    yellow:  'bg-yellow/10 text-yellow border-yellow/20',
    blue:    'bg-blue/10 text-blue border-blue/20',
    purple:  'bg-purple/10 text-purple border-purple/20',
    default: 'bg-elev text-t2 border-white/5',
  }
  const sizes = { xs: 'px-1.5 py-0.5 text-[10px]', sm: 'px-2 py-0.5 text-xs' }
  return (
    <span className={`inline-flex items-center font-medium border rounded ${colors[color]} ${sizes[size]}`}>
      {children}
    </span>
  )
}

export function Card({ children, className = '', padding = 'p-4' }) {
  return (
    <div className={`bg-panel border border-white/[0.07] rounded-xl ${padding} ${className}`}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, action }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <span className="section-label">{children}</span>
      {action}
    </div>
  )
}

export function Skeleton({ h = 'h-4', w = 'w-full', className = '' }) {
  return <div className={`skeleton ${h} ${w} ${className}`} />
}

export function Divider() {
  return <div className="h-px bg-white/[0.07] my-3" />
}

export function KVRow({ label, value, valueClass = '' }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-t3 text-xs">{label}</span>
      <span className={`text-xs font-medium mono ${valueClass}`}>{value}</span>
    </div>
  )
}

export function Dot({ color = 'green', pulse = false }) {
  const colors = {
    green: 'bg-green', red: 'bg-red', yellow: 'bg-yellow',
    blue: 'bg-blue', gray: 'bg-t3',
  }
  return (
    <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors[color]} ${pulse ? 'pulse-dot' : ''}`} />
  )
}

export function StatCard({ label, value, sub, color = '' }) {
  return (
    <div className="bg-elev rounded-lg p-3 flex flex-col gap-0.5">
      <span className="text-[10px] text-t3 uppercase tracking-wider">{label}</span>
      <span className={`text-lg font-bold mono ${color}`}>{value}</span>
      {sub && <span className="text-[11px] text-t2">{sub}</span>}
    </div>
  )
}
