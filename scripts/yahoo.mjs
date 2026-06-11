// Shared Yahoo Finance chart-API helpers for the data pipeline.
// The v8 chart endpoint is the only keyless Yahoo endpoint that still works
// server-side (v7/quoteSummary require crumb auth). It is NOT CORS-open, so it
// must never be called from the browser — only from these Node scripts.

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'
const HEADERS = { accept: 'application/json', 'user-agent': 'stock-command-center/1.0 (github.com/jz237/stock-command-center)' }

export async function fetchChart(symbol, range, interval, { retries = 2 } = {}) {
  const url = `${BASE}/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`
  let lastError
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15_000) })
      if (response.status === 429) throw new Error(`rate limited (429)`)
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
      const payload = await response.json()
      const result = payload?.chart?.result?.[0]
      if (!result?.meta) throw new Error(`malformed payload: ${JSON.stringify(payload?.chart?.error || payload).slice(0, 200)}`)
      return result
    } catch (error) {
      lastError = error
      if (attempt < retries) await sleep(1_000 * (attempt + 1))
    }
  }
  throw new Error(`${symbol} ${range}/${interval}: ${lastError instanceof Error ? lastError.message : lastError}`)
}

// Extract clean OHLCV rows from a chart result. Bars with any missing OHLC
// component are dropped rather than patched — no fabricated data.
export function extractRows(result, { dateOnly = false } = {}) {
  const timestamps = result.timestamp || []
  const quote = result.indicators?.quote?.[0] || {}
  const rows = []
  for (let i = 0; i < timestamps.length; i += 1) {
    const open = Number(quote.open?.[i])
    const high = Number(quote.high?.[i])
    const low = Number(quote.low?.[i])
    const close = Number(quote.close?.[i])
    if (![open, high, low, close].every((v) => Number.isFinite(v) && v > 0)) continue
    const volume = Number(quote.volume?.[i])
    rows.push({
      time: dateOnly ? isoDate(timestamps[i], result.meta.gmtoffset || 0) : timestamps[i],
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: Number.isFinite(volume) ? volume : 0,
    })
  }
  return rows
}

export function isoDate(unixSeconds, gmtoffset = 0) {
  return new Date((unixSeconds + gmtoffset) * 1000).toISOString().slice(0, 10)
}

export function round(value, digits = 4) {
  // 4 significant decimals is plenty for display; keeps JSON compact.
  return Number(Number(value).toFixed(value >= 100 ? 2 : digits))
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
