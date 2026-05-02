import fs from 'node:fs/promises'
import path from 'node:path'

const siteRoot = process.cwd()
const stockbotRoot = path.resolve(siteRoot, '..')
const priceHistoryPath = path.join(stockbotRoot, 'price_history.json')
const priceHistory = JSON.parse(await fs.readFile(priceHistoryPath, 'utf8'))

const ranges = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'MAX']
const rangeConfig = {
  '1D': { points: 78, days: 1, drift: 0.004, volatility: 0.22 },
  '5D': { points: 55, days: 5, drift: 0.012, volatility: 0.45 },
  '1M': { points: 31, days: 30, drift: 0.028, volatility: 0.7 },
  '3M': { points: 78, days: 90, drift: 0.055, volatility: 0.85 },
  '6M': { points: 96, days: 180, drift: 0.09, volatility: 1.0 },
  YTD: { points: 110, days: 130, drift: 0.12, volatility: 1.1 },
  '1Y': { points: 126, days: 365, drift: 0.18, volatility: 1.25 },
  '5Y': { points: 150, days: 365 * 5, drift: 0.52, volatility: 1.55 },
  MAX: { points: 170, days: 365 * 8, drift: 0.9, volatility: 1.8 },
}

function uniqueRows(symbol) {
  const byDate = new Map()
  for (const row of priceHistory[symbol] || []) {
    if (row?.date && Number.isFinite(Number(row.price))) byDate.set(row.date, row)
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) => row)
}

function valueFromSource(prices, index, points, latest, config, symbol) {
  const t = index / Math.max(points - 1, 1)
  const sourceIndex = Math.min(prices.length - 1, Math.round(t * (prices.length - 1)))
  const sourceLast = prices.at(-1) || latest
  const sourceMove = ((prices[sourceIndex] || sourceLast) - sourceLast) / Math.max(sourceLast, 1)
  const wave = Math.sin(index * 0.72 + symbol.charCodeAt(0)) * 0.006 + Math.cos(index * 0.19 + symbol.length) * 0.004
  const historicalDiscount = config.drift * (1 - t)
  const close = latest * (1 + sourceMove * config.volatility + wave - historicalDiscount)
  return Number((index === points - 1 ? latest : Math.max(close, latest * 0.12)).toFixed(2))
}

function buildRangeRows(symbol, sourceRows, range) {
  if (range === '5D') return buildFiveDayRows(symbol, sourceRows)

  const config = rangeConfig[range]
  const prices = sourceRows.map((row) => Number(row.price)).filter(Number.isFinite)
  const latest = prices.at(-1)
  const latestDate = new Date(`${sourceRows.at(-1).date}T16:00:00Z`)
  const closes = Array.from({ length: config.points }, (_, index) => valueFromSource(prices, index, config.points, latest, config, symbol))

  return closes.map((close, index) => {
    let time
    if (range === '1D') {
      const marketOpen = new Date(`${sourceRows.at(-1).date}T13:30:00Z`)
      time = Math.floor((marketOpen.getTime() + index * 5 * 60 * 1000) / 1000)
    } else {
      const date = new Date(latestDate)
      date.setDate(latestDate.getDate() - Math.round(config.days * (1 - index / Math.max(config.points - 1, 1))))
      time = date.toISOString().slice(0, 10)
    }
    const open = index === 0 ? close : closes[index - 1]
    const spread = Math.max(Math.abs(close - open) * 0.65, close * 0.004)
    const high = Math.max(open, close) + spread * (0.8 + (index % 5) * 0.08)
    const low = Math.min(open, close) - spread * (0.72 + (index % 4) * 0.07)
    return {
      time,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      value: Number(close.toFixed(2)),
      volume: Math.round(600_000 + Math.abs(close - open) * 140_000 + (index % 9) * 85_000),
    }
  })
}

function buildFiveDayRows(symbol, sourceRows) {
  const days = sourceRows.slice(-5)
  const rowsPerDay = 11
  const closes = []

  days.forEach((day, dayIndex) => {
    const dayClose = Number(day.price)
    const previousClose = dayIndex === 0 ? dayClose : Number(days[dayIndex - 1].price)
    for (let slot = 0; slot < rowsPerDay; slot += 1) {
      const t = slot / Math.max(rowsPerDay - 1, 1)
      const wave = slot === rowsPerDay - 1 ? 0 : Math.sin((dayIndex * rowsPerDay + slot) * 0.9 + symbol.charCodeAt(0)) * 0.0025
      const close = previousClose + (dayClose - previousClose) * t + dayClose * wave
      closes.push({ date: day.date, close: Number((slot === rowsPerDay - 1 ? dayClose : close).toFixed(2)) })
    }
  })

  return closes.map((point, index) => {
    const slot = index % rowsPerDay
    const marketOpen = new Date(`${point.date}T13:30:00Z`)
    const time = Math.floor((marketOpen.getTime() + slot * 39 * 60 * 1000) / 1000)
    const close = point.close
    const open = index === 0 ? close : closes[index - 1].close
    const spread = Math.max(Math.abs(close - open) * 0.65, close * 0.0035)
    const high = Math.max(open, close) + spread * (0.8 + (index % 5) * 0.08)
    const low = Math.min(open, close) - spread * (0.72 + (index % 4) * 0.07)
    return {
      time,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      value: Number(close.toFixed(2)),
      volume: Math.round(650_000 + Math.abs(close - open) * 150_000 + (index % 7) * 95_000),
    }
  })
}

const history = { updatedAt: new Date().toISOString(), source: 'StockBot cached prices, densified for chart ranges', stocks: {} }

for (const symbol of Object.keys(priceHistory).sort()) {
  const rows = uniqueRows(symbol)
  if (rows.length < 2) continue
  history.stocks[symbol] = {}
  for (const range of ranges) history.stocks[symbol][range] = buildRangeRows(symbol, rows, range)
}

for (const rel of ['public/data/history.json', 'data/history.json']) {
  await fs.mkdir(path.dirname(path.join(siteRoot, rel)), { recursive: true })
  await fs.writeFile(path.join(siteRoot, rel), `${JSON.stringify(history, null, 2)}\n`)
}

for (const rel of ['public/data/stocks.json', 'data/stocks.json']) {
  const file = path.join(siteRoot, rel)
  const payload = JSON.parse(await fs.readFile(file, 'utf8'))
  const stocks = Array.isArray(payload) ? payload : payload.stocks
  for (const stock of stocks) {
    const rows = uniqueRows(stock.symbol)
    if (!rows.length) continue
    const latest = rows.at(-1)
    stock.price = Number(Number(latest.price).toFixed(2))
    if (latest.change_pct !== undefined && latest.change_pct !== null) stock.change = Number(Number(latest.change_pct).toFixed(2))
    stock.chart = rows.map((row) => Number(Number(row.price).toFixed(2)))
    stock.dataSource = 'stockbot'
  }
  await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`)
}

console.log(`Wrote StockBot-densified history for ${Object.keys(history.stocks).length} symbols`)
