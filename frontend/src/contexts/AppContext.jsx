import { createContext, useContext, useState, useEffect } from 'react'
import { detectLocalTimezone } from '../utils/timezone'

const Ctx = createContext(null)

const TZ_KEY = 'smc_tz_pref'

export function AppProvider({ children }) {
  const [symbol, setSymbol]     = useState('BTC/USDT')
  const [timeframe, setTf]      = useState('15m')
  const [page, setPage]         = useState('dashboard')

  // Timezone — load dari localStorage, default auto-detect
  const [timezone, setTimezone] = useState(() => {
    try {
      const saved = localStorage.getItem(TZ_KEY)
      if (saved) return saved
    } catch {}
    return detectLocalTimezone()
  })

  // Persist
  useEffect(() => {
    try { localStorage.setItem(TZ_KEY, timezone) } catch {}
  }, [timezone])

  return (
    <Ctx.Provider value={{
      symbol, setSymbol,
      timeframe, setTf,
      page, setPage,
      timezone, setTimezone,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useApp = () => {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
