export const fp = (v, decimals = null) => {
  if (v == null || isNaN(v)) return '—'
  const n = Number(v)
  const d = decimals ?? (n < 1 ? 6 : n < 10 ? 4 : 2)
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export const pct = (v, d = 2) => {
  if (v == null || isNaN(v)) return '—'
  const n = Number(v)
  return `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`
}

export const dt = (s, fmt = 'time', tz = null) => {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d)) return '—'

  // Jika ada timezone, pakai Intl
  if (tz) {
    try {
      if (fmt === 'time') {
        return new Intl.DateTimeFormat('en-GB', {
          timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
        }).format(d)
      }
      if (fmt === 'date') {
        return new Intl.DateTimeFormat('en-GB', {
          timeZone: tz, day: '2-digit', month: 'short'
        }).format(d)
      }
      if (fmt === 'full') {
        return new Intl.DateTimeFormat('en-GB', {
          timeZone: tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false
        }).format(d)
      }
      if (fmt === 'month') {
        return new Intl.DateTimeFormat('en-GB', {
          timeZone: tz, month: 'short', year: '2-digit'
        }).format(d)
      }
    } catch {}
  }

  const pad = n => String(n).padStart(2, '0')
  const h = pad(d.getHours()), m = pad(d.getMinutes())
  const day = pad(d.getDate())
  const mon = d.toLocaleString('en', { month: 'short' })
  if (fmt === 'time')  return `${h}:${m}`
  if (fmt === 'date')  return `${day} ${mon}`
  if (fmt === 'full')  return `${day} ${mon} ${h}:${m}`
  if (fmt === 'month') return d.toLocaleString('en', { month: 'short', year: '2-digit' })
  return d.toLocaleString()
}

export const ago = s => {
  if (!s) return ''
  const diff = Date.now() - new Date(s).getTime()
  if (diff < 0) {
    const f = -diff
    if (f < 3600000) return `in ${Math.floor(f/60000)}m`
    return `in ${Math.floor(f/3600000)}h`
  }
  if (diff < 60000)    return 'now'
  if (diff < 3600000)  return `${Math.floor(diff/60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`
  return `${Math.floor(diff/86400000)}d ago`
}

export const coin = s => (s || '').replace('/USDT', '').replace('USDT', '')

export const ccolor = c => ({
  BTC: '#f59e0b', ETH: '#3b82f6', SOL: '#8b5cf6',
  BNB: '#eab308', XRP: '#06b6d4',
}[coin(c)] || '#9097ad')

export const dcolor = d =>
  d === 'LONG' || d === 'BULLISH' ? 'var(--green)' :
  d === 'SHORT' || d === 'BEARISH' ? 'var(--red)' : 'var(--yellow)'

export const scolor = s =>
  s >= 70 ? 'var(--green)' : s >= 50 ? 'var(--yellow)' : 'var(--red)'

export const icolor = i =>
  i === 'HIGH' ? 'var(--red)' : i === 'MEDIUM' ? 'var(--yellow)' : 'var(--text-3)'
