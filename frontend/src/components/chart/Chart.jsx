import { useEffect, useRef, useState, useCallback } from 'react'
import { createChart } from 'lightweight-charts'
import { api } from '../../services/api'
import { useApp } from '../../contexts/AppContext'
import { useWSChannel } from '../../hooks/useWebSocket'
import { fp } from '../../utils/format'
import { DrawingLayer } from '../../utils/drawing'
import { ema, bollinger, toLineData } from '../../utils/indicators'

const TFS = ['1m','5m','15m','30m','1h','4h','1d']
const DRAW_TOOLS = [
  { id: 'trend', label: '╱', title: 'Trend line (klik 2 titik)' },
  { id: 'hline', label: '─', title: 'Horizontal line (klik 1 titik)' },
  { id: 'rect',  label: '▭', title: 'Rectangle (klik 2 titik)' },
  { id: 'fib',   label: 'F', title: 'Fibonacci (klik 2 titik)' },
]
const INDICATORS = [
  { id: 'ema20',  label: 'EMA 20',    color: '#4a8ff0' },
  { id: 'ema50',  label: 'EMA 50',    color: '#e8a020' },
  { id: 'ema200', label: 'EMA 200',   color: '#8c5cf0' },
  { id: 'bb',     label: 'Bollinger', color: '#9097ad' },
]

export default function Chart() {
  const { symbol, timeframe, setTf } = useApp()
  const ref          = useRef(null)
  const chartRef     = useRef(null)
  const candleRef    = useRef(null)
  const volRef       = useRef(null)
  const indSeriesRef = useRef({})
  const drawingRef   = useRef(null)
  const candlesData  = useRef([])
  const intervalRef  = useRef(null)

  const [ohlc,           setOhlc]          = useState(null)
  const [activeTool,     setActiveTool]    = useState(null)
  const [indicators,     setIndicators]    = useState({ ema20: true, ema50: false, ema200: false, bb: false })
  const [showIndMenu,    setShowIndMenu]   = useState(false)
  const [showPosOverlay, setShowPosOverlay]= useState(true)
  const [currentPos,     setCurrentPos]   = useState(null)

  // Live position update
  const livePos = useWSChannel(`live_position:${symbol}`)
  useEffect(() => {
    if (livePos?.position) setCurrentPos(livePos.position)
    else if (livePos && !livePos.position) setCurrentPos(null)
  }, [livePos])
  useEffect(() => {
    api.getLivePosition(symbol)
      .then(d => setCurrentPos(d.has_position ? d.position : null))
      .catch(() => setCurrentPos(null))
  }, [symbol])

  // ── Init chart once ──────────────────────────────────
  useEffect(() => {
    if (!ref.current) return
    const chart = createChart(ref.current, {
      layout:    { background: { color: '#0d0f14' }, textColor: '#555e75', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 },
      grid:      { vertLines: { color: 'rgba(255,255,255,0.025)' }, horzLines: { color: 'rgba(255,255,255,0.025)' } },
      crosshair: { mode: 1,
        vertLine: { color: 'rgba(255,255,255,0.1)', width: 1, style: 2, labelBackgroundColor: '#191d28' },
        horzLine: { color: 'rgba(255,255,255,0.1)', width: 1, style: 2, labelBackgroundColor: '#191d28' },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.07)' },
      timeScale:       { borderColor: 'rgba(255,255,255,0.07)', timeVisible: true, secondsVisible: false },
    })
    const candle = chart.addCandlestickSeries({
      upColor: '#22c983', downColor: '#e8455a',
      borderVisible: false, wickUpColor: '#22c983', wickDownColor: '#e8455a',
    })
    const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol' })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } })

    const resize = () => {
      if (ref.current) chart.applyOptions({ width: ref.current.clientWidth, height: ref.current.clientHeight })
    }
    resize()
    window.addEventListener('resize', resize)
    chartRef.current  = chart
    candleRef.current = candle
    volRef.current    = vol

    const dl = new DrawingLayer(ref.current, chart, candle)
    dl.onToolEnd = () => setActiveTool(null)
    drawingRef.current = dl

    return () => {
      window.removeEventListener('resize', resize)
      if (intervalRef.current) clearInterval(intervalRef.current)
      dl.destroy()
      chart.remove()
    }
  }, [])

  // ── Load data + start polling ────────────────────────
  useEffect(() => {
    if (!candleRef.current) return
    if (intervalRef.current) clearInterval(intervalRef.current)

    // Reset chart saat simbol/tf ganti
    candleRef.current?.setData([])
    volRef.current?.setData([])
    if (drawingRef.current) drawingRef.current.setOBZones([])
    candlesData.current = []

    let initialized = false
    let cancelled   = false
    const sym       = symbol
    const tf        = timeframe

    const loadFull = async (retryCount = 0) => {
      if (cancelled) return
      try {
        const ohlcvRes = await api.getOHLCV(sym, tf, 500)
        if (cancelled) return
        if (!ohlcvRes?.candles?.length) {
          // Retry sampai 3 kali jika data kosong
          if (retryCount < 3) {
            setTimeout(() => loadFull(retryCount + 1), 1000)
          }
          return
        }

        const candles = ohlcvRes.candles.map(c => ({
          time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
        }))
        const vols = ohlcvRes.candles.map(c => ({
          time: c.time, value: c.volume,
          color: c.close >= c.open ? 'rgba(34,201,131,0.3)' : 'rgba(232,69,90,0.3)',
        }))

        candleRef.current?.setData(candles)
        volRef.current?.setData(vols)
        candlesData.current = candles
        setOhlc(candles[candles.length - 1])
        initialized = true

        // OB zones — fire and forget, tidak block
        api.getStructure(sym).then(strRes => {
          if (cancelled || !strRes?.order_blocks || !drawingRef.current) return
          const cp = strRes.price || 0
          const obs = strRes.order_blocks.filter(o =>
            !o.is_mitigated && o.touch_count <= 5 &&
            Math.abs((o.high + o.low) / 2 - cp) / cp < 0.15
          ).slice(0, 10)
          drawingRef.current.setOBZones(obs)
        }).catch(() => {})

        applyIndicators(candles)
      } catch (e) {
        console.error('Chart loadFull error:', e)
        if (retryCount < 3) {
          setTimeout(() => loadFull(retryCount + 1), 2000)
        }
      }
    }

    const loadUpdate = async () => {
      if (!initialized || cancelled) return
      try {
        const ohlcvRes = await api.getOHLCV(sym, tf, 3)
        if (cancelled || !ohlcvRes?.candles?.length) return

        const raw = ohlcvRes.candles[ohlcvRes.candles.length - 1]
        const last = { time: raw.time, open: raw.open, high: raw.high, low: raw.low, close: raw.close }
        const lastVol = {
          time: raw.time, value: raw.volume,
          color: raw.close >= raw.open ? 'rgba(34,201,131,0.3)' : 'rgba(232,69,90,0.3)'
        }
        candleRef.current?.update(last)
        volRef.current?.update(lastVol)

        const idx = candlesData.current.findIndex(c => c.time === last.time)
        if (idx >= 0) candlesData.current[idx] = last
        else candlesData.current.push(last)
        setOhlc(last)
      } catch {}
    }

    loadFull()
    intervalRef.current = setInterval(loadUpdate, 5000)

    return () => {
      cancelled = true
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [symbol, timeframe])

  // ── Position overlay via canvas ───────────────────────
  useEffect(() => {
    if (!drawingRef.current) return
    if (!currentPos || !showPosOverlay) {
      drawingRef.current.setPosLines([])
      return
    }
    const isLong   = currentPos.side === 'LONG'
    const pnlStr   = `${currentPos.unreal_pnl >= 0 ? '+' : ''}${currentPos.unreal_pnl.toFixed(2)} USDT`
    const lines = [
      {
        price:     currentPos.entry_price,
        color:     currentPos.unreal_pnl >= 0 ? '#22c983' : '#e8455a',
        label:     `ENTRY ${currentPos.side} · ${pnlStr}`,
        lineWidth: 2,
        dashed:    false,
      },
    ]
    if (currentPos.stop_loss) lines.push({ price: currentPos.stop_loss, color: '#e8455a', label: `SL ${fp(currentPos.stop_loss)}`, dashed: true })
    if (currentPos.tp1)       lines.push({ price: currentPos.tp1,       color: '#22c983', label: `TP1 ${fp(currentPos.tp1)}`,      dashed: true })
    if (currentPos.tp2)       lines.push({ price: currentPos.tp2,       color: '#22c983', label: `TP2 ${fp(currentPos.tp2)}`,      dotted: true })
    drawingRef.current.setPosLines(lines)
  }, [currentPos, showPosOverlay])

  // ── Indicators ────────────────────────────────────────
  const applyIndicators = (candles) => {
    const chart = chartRef.current
    if (!chart || !candles?.length) return
    Object.values(indSeriesRef.current).flat().forEach(s => { try { chart.removeSeries(s) } catch {} })
    indSeriesRef.current = {}
    const times = candles.map(x => x.time), closes = candles.map(x => x.close)
    if (indicators.ema20) {
      const s = chart.addLineSeries({ color: '#4a8ff0', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      s.setData(toLineData(times, ema(closes, 20))); indSeriesRef.current.ema20 = [s]
    }
    if (indicators.ema50) {
      const s = chart.addLineSeries({ color: '#e8a020', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      s.setData(toLineData(times, ema(closes, 50))); indSeriesRef.current.ema50 = [s]
    }
    if (indicators.ema200) {
      const s = chart.addLineSeries({ color: '#8c5cf0', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      s.setData(toLineData(times, ema(closes, 200))); indSeriesRef.current.ema200 = [s]
    }
    if (indicators.bb) {
      const bb = bollinger(closes, 20, 2)
      const u = chart.addLineSeries({ color: '#9097ad', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, lineStyle: 2 })
      const b = chart.addLineSeries({ color: '#9097ad', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      const l = chart.addLineSeries({ color: '#9097ad', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, lineStyle: 2 })
      u.setData(toLineData(times, bb.upper))
      b.setData(toLineData(times, bb.basis))
      l.setData(toLineData(times, bb.lower))
      indSeriesRef.current.bb = [u, b, l]
    }
  }
  useEffect(() => { applyIndicators(candlesData.current) }, [indicators])

  const handleTool = (toolId) => {
    const next = activeTool === toolId ? null : toolId
    setActiveTool(next)
    drawingRef.current?.setTool(next)
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-base relative">
      {/* Left toolbar */}
      <div className="w-10 bg-panel border-r border-white/[0.07] flex flex-col items-center py-2 gap-1 shrink-0">
        {DRAW_TOOLS.map(t => (
          <button key={t.id} title={t.title} onClick={() => handleTool(t.id)}
            className={`w-8 h-8 rounded flex items-center justify-center text-sm transition-colors
              ${activeTool === t.id
                ? 'bg-blue/15 text-blue border border-blue/30'
                : 'text-t2 hover:text-t1 hover:bg-elev border border-transparent'}`}>
            {t.label}
          </button>
        ))}
        <div className="h-px w-6 bg-white/[0.07] my-1" />
        <button
          title={showPosOverlay ? 'Sembunyikan posisi (⊕)' : 'Tampilkan posisi (⊕)'}
          onClick={() => setShowPosOverlay(v => !v)}
          className={`w-8 h-8 rounded flex items-center justify-center text-sm transition-colors border
            ${showPosOverlay ? 'bg-green/10 text-green border-green/30' : 'text-t3 border-transparent hover:bg-elev'}`}>
          ⊕
        </button>
        <div className="flex-1" />
        <button title="Hapus drawing terakhir / yang dipilih (atau tekan Delete)" onClick={() => drawingRef.current?.removeLast()}
          className="w-8 h-8 rounded flex items-center justify-center text-sm text-t2 hover:text-t1 hover:bg-elev" title="Undo (↶)">↶</button>
        <button title="Hapus semua drawing" onClick={() => drawingRef.current?.clear()}
          className="w-8 h-8 rounded flex items-center justify-center text-sm text-t2 hover:text-red hover:bg-elev">✕</button>
      </div>

      {/* Chart area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar atas */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2 mr-3">
            <div className="w-2 h-2 rounded-full pulse-dot bg-green" />
            <span className="font-semibold text-t1 text-sm">{symbol.replace('/', ' / ')}</span>
          </div>
          {ohlc && (
            <div className="flex items-center gap-3 text-xs mono mr-3">
              <span className="text-t3">O <span className="text-t1">{fp(ohlc.open)}</span></span>
              <span className="text-t3">H <span className="text-green">{fp(ohlc.high)}</span></span>
              <span className="text-t3">L <span className="text-red">{fp(ohlc.low)}</span></span>
              <span className="text-t3">C <span className="text-t1">{fp(ohlc.close)}</span></span>
            </div>
          )}
          {currentPos && showPosOverlay && (
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs mono
              ${currentPos.unreal_pnl >= 0 ? 'bg-green/8 border-green/25 text-green' : 'bg-red/8 border-red/25 text-red'}`}>
              <span>{currentPos.side}</span>
              <span className="opacity-40">·</span>
              <span>{currentPos.unreal_pnl >= 0 ? '+' : ''}{currentPos.unreal_pnl.toFixed(2)} USDT</span>
            </div>
          )}
          <div className="flex-1" />

          {/* Tip drawing */}
          {activeTool && (
            <span className="text-[10px] text-blue px-2 py-1 bg-blue/5 border border-blue/20 rounded">
              {activeTool === 'hline' ? 'Klik 1 titik' : 'Klik 2 titik'} · Esc untuk batal
            </span>
          )}

          <div className="relative">
            <button onClick={() => setShowIndMenu(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-white/[0.07] text-t2 hover:text-t1 hover:bg-elev">
              <span>ƒ</span><span>Indicators</span>
            </button>
            {showIndMenu && (
              <div className="absolute top-full right-0 mt-1 z-20 bg-panel border border-white/[0.1] rounded-lg shadow-xl min-w-[170px] py-1">
                {INDICATORS.map(ind => (
                  <button key={ind.id}
                    onClick={() => { setIndicators(p => ({ ...p, [ind.id]: !p[ind.id] })); setShowIndMenu(false) }}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-elev">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: ind.color }} />
                      <span className={indicators[ind.id] ? 'text-t1' : 'text-t2'}>{ind.label}</span>
                    </div>
                    <span className={`text-[10px] ${indicators[ind.id] ? 'text-green' : 'text-t3'}`}>
                      {indicators[ind.id] ? 'ON' : 'OFF'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-0.5 ml-1">
            {TFS.map(tf => (
              <button key={tf} onClick={() => setTf(tf)}
                className={`px-2.5 py-1 text-xs rounded mono transition-colors
                  ${tf === timeframe ? 'bg-green/10 text-green border border-green/20' : 'text-t3 hover:text-t2 hover:bg-elev'}`}>
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Chart canvas */}
        <div className="flex-1 relative">
          <div ref={ref} className="absolute inset-0" />
        </div>
      </div>
    </div>
  )
}
