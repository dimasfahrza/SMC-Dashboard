import { useApp } from '../../contexts/AppContext'

const NAV = [
  { id: 'dashboard', icon: '⬡', label: 'Dashboard' },
  { id: 'journal',   icon: '▦', label: 'Journal'   },
  { id: 'analytics', icon: '◉', label: 'Analytics' },
  { id: 'lessons',   icon: '◎', label: 'Lessons'   },
]

export default function NavSidebar() {
  const { page, setPage } = useApp()

  return (
    <nav className="w-14 bg-panel border-r border-white/[0.07] flex flex-col items-center py-4 gap-1 shrink-0">
      {/* Logo */}
      <div className="w-8 h-8 rounded-lg bg-green/10 border border-green/20 flex items-center justify-center mb-4">
        <span className="text-green text-sm font-bold">S</span>
      </div>

      {NAV.map(n => {
        const active = page === n.id
        return (
          <button
            key={n.id}
            title={n.label}
            onClick={() => setPage(n.id)}
            className={`w-9 h-9 rounded-lg flex items-center justify-center text-base transition-all
              ${active
                ? 'bg-green/10 text-green border border-green/25'
                : 'text-t3 hover:text-t2 hover:bg-elev border border-transparent'
              }`}
          >
            {n.icon}
          </button>
        )
      })}

      {/* Settings at bottom */}
      <div className="flex-1" />
      <button
        title="Settings"
        onClick={() => setPage('settings')}
        className={`w-9 h-9 rounded-lg flex items-center justify-center text-base transition-all
          ${page === 'settings'
            ? 'bg-blue/10 text-blue border border-blue/25'
            : 'text-t3 hover:text-t2 hover:bg-elev border border-transparent'
          }`}
      >
        ⚙
      </button>
    </nav>
  )
}
