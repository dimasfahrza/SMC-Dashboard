// Technical Indicators Calculator
// Dipakai untuk overlay di chart

export function sma(values, period) {
  const out = []
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(null); continue }
    let sum = 0
    for (let j = 0; j < period; j++) sum += values[i - j]
    out.push(sum / period)
  }
  return out
}

export function ema(values, period) {
  const out = []
  const k = 2 / (period + 1)
  let prev = null
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(null); continue }
    if (prev == null) {
      let sum = 0
      for (let j = 0; j < period; j++) sum += values[i - j]
      prev = sum / period
    } else {
      prev = values[i] * k + prev * (1 - k)
    }
    out.push(prev)
  }
  return out
}

export function rsi(values, period = 14) {
  const out = []
  let avgGain = 0, avgLoss = 0

  for (let i = 0; i < values.length; i++) {
    if (i === 0) { out.push(null); continue }
    const diff = values[i] - values[i - 1]
    const gain = Math.max(diff, 0)
    const loss = Math.max(-diff, 0)

    if (i < period) {
      avgGain += gain
      avgLoss += loss
      if (i === period - 1) {
        avgGain /= period
        avgLoss /= period
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
        out.push(100 - 100 / (1 + rs))
      } else {
        out.push(null)
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period
      avgLoss = (avgLoss * (period - 1) + loss) / period
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
      out.push(100 - 100 / (1 + rs))
    }
  }
  return out
}

export function macd(values, fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(values, fast)
  const emaSlow = ema(values, slow)
  const macdLine = values.map((_, i) =>
    (emaFast[i] != null && emaSlow[i] != null) ? emaFast[i] - emaSlow[i] : null
  )
  const macdValid = macdLine.filter(v => v != null)
  const signalValid = ema(macdValid, signal)
  const signalLine = []
  let idx = 0
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] == null) { signalLine.push(null); continue }
    signalLine.push(signalValid[idx] ?? null)
    idx++
  }
  const histogram = macdLine.map((v, i) =>
    (v != null && signalLine[i] != null) ? v - signalLine[i] : null
  )
  return { macd: macdLine, signal: signalLine, histogram }
}

export function bollinger(values, period = 20, stdDev = 2) {
  const basis = sma(values, period)
  const upper = [], lower = []
  for (let i = 0; i < values.length; i++) {
    if (basis[i] == null) { upper.push(null); lower.push(null); continue }
    let sqSum = 0
    for (let j = 0; j < period; j++) {
      sqSum += (values[i - j] - basis[i]) ** 2
    }
    const sd = Math.sqrt(sqSum / period)
    upper.push(basis[i] + sd * stdDev)
    lower.push(basis[i] - sd * stdDev)
  }
  return { basis, upper, lower }
}

// Helper — pair values dengan time untuk lightweight-charts
export function toLineData(times, values) {
  return times
    .map((t, i) => values[i] != null ? { time: t, value: values[i] } : null)
    .filter(Boolean)
}
