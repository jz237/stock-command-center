import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const files = [
  path.join(root, 'data', 'stocks.json'),
  path.join(root, 'public', 'data', 'stocks.json'),
]
const apiBase = 'https://stockprices.dev/api/stocks'

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

async function fetchQuote(symbol) {
  const response = await fetch(`${apiBase}/${encodeURIComponent(symbol)}`, {
    headers: { accept: 'application/json', 'user-agent': 'stock-command-center/1.0' },
  })
  if (!response.ok) throw new Error(`${symbol}: ${response.status} ${response.statusText}`)
  const quote = await response.json()
  const price = Number(quote.Price)
  const change = Number(quote.ChangePercentage)
  if (!Number.isFinite(price) || !Number.isFinite(change)) throw new Error(`${symbol}: malformed quote ${JSON.stringify(quote)}`)
  return {
    name: quote.Name,
    price,
    change,
    changeAmount: Number(quote.ChangeAmount),
  }
}

async function main() {
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
      stock.quoteSource = 'stockprices.dev'
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
