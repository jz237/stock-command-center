// Regenerates public/data/history.json + data/history.json with REAL OHLCV
// candles from the Yahoo Finance chart API (server-side only; not CORS-open).
//
// Per symbol it stores five real series, keyed by the Yahoo data symbol:
//   i1d  — 5-minute bars, current/last session   (chart range 1D)
//   i5d  — 30-minute bars, last five sessions    (chart range 5D)
//   d1y  — daily bars, one year                  (ranges 1M/3M/6M/YTD/1Y, sliced client-side)
//   w5y  — weekly bars, five years               (range 5Y)
//   mmax — monthly bars, full listing history    (range MAX)
//
// Rows are stored as compact arrays [time, open, high, low, close, volume].
// Nothing is interpolated or "densified" — bars come straight from the API,
// and bars with missing OHLC data are dropped.
//
// Validation is strict: if ANY symbol/series fails, nothing is written and the
// script exits non-zero, so stale-but-consistent data is never replaced by
// partial garbage.

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fetchChart, extractRows, isoDate, sleep } from './yahoo.mjs'

const root = process.cwd()
const stocksFile = path.join(root, 'data', 'stocks.json')
const outputFiles = [
  path.join(root, 'data', 'history.json'),
  path.join(root, 'public', 'data', 'history.json'),
]

const SERIES = [
  { key: 'i1d', range: '1d', interval: '5m', dateOnly: false, minRows: 5 },
  { key: 'i5d', range: '5d', interval: '30m', dateOnly: false, minRows: 20 },
  { key: 'd1y', range: '1y', interval: '1d', dateOnly: true, minRows: 30 },
  { key: 'w5y', range: '5y', interval: '1wk', dateOnly: true, minRows: 20 },
  { key: 'mmax', range: 'max', interval: '1mo', dateOnly: true, minRows: 6 },
]

function toCompact(rows) {
  return rows.map((row) => [row.time, row.open, row.high, row.low, row.close, row.volume])
}

function latestSessionRows(result) {
  const rows = extractRows(result)
  const gmtoffset = result.meta?.gmtoffset || 0
  const latestDate = rows.at(-1) ? isoDate(rows.at(-1).time, gmtoffset) : null
  if (!latestDate) return rows
  return rows.filter((row) => isoDate(row.time, gmtoffset) === latestDate)
}

async function fetchSeriesRows(displaySymbol, dataSymbol, spec) {
  const result = await fetchChart(dataSymbol, spec.range, spec.interval)
  let rows = extractRows(result, { dateOnly: spec.dateOnly })

  // Some Yahoo index/rate symbols, notably ^TNX, can return an empty 1d/5m
  // chart while 5d/30m is healthy. Use the latest session from that feed so
  // one thin intraday source does not block the whole Pages deploy.
  if (rows.length < spec.minRows && spec.key === 'i1d') {
    const fallback = await fetchChart(dataSymbol, '5d', '30m')
    const fallbackRows = latestSessionRows(fallback)
    if (fallbackRows.length >= spec.minRows) {
      console.warn(`warn ${displaySymbol.padEnd(7)} using 5d/30m latest-session fallback for i1d`)
      rows = fallbackRows
    }
  }

  return rows
}

async function fetchSymbolHistory(displaySymbol, dataSymbol) {
  const series = {}
  for (const spec of SERIES) {
    const rows = await fetchSeriesRows(displaySymbol, dataSymbol, spec)
    if (rows.length < spec.minRows) {
      throw new Error(`${displaySymbol} ${spec.key}: only ${rows.length} usable bars (need ${spec.minRows})`)
    }
    series[spec.key] = rows
    await sleep(150)
  }

  // Cross-series sanity: the latest daily close must agree with the latest
  // intraday close to within 30% — catches symbol mix-ups and split glitches.
  const lastDaily = series.d1y.at(-1).close
  const lastIntraday = series.i1d.at(-1).close
  if (Math.abs(lastDaily - lastIntraday) / lastIntraday > 0.3) {
    throw new Error(`${displaySymbol}: daily close ${lastDaily} disagrees >30% with intraday close ${lastIntraday}`)
  }

  return Object.fromEntries(SERIES.map(({ key }) => [key, toCompact(series[key])]))
}

async function main() {
  const payload = JSON.parse(await readFile(stocksFile, 'utf8'))
  const stocks = Array.isArray(payload) ? payload : payload.stocks || []
  if (!stocks.length) {
    console.error('data/stocks.json has no symbols; aborting.')
    process.exit(1)
  }

  const history = {
    updatedAt: new Date().toISOString(),
    source: 'yahoo-finance-chart',
    format: '[time, open, high, low, close, volume]; i*=unix seconds, others=YYYY-MM-DD',
    symbols: {},
  }

  const failures = []
  for (const stock of stocks) {
    const dataSymbol = stock.dataSymbol || stock.symbol
    try {
      history.symbols[dataSymbol] = await fetchSymbolHistory(stock.symbol, dataSymbol)
      const bars = Object.values(history.symbols[dataSymbol]).reduce((n, rows) => n + rows.length, 0)
      console.log(`ok   ${stock.symbol.padEnd(7)} ${bars} bars`)
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
      console.error(`FAIL ${stock.symbol.padEnd(7)} ${error instanceof Error ? error.message : error}`)
    }
  }

  if (failures.length) {
    console.error(`\n${failures.length}/${stocks.length} symbol(s) failed — refusing to write partial history.`)
    process.exit(1)
  }

  const output = JSON.stringify(history) // compact on purpose: ~25k bars
  await Promise.all(outputFiles.map((file) => writeFile(file, output)))
  console.log(`\nWrote real OHLCV history for ${Object.keys(history.symbols).length} symbols (${(output.length / 1024 / 1024).toFixed(1)} MB).`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
