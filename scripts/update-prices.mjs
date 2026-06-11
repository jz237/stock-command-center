// Refreshes data/stocks.json + public/data/stocks.json from the Yahoo Finance
// chart API (server-side only — the API is not CORS-open, so the browser can
// never fetch it directly; the deployed site reads these JSON files instead).
//
// Every quote field shown in the UI is refreshed together from the same source
// so the file stays internally consistent: price, change, previous close, day
// range, 52-week range, volume, and a sparkline of real daily closes.
// Editorial fields (thesis, risks, opportunities, catalysts, rating,
// confidence) are preserved as-is.
//
// Validation is strict: if ANY symbol fails to fetch or produces values that
// fail the sanity checks, nothing is written and the script exits non-zero.

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fetchChart, extractRows, round, sleep } from './yahoo.mjs'

const root = process.cwd()
const files = [
  path.join(root, 'data', 'stocks.json'),
  path.join(root, 'public', 'data', 'stocks.json'),
]
const forceRun = process.argv.includes('--force')

// Market instruments tracked alongside the equity watchlist. Editorial copy is
// seeded here on first run and preserved afterwards, like equities.
const INSTRUMENT_SEEDS = [
  { symbol: 'S&P', dataSymbol: '^GSPC', name: 'S&P 500', sector: 'Market Index', rating: 'Benchmark', confidence: 100, thesis: 'Broad U.S. large-cap market benchmark.', risks: ['Market-wide risk', 'Rate sensitivity'], opportunities: ['Broad equity exposure', 'Risk appetite proxy'], catalysts: ['Fed commentary', 'Earnings breadth', 'Index flows'] },
  { symbol: 'NASDAQ', dataSymbol: '^IXIC', name: 'Nasdaq Composite', sector: 'Market Index', rating: 'Tech Beta', confidence: 100, thesis: 'Growth and technology-heavy market benchmark.', risks: ['High-duration tech sensitivity', 'AI trade crowding'], opportunities: ['AI/software leadership', 'Liquidity-driven rallies'], catalysts: ['Mega-cap earnings', 'Semiconductor demand', 'Rate moves'] },
  { symbol: 'DOW', dataSymbol: '^DJI', name: 'Dow Jones Industrial Average', sector: 'Market Index', rating: 'Cyclical', confidence: 100, thesis: 'Blue-chip industrial and value-oriented market gauge.', risks: ['Industrial slowdown', 'Defensive rotation'], opportunities: ['Value catch-up', 'Dividend stability'], catalysts: ['Industrial data', 'Bank/healthcare moves'] },
  { symbol: 'VIX', dataSymbol: '^VIX', name: 'CBOE Volatility Index', sector: 'Volatility', rating: 'Fear Gauge', confidence: 100, thesis: 'Options-market stress gauge; lower usually means calmer equity conditions.', risks: ['Sudden risk-off spike', 'Event volatility'], opportunities: ['Calm-market confirmation', 'Hedge timing signal'], catalysts: ['Macro shocks', 'Fed surprises', 'Earnings events'] },
  { symbol: '10Y', dataSymbol: '^TNX', name: 'U.S. 10-Year Treasury Yield', sector: 'Rates', rating: 'Rates', confidence: 100, thesis: 'The key long-rate signal for growth stock pressure and valuation appetite.', risks: ['Higher yields pressure tech', 'Inflation surprise'], opportunities: ['Lower yields support growth stocks', 'Policy easing signal'], catalysts: ['CPI/PCE', 'Fed speeches', 'Treasury auctions'] },
  { symbol: 'DXY', dataSymbol: 'DX-Y.NYB', name: 'U.S. Dollar Index', sector: 'Currency', rating: 'Dollar', confidence: 100, thesis: 'Dollar strength/weakness proxy for global liquidity and multinational earnings translation.', risks: ['Dollar spike tightens conditions', 'FX translation drag'], opportunities: ['Weaker dollar can help risk assets', 'Global revenue translation support'], catalysts: ['Rate differentials', 'Global growth data'] },
  { symbol: 'BTC', dataSymbol: 'BTC-USD', name: 'Bitcoin', sector: 'Crypto', rating: 'Risk Appetite', confidence: 100, thesis: 'High-beta liquidity and risk-appetite signal.', risks: ['Crypto volatility', 'Regulatory shock'], opportunities: ['Liquidity expansion signal', 'Institutional flow'], catalysts: ['ETF flows', 'Dollar/yield moves'] },
  { symbol: 'WTI', dataSymbol: 'CL=F', name: 'WTI Crude Oil', sector: 'Commodities', rating: 'Inflation Input', confidence: 100, thesis: 'Oil price signal for inflation pressure and energy/geopolitical risk.', risks: ['Inflation pressure', 'Supply shock'], opportunities: ['Demand strength signal', 'Energy-sector support'], catalysts: ['OPEC', 'Inventory data', 'Geopolitics'] },
  { symbol: 'GOLD', dataSymbol: 'GC=F', name: 'Gold Futures', sector: 'Commodities', rating: 'Hedge', confidence: 100, thesis: 'Safe-haven and real-rate sensitivity signal.', risks: ['Real yields rising', 'Dollar strength'], opportunities: ['Hedge demand', 'Lower-rate support'], catalysts: ['Real yields', 'Central-bank buying', 'Geopolitical risk'] },
]

const EDITORIAL_FIELDS = ['name', 'sector', 'rating', 'confidence', 'thesis', 'risks', 'opportunities', 'catalysts']

// ---------------------------------------------------------------------------
// NYSE trading-window gate (kept from the original script).
function getNewYorkParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date)
  return Object.fromEntries(parts.map((part) => [part.type, part.value]))
}

function nthWeekdayOfMonth(year, month, weekday, nth) {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const firstDow = first.getUTCDay()
  const day = 1 + ((weekday - firstDow + 7) % 7) + (nth - 1) * 7
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function lastWeekdayOfMonth(year, month, weekday) {
  const last = new Date(Date.UTC(year, month, 0))
  const lastDow = last.getUTCDay()
  const day = last.getUTCDate() - ((lastDow - weekday + 7) % 7)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function easterDate(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

function ymd(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function observedFixedHoliday(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day))
  const dow = d.getUTCDay()
  if (dow === 6) d.setUTCDate(day - 1)
  if (dow === 0) d.setUTCDate(day + 1)
  return ymd(d)
}

function nyseHolidaySet(year) {
  const easter = easterDate(year)
  const goodFriday = new Date(easter)
  goodFriday.setUTCDate(easter.getUTCDate() - 2)
  return new Set([
    observedFixedHoliday(year, 1, 1),
    nthWeekdayOfMonth(year, 1, 1, 3),
    nthWeekdayOfMonth(year, 2, 1, 3),
    ymd(goodFriday),
    lastWeekdayOfMonth(year, 5, 1),
    observedFixedHoliday(year, 6, 19),
    observedFixedHoliday(year, 7, 4),
    nthWeekdayOfMonth(year, 9, 1, 1),
    nthWeekdayOfMonth(year, 11, 4, 4),
    observedFixedHoliday(year, 12, 25),
  ])
}

function isTradingWindow(date = new Date()) {
  const p = getNewYorkParts(date)
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return false
  if (nyseHolidaySet(Number(p.year)).has(`${p.year}-${p.month}-${p.day}`)) return false
  const minutes = Number(p.hour) * 60 + Number(p.minute)
  // US regular session: 9:30 AM through 4:00 PM New York time.
  return minutes >= 9 * 60 + 30 && minutes <= 16 * 60
}

// ---------------------------------------------------------------------------

async function fetchQuote(entry) {
  const symbol = entry.dataSymbol || entry.symbol
  // Two requests per symbol from the same API: the 1d call carries the
  // authoritative quote meta; the 3mo daily call provides a real sparkline and
  // a cross-check that the quote isn't a one-off glitch.
  const intraday = await fetchChart(symbol, '1d', '1m')
  await sleep(150)
  const quarter = await fetchChart(symbol, '3mo', '1d')

  const meta = intraday.meta
  const price = Number(meta.regularMarketPrice)
  const prevClose = Number(meta.previousClose ?? meta.chartPreviousClose)
  const dailyRows = extractRows(quarter, { dateOnly: true })
  const closes = dailyRows.map((row) => row.close)

  const errors = []
  if (!Number.isFinite(price) || price <= 0) errors.push(`bad price ${meta.regularMarketPrice}`)
  if (!Number.isFinite(prevClose) || prevClose <= 0) errors.push(`bad prevClose ${prevClose}`)
  if (closes.length < 10) errors.push(`only ${closes.length} daily closes in 3mo window`)

  const change = ((price - prevClose) / prevClose) * 100
  const changeCap = entry.sector === 'Volatility' ? 75 : 40
  if (Math.abs(change) > changeCap) errors.push(`daily change ${change.toFixed(1)}% exceeds ±${changeCap}% sanity cap`)

  const lastClose = closes.at(-1)
  if (lastClose && Math.abs(price - lastClose) / price > 0.3) {
    errors.push(`quote ${price} disagrees >30% with latest daily close ${lastClose}`)
  }

  const marketTime = Number(meta.regularMarketTime)
  if (!Number.isFinite(marketTime) || Date.now() / 1000 - marketTime > 7 * 86_400) {
    errors.push(`stale quote: regularMarketTime ${marketTime ? new Date(marketTime * 1000).toISOString() : 'missing'}`)
  }

  // 52-week range from the quote meta, expanded so it always contains the
  // current price and the observed 3-month closes (internal consistency).
  let lo = Number(meta.fiftyTwoWeekLow)
  let hi = Number(meta.fiftyTwoWeekHigh)
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo <= 0 || hi <= 0 || lo > hi) {
    lo = Math.min(...closes)
    hi = Math.max(...closes)
  }
  lo = Math.min(lo, price, ...closes)
  hi = Math.max(hi, price, ...closes)
  if (hi / lo > 150) errors.push(`52w range [${lo}, ${hi}] spread implausible`)

  if (errors.length) throw new Error(`${entry.symbol}: ${errors.join('; ')}`)

  const volume = Number(meta.regularMarketVolume)
  return {
    price: round(price),
    change: Number(change.toFixed(2)),
    changeAmount: round(price - prevClose),
    prevClose: round(prevClose),
    dayLow: Number.isFinite(Number(meta.regularMarketDayLow)) ? round(Number(meta.regularMarketDayLow)) : null,
    dayHigh: Number.isFinite(Number(meta.regularMarketDayHigh)) ? round(Number(meta.regularMarketDayHigh)) : null,
    range52w: [round(lo), round(hi)],
    volume: Number.isFinite(volume) && volume > 0 ? volume : null,
    currency: meta.currency || 'USD',
    exchange: meta.fullExchangeName || meta.exchangeName || null,
    chart: closes.slice(-60),
    name: entry.name || meta.longName || meta.shortName || entry.symbol,
    quoteSource: 'yahoo-finance-chart',
    quoteUpdatedAt: new Date(marketTime * 1000).toISOString(),
  }
}

function carryEditorial(target, source) {
  for (const field of EDITORIAL_FIELDS) {
    if (source[field] !== undefined) target[field] = source[field]
  }
  return target
}

async function main() {
  if (!forceRun && !isTradingWindow()) {
    console.log('Market is closed; skipping stock price refresh. (Use --force to override.)')
    return
  }

  const previous = JSON.parse(await readFile(files[0], 'utf8'))
  const previousList = Array.isArray(previous) ? previous : previous.stocks || []
  const bySymbol = new Map(previousList.map((stock) => [stock.symbol, stock]))

  const equities = previousList
    .filter((stock) => (stock.kind || 'equity') === 'equity')
    .map((stock) => ({ symbol: stock.symbol, dataSymbol: stock.dataSymbol, kind: 'equity' }))
  const instruments = INSTRUMENT_SEEDS.map((seed) => ({ ...seed, kind: 'instrument' }))

  const universe = [
    ...equities.map((entry) => carryEditorial({ ...entry }, bySymbol.get(entry.symbol) || {})),
    ...instruments.map((entry) => carryEditorial({ ...entry }, bySymbol.get(entry.symbol) || entry)),
  ]

  const refreshed = []
  const failures = []
  for (const entry of universe) {
    try {
      const quote = await fetchQuote(entry)
      refreshed.push({ ...entry, ...quote, name: entry.name || quote.name })
      console.log(`ok   ${entry.symbol.padEnd(7)} ${String(quote.price).padStart(10)}  ${quote.change >= 0 ? '+' : ''}${quote.change}%  52w [${quote.range52w[0]}, ${quote.range52w[1]}]`)
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
      console.error(`FAIL ${entry.symbol.padEnd(7)} ${error instanceof Error ? error.message : error}`)
    }
    await sleep(150)
  }

  if (failures.length) {
    console.error(`\n${failures.length}/${universe.length} symbol(s) failed validation — refusing to write partial/garbage data.`)
    process.exit(1)
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    source: 'yahoo-finance-chart',
    stocks: refreshed,
  }
  const output = `${JSON.stringify(payload, null, 2)}\n`
  await Promise.all(files.map((file) => writeFile(file, output)))
  console.log(`\nWrote ${refreshed.length} validated quotes to ${files.length} file(s).`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
