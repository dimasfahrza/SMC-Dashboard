/**
 * Drawing Tools Layer v2
 *
 * Fitur:
 *   - trend line, horizontal line, rectangle, fibonacci
 *   - OB zones sebagai kotak transparan
 *   - Drag untuk pindahkan drawing
 *   - Hit detection yang akurat (klik untuk select, drag untuk pindah)
 *   - Delete dengan tombol Delete/Backspace saat selected
 */

const HIT_RADIUS = 8   // px untuk hit detection
const HANDLE_R   = 5   // px radius handle dot

export class DrawingLayer {
  constructor(container, chart, series) {
    this.container = container
    this.chart     = chart
    this.series    = series

    this.canvas = document.createElement('canvas')
    this.canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:5;'
    container.appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d')

    this.drawings    = []     // user drawings
    this.obZones     = []     // OB zones dari backend
    this.posLines    = []     // posisi entry/sl/tp
    this.activeTool  = null
    this.tempPoints  = []
    this.tempCursor  = null
    this.selected    = null   // index drawing yang selected
    this.dragging    = null   // { idx, pointIdx, startX, startY, origPoints }
    this.onToolEnd   = null

    // Subscribe chart events
    this.chart.timeScale().subscribeVisibleTimeRangeChange(() => this.render())
    this.chart.subscribeCrosshairMove(() => this.render())

    // Bind methods
    this._onMouseDown = this._onMouseDown.bind(this)
    this._onMouseMove = this._onMouseMove.bind(this)
    this._onMouseUp   = this._onMouseUp.bind(this)
    this._onClick     = this._onClick.bind(this)
    this._onKeyDown   = this._onKeyDown.bind(this)

    container.addEventListener('mousedown', this._onMouseDown)
    container.addEventListener('mousemove', this._onMouseMove)
    container.addEventListener('mouseup',   this._onMouseUp)
    container.addEventListener('click',     this._onClick)
    window.addEventListener('keydown',      this._onKeyDown)

    this._ro = new ResizeObserver(() => this._resize())
    this._ro.observe(container)
    this._resize()
  }

  // ── Public API ─────────────────────────────────────────
  setTool(tool) {
    this.activeTool = tool
    this.tempPoints = []
    this.selected   = null
    this.canvas.style.pointerEvents = tool ? 'auto' : 'none'
    this.canvas.style.cursor = tool ? 'crosshair' : 'default'
    this.render()
  }

  setOBZones(obs) {
    // obs: [{type, high, low, timestamp, is_fresh, touch_count}]
    this.obZones = obs || []
    this.render()
  }

  setPosLines(lines) {
    // lines: [{price, color, label, lineStyle}]
    this.posLines = lines || []
    this.render()
  }

  clear() {
    this.drawings = []
    this.selected = null
    this.render()
  }

  removeLast() {
    if (this.selected !== null) {
      this.drawings.splice(this.selected, 1)
      this.selected = null
    } else {
      this.drawings.pop()
    }
    this.render()
  }

  destroy() {
    this.container.removeEventListener('mousedown', this._onMouseDown)
    this.container.removeEventListener('mousemove', this._onMouseMove)
    this.container.removeEventListener('mouseup',   this._onMouseUp)
    this.container.removeEventListener('click',     this._onClick)
    window.removeEventListener('keydown', this._onKeyDown)
    this._ro.disconnect()
    this.canvas.remove()
  }

  // ── Coordinate helpers ─────────────────────────────────
  _resize() {
    const rect = this.container.getBoundingClientRect()
    const dpr  = window.devicePixelRatio || 1
    this.canvas.width  = rect.width  * dpr
    this.canvas.height = rect.height * dpr
    this.canvas.style.width  = rect.width  + 'px'
    this.canvas.style.height = rect.height + 'px'
    this.ctx.scale(dpr, dpr)
    this.render()
  }

  _toXY(pt) {
    const x = this.chart.timeScale().timeToCoordinate(pt.time)
    const y = this.series.priceToCoordinate(pt.price)
    return { x, y }
  }

  _fromXY(x, y) {
    const time  = this.chart.timeScale().coordinateToTime(x)
    const price = this.series.coordinateToPrice(y)
    return { time, price }
  }

  _priceToY(price) { return this.series.priceToCoordinate(price) }
  _W() { return parseInt(this.canvas.style.width) }
  _H() { return parseInt(this.canvas.style.height) }

  _evPos(e) {
    const rect = this.container.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  // ── Hit detection ──────────────────────────────────────
  _hitTest(x, y) {
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const d = this.drawings[i]
      if (this._hitDrawing(d, x, y)) return i
    }
    return null
  }

  _hitDrawing(d, x, y) {
    if (d.type === 'hline') {
      const pt = this._toXY(d.points[0])
      if (pt.y == null) return false
      return Math.abs(y - pt.y) < HIT_RADIUS
    }
    if (d.type === 'trend') {
      const a = this._toXY(d.points[0])
      const b = this._toXY(d.points[1])
      if (a.x == null || b.x == null) return false
      return _distToSegment(x, y, a.x, a.y, b.x, b.y) < HIT_RADIUS
    }
    if (d.type === 'rect' || d.type === 'fib') {
      const a = this._toXY(d.points[0])
      const b = this._toXY(d.points[1])
      if (a.x == null || b.x == null) return false
      const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x)
      const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y)
      // Hit inside rect or near border
      return x >= minX - HIT_RADIUS && x <= maxX + HIT_RADIUS &&
             y >= minY - HIT_RADIUS && y <= maxY + HIT_RADIUS
    }
    return false
  }

  _hitHandle(d, x, y) {
    // Return index of handle point that's near cursor, or null
    for (let i = 0; i < d.points.length; i++) {
      const pt = this._toXY(d.points[i])
      if (pt.x == null) continue
      if (Math.hypot(x - pt.x, y - pt.y) < HANDLE_R + 4) return i
    }
    return null
  }

  // ── Mouse events ───────────────────────────────────────
  _onMouseDown(e) {
    const { x, y } = this._evPos(e)
    if (this.activeTool) return   // drawing mode handles in _onClick

    const hitIdx = this._hitTest(x, y)
    if (hitIdx !== null) {
      this.selected = hitIdx
      const d = this.drawings[hitIdx]
      const hIdx = this._hitHandle(d, x, y)
      this.dragging = {
        idx: hitIdx,
        pointIdx: hIdx,   // null = drag whole shape
        startX: x, startY: y,
        origPoints: d.points.map(p => ({ ...p })),
      }
      this.canvas.style.cursor = 'grabbing'
      this.render()
      e.stopPropagation()
    } else {
      this.selected = null
      this.render()
    }
  }

  _onMouseMove(e) {
    const { x, y } = this._evPos(e)

    // Update temp cursor while drawing
    if (this.activeTool && this.tempPoints.length > 0) {
      this.tempCursor = { x, y }
      this.render()
      return
    }

    // Drag
    if (this.dragging) {
      const dx = x - this.dragging.startX
      const dy = y - this.dragging.startY
      const d  = this.drawings[this.dragging.idx]

      if (this.dragging.pointIdx !== null) {
        // Move single handle
        const pt = this._fromXY(
          this._toXY(this.dragging.origPoints[this.dragging.pointIdx]).x + dx,
          this._toXY(this.dragging.origPoints[this.dragging.pointIdx]).y + dy,
        )
        if (pt.time && pt.price) {
          d.points[this.dragging.pointIdx] = pt
        }
      } else {
        // Move whole shape
        d.points = this.dragging.origPoints.map(p => {
          const orig = this._toXY(p)
          if (orig.x == null) return p
          const np = this._fromXY(orig.x + dx, orig.y + dy)
          return (np.time && np.price) ? np : p
        })
      }
      this.render()
      return
    }

    // Hover cursor
    if (!this.activeTool) {
      const hit = this._hitTest(x, y)
      if (hit !== null) {
        const d = this.drawings[hit]
        const hIdx = this._hitHandle(d, x, y)
        this.canvas.style.pointerEvents = 'auto'
        this.canvas.style.cursor = hIdx !== null ? 'nwse-resize' : 'grab'
      } else {
        this.canvas.style.pointerEvents = 'none'
        this.canvas.style.cursor = 'default'
      }
    }
  }

  _onMouseUp(e) {
    if (this.dragging) {
      this.dragging = null
      this.canvas.style.cursor = this.selected !== null ? 'grab' : 'default'
    }
  }

  _onClick(e) {
    if (!this.activeTool) return
    const { x, y } = this._evPos(e)
    const pt = this._fromXY(x, y)
    if (!pt.time || !pt.price) return

    this.tempPoints.push(pt)

    const COLORS = { trend: '#22c983', hline: '#4a8ff0', rect: '#8c5cf0', fib: '#e8a020' }

    if (this.activeTool === 'hline' || this.tempPoints.length === 2) {
      this.drawings.push({
        type:   this.activeTool,
        points: [...this.tempPoints],
        color:  COLORS[this.activeTool] || '#4a8ff0',
      })
      this.tempPoints  = []
      this.activeTool  = null
      this.canvas.style.pointerEvents = 'none'
      this.canvas.style.cursor = 'default'
      this.onToolEnd?.()
    }
    this.render()
  }

  _onKeyDown(e) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected !== null) {
      // Only if chart is focused area
      if (this.container.matches(':hover') || this.canvas.matches(':hover')) {
        this.drawings.splice(this.selected, 1)
        this.selected = null
        this.render()
        e.preventDefault()
      }
    }
    if (e.key === 'Escape') {
      this.activeTool = null
      this.tempPoints = []
      this.canvas.style.pointerEvents = 'none'
      this.canvas.style.cursor = 'default'
      this.onToolEnd?.()
      this.render()
    }
  }

  // ── Render ─────────────────────────────────────────────
  render() {
    const W = this._W(), H = this._H()
    this.ctx.clearRect(0, 0, W, H)

    // 1. OB Zones (kotak transparan)
    this._renderOBZones()

    // 2. Position lines
    this._renderPosLines()

    // 3. User drawings
    this.drawings.forEach((d, i) => this._renderDrawing(d, i === this.selected))

    // 4. Preview saat drawing
    this._renderPreview()
  }

  _renderOBZones() {
    if (!this.obZones.length) return
    const W = this._W()

    this.obZones.forEach(ob => {
      const yHigh = this._priceToY(ob.high)
      const yLow  = this._priceToY(ob.low)
      if (yHigh == null || yLow == null) return

      const isBear = ob.type === 'BEARISH'
      const alpha  = ob.is_fresh ? 0.18 : 0.10

      // Fill kotak
      this.ctx.fillStyle = isBear
        ? `rgba(232,69,90,${alpha})`
        : `rgba(34,201,131,${alpha})`
      this.ctx.fillRect(0, Math.min(yHigh, yLow), W, Math.abs(yHigh - yLow))

      // Border tipis
      this.ctx.strokeStyle = isBear
        ? `rgba(232,69,90,${alpha * 2.5})`
        : `rgba(34,201,131,${alpha * 2.5})`
      this.ctx.lineWidth = 1
      this.ctx.setLineDash([])
      this.ctx.strokeRect(0, Math.min(yHigh, yLow), W, Math.abs(yHigh - yLow))

      // Label kecil di kanan
      const label = `OB ${ob.type === 'BEARISH' ? '↓' : '↑'}${ob.is_fresh ? '' : ` ${ob.touch_count}×`}`
      this.ctx.fillStyle = isBear ? 'rgba(232,69,90,0.7)' : 'rgba(34,201,131,0.7)'
      this.ctx.font = '10px JetBrains Mono, monospace'
      this.ctx.textAlign = 'right'
      this.ctx.fillText(label, W - 8, Math.min(yHigh, yLow) + 12)
      this.ctx.textAlign = 'left'
    })
  }

  _renderPosLines() {
    if (!this.posLines.length) return
    const W = this._W()

    this.posLines.forEach(line => {
      const y = this._priceToY(line.price)
      if (y == null) return

      this.ctx.strokeStyle = line.color
      this.ctx.lineWidth   = line.lineWidth || 1.5
      this.ctx.setLineDash(line.dashed ? [6, 3] : line.dotted ? [2, 4] : [])
      this.ctx.beginPath()
      this.ctx.moveTo(0, y)
      this.ctx.lineTo(W, y)
      this.ctx.stroke()
      this.ctx.setLineDash([])

      // Label
      if (line.label) {
        const pad = 6
        const tw  = this.ctx.measureText(line.label).width + pad * 2
        this.ctx.fillStyle = line.color
        this.ctx.globalAlpha = 0.15
        this.ctx.fillRect(W - tw - 4, y - 9, tw + 4, 18)
        this.ctx.globalAlpha = 1
        this.ctx.fillStyle = line.color
        this.ctx.font = '10px JetBrains Mono, monospace'
        this.ctx.textAlign = 'right'
        this.ctx.fillText(line.label, W - 6, y + 3.5)
        this.ctx.textAlign = 'left'
      }
    })
  }

  _renderDrawing(d, isSelected) {
    const ctx = this.ctx
    ctx.lineWidth   = isSelected ? 2 : 1.5
    ctx.strokeStyle = isSelected ? '#fff' : d.color
    ctx.fillStyle   = d.color + '20'
    ctx.setLineDash([])

    if (d.type === 'hline') {
      const pt = this._toXY(d.points[0])
      if (pt.y == null) return
      const W = this._W()
      ctx.setLineDash([6, 3])
      ctx.beginPath(); ctx.moveTo(0, pt.y); ctx.lineTo(W, pt.y); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = d.color
      ctx.font = '10px JetBrains Mono, monospace'
      ctx.fillText(d.points[0].price.toFixed(4), 8, pt.y - 4)
      if (isSelected) this._drawHandle(pt.x ?? this._W() / 2, pt.y)
    }

    else if (d.type === 'trend') {
      const a = this._toXY(d.points[0])
      const b = this._toXY(d.points[1])
      if (a.x == null || b.x == null) return
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      ctx.fillStyle = d.color
      ctx.beginPath(); ctx.arc(a.x, a.y, 3, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill()
      if (isSelected) { this._drawHandle(a.x, a.y); this._drawHandle(b.x, b.y) }
    }

    else if (d.type === 'rect') {
      const a = this._toXY(d.points[0])
      const b = this._toXY(d.points[1])
      if (a.x == null || b.x == null) return
      const rx = Math.min(a.x, b.x), ry = Math.min(a.y, b.y)
      const rw = Math.abs(b.x - a.x),  rh = Math.abs(b.y - a.y)
      ctx.fillStyle = d.color + '18'
      ctx.fillRect(rx, ry, rw, rh)
      ctx.strokeRect(rx, ry, rw, rh)
      if (isSelected) {
        this._drawHandle(a.x, a.y); this._drawHandle(b.x, a.y)
        this._drawHandle(a.x, b.y); this._drawHandle(b.x, b.y)
      }
    }

    else if (d.type === 'fib') {
      const a  = this._toXY(d.points[0])
      const b  = this._toXY(d.points[1])
      if (a.x == null || b.x == null) return
      const pH = Math.max(d.points[0].price, d.points[1].price)
      const pL = Math.min(d.points[0].price, d.points[1].price)
      const xS = Math.min(a.x, b.x), xE = Math.max(a.x, b.x)
      const LEVELS = [
        [0,     '#9097ad'], [0.236, '#e8a020'], [0.382, '#e8a020'],
        [0.5,   '#22c983'], [0.618, '#e8455a'], [0.786, '#e8a020'],
        [1.0,   '#9097ad'],
      ]
      ctx.font = '10px JetBrains Mono, monospace'
      LEVELS.forEach(([lvl, color]) => {
        const p = pH - (pH - pL) * lvl
        const y = this._priceToY(p)
        if (y == null) return
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([4, 3])
        ctx.beginPath(); ctx.moveTo(xS, y); ctx.lineTo(xE, y); ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = color
        ctx.fillText(`${(lvl * 100).toFixed(1)}% · ${p.toFixed(4)}`, xE + 5, y + 3)
      })
      ctx.strokeStyle = d.color; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      if (isSelected) { this._drawHandle(a.x, a.y); this._drawHandle(b.x, b.y) }
    }
  }

  _drawHandle(x, y) {
    this.ctx.fillStyle   = '#ffffff'
    this.ctx.strokeStyle = '#4a8ff0'
    this.ctx.lineWidth   = 1.5
    this.ctx.setLineDash([])
    this.ctx.beginPath()
    this.ctx.arc(x, y, HANDLE_R, 0, Math.PI * 2)
    this.ctx.fill()
    this.ctx.stroke()
  }

  _renderPreview() {
    if (!this.activeTool || !this.tempPoints.length || !this.tempCursor) return
    const first = this._toXY(this.tempPoints[0])
    if (first.x == null) return

    this.ctx.strokeStyle = 'rgba(74,143,240,0.6)'
    this.ctx.lineWidth   = 1.5
    this.ctx.setLineDash([5, 4])

    const { x, y } = this.tempCursor

    if (this.activeTool === 'hline') {
      const W = this._W()
      this.ctx.beginPath(); this.ctx.moveTo(0, first.y); this.ctx.lineTo(W, first.y); this.ctx.stroke()
    } else if (this.activeTool === 'trend') {
      this.ctx.beginPath(); this.ctx.moveTo(first.x, first.y); this.ctx.lineTo(x, y); this.ctx.stroke()
    } else if (this.activeTool === 'rect') {
      this.ctx.strokeRect(first.x, first.y, x - first.x, y - first.y)
      this.ctx.fillStyle = 'rgba(140,92,240,0.08)'
      this.ctx.fillRect(first.x, first.y, x - first.x, y - first.y)
    } else if (this.activeTool === 'fib') {
      this.ctx.beginPath(); this.ctx.moveTo(first.x, first.y); this.ctx.lineTo(x, y); this.ctx.stroke()
    }
    this.ctx.setLineDash([])

    // First point dot
    this.ctx.fillStyle = '#4a8ff0'
    this.ctx.beginPath(); this.ctx.arc(first.x, first.y, 4, 0, Math.PI * 2); this.ctx.fill()
  }
}

// ── Geometry helpers ──────────────────────────────────
function _distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
