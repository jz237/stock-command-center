import fs from 'node:fs/promises'
import path from 'node:path'

const siteRoot = process.cwd()
const stockbotRoot = path.resolve(siteRoot, '..')
const priceHistoryPath = path.join(stockbotRoot, 'price_history.json')
const priceHistory = JSON.parse(await fs.readFile(priceHistoryPath, 'utf8'))
const ranges = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'MAX']

function uniqueRows(symbol) {
  const byDate = new Map()
  for (const row of priceHistory[symbol] || []) {
    if (row?.date && Number.isFinite(Number(row.price))) byDate.set(row.date, row)
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) => row)
}

function toChartRows(rows) {
  let previous = null
  return rows.map((row) => {
    const close = Number(row.price)
    const open = previous ?? close
    const spread = Math.max(Math.abs(close - open) * 0.6, close * 0.006)
    previous = close
    return {
      time: row.date,
      open: Number(open.toFixed(2)),
      high: Number((Math.max(open, close) + spread).toFixed(2)),
      low: Number((Math.min(open, close) - spread).toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 0,
    }
  })
}

const history = { updatedAt: new Date().toISOString(), source: 'StockBot cached prices', stocks: {} }

for (const symbol of Object.keys(priceHistory).sort()) {
  const rows = uniqueRows(symbol)
  if (rows.length < 2) continue
  const chartRows = toChartRows(rows)
  history.stocks[symbol] = {}
  for (const range of ranges) {
    history.stocks[symbol][range] = range === '1D' ? chartRows.slice(-2) : range === '5D' ? chartRows.slice(-5) : chartRows
  }
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

console.log(`Wrote StockBot cached history for ${Object.keys(history.stocks).length} symbols`)
