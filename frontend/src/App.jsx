import { useState, useEffect } from 'react'
import { AppProvider, useApp } from './contexts/AppContext'
import { wsClient } from './services/websocket'

import NavSidebar    from './components/layout/NavSidebar'
import LeftPanel     from './components/layout/LeftPanel'
import CenterPanel   from './components/layout/CenterPanel'
import RightPanel    from './components/layout/RightPanel'
import JournalPage   from './components/journal/JournalPage'
import AnalyticsPage from './components/analytics/AnalyticsPage'
import LessonsPage   from './components/lessons/LessonsPage'
import SignalsPage   from './components/signal/SignalsPage'
import SettingsPage  from './components/layout/SettingsPage'
import Clock         from './components/ui/Clock'

function WSStatus() {
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    wsClient.onConnectionChange = setConnected
    wsClient.connect()
    return () => { wsClient.onConnectionChange = null }
  }, [])
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green pulse-dot' : 'bg-red'}`} />
      <span className={`text-xs font-medium ${connected ? 'text-green' : 'text-red'}`}>
        {connected ? 'LIVE' : 'OFFLINE'}
      </span>
    </div>
  )
}

function TopBar() {
  const { symbol, page } = useApp()
  const labels = {
    dashboard: 'Dashboard', signals: 'Signals',
    journal: 'Journal', analytics: 'Analytics',
    lessons: 'Lessons', settings: 'Settings',
  }
  return (
    <header className="h-11 shrink-0 flex items-center justify-between px-5
                        border-b border-white/[0.07] bg-panel">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-t1">{labels[page] || 'Dashboard'}</span>
        {page === 'dashboard' && (
          <span className="text-xs text-t3">{symbol}</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <WSStatus />
        <Clock />
      </div>
    </header>
  )
}

function PageContent({ page }) {
  if (page === 'signals')   return <SignalsPage />
  if (page === 'journal')   return <JournalPage />
  if (page === 'analytics') return <AnalyticsPage />
  if (page === 'lessons')   return <LessonsPage />
  if (page === 'settings')  return <SettingsPage />
  return null
}

function MainLayout() {
  const { page } = useApp()
  const isDash = page === 'dashboard'
  return (
    <div className="flex-1 flex overflow-hidden">
      <NavSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 flex overflow-hidden">
          {isDash ? (
            <>
              <LeftPanel />
              <CenterPanel />
              <RightPanel />
            </>
          ) : (
            <PageContent page={page} />
          )}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <div className="h-screen flex bg-base text-t1 overflow-hidden">
        <MainLayout />
      </div>
    </AppProvider>
  )
}
