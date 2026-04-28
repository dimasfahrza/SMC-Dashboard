import { useState } from 'react'

export default function SettingsPage() {
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-base">
      <h1 className="text-lg font-semibold text-t1 mb-1">Settings</h1>
      <p className="text-sm text-t2 mb-6">Konfigurasi dashboard dan trading parameters.</p>

      <div className="max-w-xl space-y-4">

        {/* API Keys */}
        <div className="bg-panel border border-white/[0.07] rounded-xl p-5">
          <div className="section-label mb-4">API Keys</div>
          <div className="space-y-3">
            <Field label="Trading Economics API Key"
                   placeholder="Masukkan TE API key untuk live economic calendar"
                   type="password"
                   hint="Daftar di tradingeconomics.com/api → free plan → copy key" />
            <Field label="Binance Testnet API Key"    placeholder="Testnet API key" type="password" />
            <Field label="Binance Testnet API Secret" placeholder="Testnet API secret" type="password" />
          </div>
        </div>

        {/* Scanner */}
        <div className="bg-panel border border-white/[0.07] rounded-xl p-5">
          <div className="section-label mb-4">Scanner</div>
          <div className="space-y-3">
            <Field label="Scan Interval (detik)" defaultValue="60" type="number" />
            <Field label="Min Score to Emit"     defaultValue="40" type="number" />
            <Field label="Watchlist" defaultValue="BTC/USDT,ETH/USDT,SOL/USDT,BNB/USDT,XRP/USDT" />
          </div>
        </div>

        {/* Risk */}
        <div className="bg-panel border border-white/[0.07] rounded-xl p-5">
          <div className="section-label mb-4">Risk Management</div>
          <div className="space-y-3">
            <Field label="Risk Per Trade (%)" defaultValue="1.0" type="number" />
            <Field label="Max Daily Loss (%)" defaultValue="5.0" type="number" />
            <Field label="Max Open Positions" defaultValue="3"   type="number" />
          </div>
        </div>

        {/* Note */}
        <div className="bg-yellow/5 border border-yellow/20 rounded-xl p-4 text-xs text-yellow">
          ⚠ Perubahan settings di sini bersifat display only saat ini. Untuk mengubah nilai aktual,
          edit file <code className="mono bg-yellow/10 px-1 rounded">.env</code> di folder{' '}
          <code className="mono bg-yellow/10 px-1 rounded">backend/</code> lalu restart backend.
        </div>

        <button
          onClick={handleSave}
          className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-colors
            ${saved
              ? 'bg-green/10 text-green border border-green/20'
              : 'bg-elev text-t1 border border-white/[0.1] hover:border-white/[0.2]'}`}
        >
          {saved ? '✓ Saved' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, placeholder = '', type = 'text', defaultValue = '', hint }) {
  return (
    <div>
      <label className="text-xs text-t2 font-medium block mb-1.5">{label}</label>
      <input
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full bg-elev border border-white/[0.07] rounded-lg px-3 py-2
                   text-xs text-t1 placeholder:text-t3
                   focus:outline-none focus:border-white/[0.2] transition-colors"
      />
      {hint && <p className="text-[11px] text-t3 mt-1">{hint}</p>}
    </div>
  )
}
