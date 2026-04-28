import { useEffect, useState } from 'react'
import { useWSChannel } from '../../hooks/useWebSocket'
import { api } from '../../services/api'

export default function WalletEquity() {
  const [wallet, setWallet] = useState(null)
  const live = useWSChannel('live_wallet')

  useEffect(() => {
    api.getLiveWallet().then(d => setWallet(d)).catch(() => {})
  }, [])

  useEffect(() => {
    if (live && live.equity) setWallet(live)
  }, [live])

  if (!wallet || !wallet.equity) return null

  const pnlColor = wallet.unrealized_pnl >= 0 ? 'text-green' : 'text-red'

  return (
    <div className="px-3 py-2.5 border-b border-white/[0.07] bg-elev/40">
      <div className="flex items-center justify-between">
        {/* Equity */}
        <div>
          <div className="text-[9px] text-t3 uppercase tracking-wider mb-0.5">Equity</div>
          <div className="text-sm font-bold mono text-t1">
            ${wallet.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        {/* Unrealized PnL */}
        <div className="text-center">
          <div className="text-[9px] text-t3 uppercase tracking-wider mb-0.5">Unrealized</div>
          <div className={`text-sm font-bold mono ${pnlColor}`}>
            {wallet.unrealized_pnl >= 0 ? '+' : ''}
            {wallet.unrealized_pnl.toFixed(2)}
          </div>
        </div>

        {/* Available */}
        <div className="text-right">
          <div className="text-[9px] text-t3 uppercase tracking-wider mb-0.5">Available</div>
          <div className="text-sm font-bold mono text-t2">
            ${wallet.available.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Margin usage bar */}
      {wallet.margin_ratio > 0 && (
        <div className="mt-2">
          <div className="flex justify-between text-[9px] text-t3 mb-0.5">
            <span>Margin Used</span>
            <span className="mono">{wallet.margin_ratio.toFixed(1)}%</span>
          </div>
          <div className="h-1 bg-base rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500
                ${wallet.margin_ratio > 70 ? 'bg-red'
                  : wallet.margin_ratio > 40 ? 'bg-yellow'
                  : 'bg-green'}`}
              style={{ width: `${Math.min(wallet.margin_ratio, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
