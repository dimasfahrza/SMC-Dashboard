const BASE = import.meta.env.VITE_API_BASE || ''
const enc  = s => encodeURIComponent(s)

async function req(path, opts = {}) {
  const r = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...opts })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}

export const api = {
  // Market
  getTickers:    ()                     => req('/api/market/tickers'),
  getOHLCV:      (sym, tf='1h', n=300)  => req(`/api/market/ohlcv/${enc(sym)}?timeframe=${tf}&limit=${n}`),
  getStructure:  (sym)                  => req(`/api/market/structure/${enc(sym)}`),

  // Analysis
  getSignal:     (sym)                  => req(`/api/signal/${enc(sym)}`),
  getSentiment:  (sym)                  => req(`/api/sentiment/${enc(sym)}`),
  getContext:    (sym)                  => req(`/api/context/${enc(sym)}`),
  getSNR:        (sym)                  => req(`/api/snr/${enc(sym)}`),

  // Journal
  getTrades:     (p = {})              => req(`/api/journal/trades?limit=${p.limit||100}&offset=${p.offset||0}${p.symbol?'&symbol='+enc(p.symbol):''}${p.result?'&result='+p.result:''}`),
  getJournalSummary: ()                => req('/api/journal/summary'),

  // Analytics
  getEquityCurve:  ()                  => req('/api/analytics/equity-curve'),
  getBySymbol:     ()                  => req('/api/analytics/by-symbol'),
  getByDirection:  ()                  => req('/api/analytics/by-direction'),
  getByResult:     ()                  => req('/api/analytics/by-result'),
  getMonthly:      ()                  => req('/api/analytics/monthly'),
  getInsights:     ()                  => req('/api/analytics/insights'),

  // Calendar
  getCalendar:   (days = 7)            => req(`/api/calendar/upcoming?days=${days}`),
  getBlackout:   ()                    => req('/api/calendar/blackout'),

  // Positions
  getOpenPositions: ()                 => req('/api/positions/open'),
  getRisk:          ()                 => req('/api/risk'),

  // Live positions (Binance Demo)
  getLivePositions:  ()      => req('/api/live/positions'),
  getLivePosition:   (sym)   => req(`/api/live/positions/${enc(sym)}`),
  getLiveWallet:     ()      => req('/api/live/wallet'),
  getLiveStatus:     ()      => req('/api/live/status'),
}
