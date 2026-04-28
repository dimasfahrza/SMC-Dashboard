import { useState, useEffect, useRef } from 'react'
import { useApp } from '../../contexts/AppContext'
import {
  detectLocalTimezone, formatTimeInTz,
  getShortTzName, getTimezoneOffsetString
} from '../../utils/timezone'

const PRESETS = [
  { id: 'auto',                label: 'Auto (Browser)' },
  { id: 'UTC',                 label: 'UTC' },
  { id: 'Asia/Jakarta',        label: 'WIB (Jakarta)' },
  { id: 'America/New_York',    label: 'New York (ET)' },
  { id: 'Europe/London',       label: 'London (UK)' },
  { id: 'Asia/Tokyo',          label: 'Tokyo (JST)' },
  { id: 'Asia/Singapore',      label: 'Singapore (SGT)' },
]

export default function Clock() {
  const { timezone, setTimezone } = useApp()
  const [now, setNow] = useState(new Date())
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Click outside to close menu
  useEffect(() => {
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    if (menuOpen) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  const timeStr = formatTimeInTz(now, timezone)
  const tzShort = getShortTzName(timezone)
  const offsetStr = getTimezoneOffsetString(timezone)

  const selectTz = (id) => {
    setTimezone(id === 'auto' ? detectLocalTimezone() : id)
    setMenuOpen(false)
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs
                    hover:bg-elev border border-transparent hover:border-white/[0.07]
                    transition-colors group"
        title="Change timezone"
      >
        <span className="mono text-t1 font-medium">{timeStr}</span>
        <span className="text-[10px] text-t3 font-semibold px-1 py-0.5 rounded bg-elev
                         group-hover:bg-base">
          {tzShort}
        </span>
        <svg width="8" height="8" viewBox="0 0 8 8" className="text-t3">
          <path d="M1 2 L4 6 L7 2" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
      </button>

      {menuOpen && (
        <div className="absolute top-full right-0 mt-1 z-30 bg-panel border border-white/[0.12]
                         rounded-lg shadow-xl min-w-[200px] py-1">
          <div className="px-3 py-1.5 text-[10px] text-t3 uppercase tracking-wider border-b border-white/[0.07]">
            Timezone · {offsetStr}
          </div>
          {PRESETS.map(p => {
            const isActive = (p.id === 'auto' && timezone === detectLocalTimezone()) ||
                              p.id === timezone
            return (
              <button
                key={p.id}
                onClick={() => selectTz(p.id)}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-xs
                            hover:bg-elev text-left transition-colors
                            ${isActive ? 'text-blue' : 'text-t2 hover:text-t1'}`}
              >
                <span>{p.label}</span>
                {isActive && <span className="text-blue text-[10px]">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
