import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const files = [
  path.join(root, 'data', 'stocks.json'),
  path.join(root, 'public', 'data', 'stocks.json'),
]
const stockPricesApiBase = 'https://stockprices.dev/api/stocks'
const forceRun = process.argv.includes('--force')

function getNewYorkParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
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
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
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
    observedFixedHoliday(year, 1, 1), // New Year's Day
    nthWeekdayOfMonth(year, 1, 1, 3), // MLK Day
    nthWeekdayOfMonth(year, 2, 1, 3), // Washington's Birthday
    ymd(goodFriday),
    lastWeekdayOfMonth(year, 5, 1), // Memorial Day
    observedFixedHoliday(year, 6, 19), // Juneteenth
    observedFixedHoliday(year, 7, 4), // Independence Day
    nthWeekdayOfMonth(year, 9, 1, 1), // Labor Day
    nthWeekdayOfMonth(year, 11, 4, 4), // Thanksgiving
    observedFixedHoliday(year, 12, 25), // Christmas
  ])
}

function isTradingWindow(date = new Date()) {
  const p = getNewYorkParts(date)
  const year = Number(p.year)
  const month = p.month
  const day = p.day
  const weekday = p.weekday
  if (weekday === 'Sat' || weekday === 'Sun') return false
  if (nyseHolidaySet(year).has(`${year}-${month}-${day}`)) return false
  const hour = Number(p.hour)
  const minute = Number(p.minute)
  const minutes = hour * 60 + minute
  // US regular session: 9:30 AM through 4:00 PM New York time.
  return minutes >= 9 * 60 + 30 && minutes <= 16 * 60
}

function reshapeChart(existing, latestPrice) {
  const values = Array.isArray(existing) && existing.length ? existing.map(Number).filter(Number.isFinite) : []
  const source = values.length ? values.slice(-29) : Array.from({ length: 14 }, (_, i) => 50 + i + Math.sin(i) * 4)
  const min = Math.min(...source)
  const max = Math.max(...source)
  const spread = Math.max(max - min, 1)
  const scaled = source.map((value) => {
    const centered = ((value - min) / spread - 0.5) * 0.12
    return Number((latestPrice * (1 + centered)).toFixed(2))
  })
  return [...scaled, Number(latestPrice.toFixed(2))].slice(-30)
}

async function fetchYahooQuote(symbol) {
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`, {
    headers: { accept: 'application/json', 'user-agent': 'stock-command-center/1.0' },
  })
  if (!response.ok) throw new Error(`Yahoo ${symbol}: ${response.status} ${response.statusText}`)
  const payload = await response.json()
  const result = payload?.chart?.result?.[0]
  const meta = result?.meta
  const price = Number(meta?.regularMarketPrice)
  const previousClose = Number(meta?.previousClose ?? meta?.chartPreviousClose)
  if (!Number.isFinite(price) || !Number.isFinite(previousClose) || previousClose === 0) {
    throw new Error(`Yahoo ${symbol}: malformed quote ${JSON.stringify(meta)}`)
  }
  const changeAmount = price - previousClose
  const change = (changeAmount / previousClose) * 100
  return {
    name: meta?.shortName || meta?.longName,
    price,
    change,
    changeAmount,
    source: 'yahoo-finance-chart',
  }
}

async function fetchStockPricesDevQuote(symbol) {
  const response = await fetch(`${stockPricesApiBase}/${encodeURIComponent(symbol)}`, {
    headers: { accept: 'application/json', 'user-agent': 'stock-command-center/1.0' },
  })
  if (!response.ok) throw new Error(`stockprices.dev ${symbol}: ${response.status} ${response.statusText}`)
  const quote = await response.json()
  const price = Number(quote.Price)
  const change = Number(quote.ChangePercentage)
  if (!Number.isFinite(price) || !Number.isFinite(change)) throw new Error(`stockprices.dev ${symbol}: malformed quote ${JSON.stringify(quote)}`)
  return {
    name: quote.Name,
    price,
    change,
    changeAmount: Number(quote.ChangeAmount),
    source: 'stockprices.dev',
  }
}

async function fetchQuote(symbol) {
  try {
    return await fetchYahooQuote(symbol)
  } catch (yahooError) {
    try {
      return await fetchStockPricesDevQuote(symbol)
    } catch (stockPricesError) {
      throw new Error(`${symbol}: ${yahooError instanceof Error ? yahooError.message : yahooError}; ${stockPricesError instanceof Error ? stockPricesError.message : stockPricesError}`)
    }
  }
}

async function main() {
  if (!forceRun && !isTradingWindow()) {
    console.log('Market is closed; skipping stock price refresh.')
    return
  }

  const primary = JSON.parse(await readFile(files[0], 'utf8'))
  const now = new Date().toISOString()
  const updated = []
  const failures = []

  for (const stock of primary) {
    try {
      const quote = await fetchQuote(stock.symbol)
      stock.name = stock.name || quote.name || stock.symbol
      stock.price = Number(quote.price.toFixed(2))
      stock.change = Number(quote.change.toFixed(2))
      stock.changeAmount = Number.isFinite(quote.changeAmount) ? Number(quote.changeAmount.toFixed(2)) : undefined
      stock.quoteSource = quote.source
      stock.quoteUpdatedAt = now
      stock.chart = reshapeChart(stock.chart, stock.price)
      updated.push(stock.symbol)
      await new Promise((resolve) => setTimeout(resolve, 200))
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
    }
  }

  const output = `${JSON.stringify(primary, null, 2)}\n`
  await Promise.all(files.map((file) => writeFile(file, output)))
  console.log(`Updated ${updated.length} quote(s): ${updated.join(', ')}`)
  if (failures.length) {
    console.warn(`Failed ${failures.length} quote(s):`)
    for (const failure of failures) console.warn(`- ${failure}`)
  }
  if (!updated.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
