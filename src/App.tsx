import { useEffect, useMemo, useRef, useState } from 'react'
import { AreaSeries, CandlestickSeries, HistogramSeries, createChart, type IChartApi, type ISeriesApi, type Time } from 'lightweight-charts'
import './App.css'

type Stock = {
  symbol: string
  dataSymbol?: string
  name: string
  sector: string
  price: number
  change: number
  marketCap: string
  pe?: number | null
  targetPrice?: number | null
  range52w?: [number | null, number | null]
  rating?: string
  confidence: number
  thesis: string
  risks: string[]
  opportunities: string[]
  catalysts: string[]
  chart: number[]
  volume?: number
  dataSource?: 'static' | 'live' | 'stockbot'
}

type PortfolioSeed = {
  positions: { symbol: string }[]
}

type DetailPanel = 'report' | 'catalysts' | 'risks' | 'watchlist' | null
type ChartMode = 'Line' | 'Candles' | 'Volume'
type ChartRow = { time: Time; open: number; high: number; low: number; close: number; value: number; volume: number }
type HistoryPayload = { updatedAt: string; source?: string; stocks: Record<string, Record<string, ChartRow[]>> }

const fallbackStocks: Stock[] = [
  {
    symbol: 'NVDA', name: 'NVIDIA', sector: 'Semiconductors', price: 1224.4, change: 4.35, marketCap: '$3.01T', pe: 72.45, confidence: 94,
    thesis: 'NVIDIA remains the cleanest large-cap AI infrastructure story: accelerators, networking, and software demand are still running ahead of supply.',
    risks: ['Customer concentration among hyperscalers', 'Export restrictions can pressure China revenue', 'Any Blackwell delay would hit sentiment fast'],
    opportunities: ['Blackwell ramp refreshes the upgrade cycle', 'Networking attach rates can lift system revenue', 'Enterprise AI software is still early'],
    catalysts: ['NVDA Q1 revenue beats estimates', 'Blackwell shipment updates', 'Hyperscaler capex commentary'],
    chart: [1080, 1092, 1088, 1104, 1118, 1109, 1132, 1150, 1141, 1166, 1184, 1178, 1195, 1217, 1224], volume: 61.23,
  },
]

const fallbackPortfolio: PortfolioSeed = {
  positions: ['NVDA', 'MSFT', 'AVGO', 'TSM', 'PLTR', 'ARM', 'GOOG', 'META', 'AMZN', 'INTC', 'QCOM', 'VRT', 'CRWV', 'NVTS', 'ORCL', 'SOUN', 'BA', 'AAPL'].map((symbol) => ({ symbol })),
}

const ranges = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'MAX']
const rangeConfig: Record<string, { points: number; label: string; x: string[]; drift: number; volatility: number }> = {
  '1D': { points: 48, label: 'Intraday · 5 minute bars', x: ['9:30', '11:00', '12:30', '2:00', '4:00'], drift: 0.004, volatility: 0.35 },
  '5D': { points: 55, label: '5 trading days · hourly bars', x: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], drift: 0.012, volatility: 0.55 },
  '1M': { points: 64, label: '1 month · daily closes', x: ['Week 1', 'Week 2', 'Week 3', 'Week 4'], drift: 0.028, volatility: 0.85 },
  '3M': { points: 78, label: '3 months · daily closes', x: ['Month 1', 'Month 2', 'Month 3'], drift: 0.055, volatility: 1.1 },
  '6M': { points: 96, label: '6 months · daily closes', x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], drift: 0.09, volatility: 1.35 },
  YTD: { points: 110, label: 'Year to date · daily closes', x: ['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Now'], drift: 0.12, volatility: 1.5 },
  '1Y': { points: 126, label: '1 year · daily closes', x: ['Q1', 'Q2', 'Q3', 'Q4', 'Now'], drift: 0.18, volatility: 1.8 },
  '5Y': { points: 150, label: '5 years · weekly closes', x: ['2022', '2023', '2024', '2025', '2026'], drift: 0.52, volatility: 2.4 },
  MAX: { points: 170, label: 'Max history · monthly closes', x: ['IPO', 'Early', 'Mid', 'Recent', 'Now'], drift: 0.9, volatility: 3.1 },
}
const categories = ['AI & Semiconductors', 'Cloud & Software', 'Consumer Tech', 'Watchlist', 'Long Term Holds']
const nav = ['▦', '▧', '▤', '▭', '⚙']
const LIVE_REFRESH_MS = 120_000
const minCachedChartRows: Record<string, number> = { '1D': 20, '5D': 10, '1M': 15, '3M': 40, '6M': 80, YTD: 20, '1Y': 160, '5Y': 150, MAX: 80 }

const marketInstruments: Stock[] = [
  { symbol: 'S&P', dataSymbol: '^GSPC', name: 'S&P 500', sector: 'Market Index', price: 5321, change: 0.71, marketCap: 'Index', pe: null, rating: 'Benchmark', confidence: 100, thesis: 'Broad U.S. large-cap market benchmark.', risks: ['Market-wide risk', 'Rate sensitivity'], opportunities: ['Broad equity exposure', 'Risk appetite proxy'], catalysts: ['Fed commentary', 'Earnings breadth', 'Index flows'], chart: [5260, 5284, 5273, 5302, 5321], volume: undefined, dataSource: 'static' },
  { symbol: 'NASDAQ', dataSymbol: '^IXIC', name: 'Nasdaq Composite', sector: 'Market Index', price: 18204, change: 1.04, marketCap: 'Index', pe: null, rating: 'Tech Beta', confidence: 100, thesis: 'Growth and technology-heavy market benchmark.', risks: ['High-duration tech sensitivity', 'AI trade crowding'], opportunities: ['AI/software leadership', 'Liquidity-driven rallies'], catalysts: ['Mega-cap earnings', 'Semiconductor demand', 'Rate moves'], chart: [17960, 18084, 18020, 18144, 18204], dataSource: 'static' },
  { symbol: 'DOW', dataSymbol: '^DJI', name: 'Dow Jones Industrial Average', sector: 'Market Index', price: 39872, change: 0.34, marketCap: 'Index', pe: null, rating: 'Cyclical', confidence: 100, thesis: 'Blue-chip industrial and value-oriented market gauge.', risks: ['Industrial slowdown', 'Defensive rotation'], opportunities: ['Value catch-up', 'Dividend stability'], catalysts: ['Industrial data', 'Bank/healthcare moves'], chart: [39680, 39720, 39695, 39810, 39872], dataSource: 'static' },
  { symbol: 'VIX', dataSymbol: '^VIX', name: 'CBOE Volatility Index', sector: 'Volatility', price: 12.48, change: -4.32, marketCap: 'Volatility', pe: null, rating: 'Fear Gauge', confidence: 100, thesis: 'Options-market stress gauge; lower usually means calmer equity conditions.', risks: ['Sudden risk-off spike', 'Event volatility'], opportunities: ['Calm-market confirmation', 'Hedge timing signal'], catalysts: ['Macro shocks', 'Fed surprises', 'Earnings events'], chart: [13.5, 13.1, 12.9, 12.7, 12.48], dataSource: 'static' },
  { symbol: '10Y', dataSymbol: '^TNX', name: 'U.S. 10-Year Treasury Yield', sector: 'Rates', price: 4.21, change: -0.06, marketCap: 'Yield', pe: null, rating: 'Rates', confidence: 100, thesis: 'The key long-rate signal for growth stock pressure and valuation appetite.', risks: ['Higher yields pressure tech', 'Inflation surprise'], opportunities: ['Lower yields support growth stocks', 'Policy easing signal'], catalysts: ['CPI/PCE', 'Fed speeches', 'Treasury auctions'], chart: [4.28, 4.25, 4.24, 4.22, 4.21], dataSource: 'static' },
  { symbol: 'DXY', dataSymbol: 'DX-Y.NYB', name: 'U.S. Dollar Index', sector: 'Currency', price: 103.2, change: -0.18, marketCap: 'FX Index', pe: null, rating: 'Dollar', confidence: 100, thesis: 'Dollar strength/weakness proxy for global liquidity and multinational earnings translation.', risks: ['Dollar spike tightens conditions', 'FX translation drag'], opportunities: ['Weaker dollar can help risk assets', 'Global revenue translation support'], catalysts: ['Rate differentials', 'Global growth data'], chart: [103.8, 103.6, 103.4, 103.3, 103.2], dataSource: 'static' },
  { symbol: 'BTC', dataSymbol: 'BTC-USD', name: 'Bitcoin', sector: 'Crypto', price: 91400, change: 2.12, marketCap: 'Crypto', pe: null, rating: 'Risk Appetite', confidence: 100, thesis: 'High-beta liquidity and risk-appetite signal.', risks: ['Crypto volatility', 'Regulatory shock'], opportunities: ['Liquidity expansion signal', 'Institutional flow'], catalysts: ['ETF flows', 'Dollar/yield moves'], chart: [88400, 89500, 90200, 90850, 91400], dataSource: 'static' },
  { symbol: 'WTI', dataSymbol: 'CL=F', name: 'WTI Crude Oil', sector: 'Commodities', price: 78.2, change: 0.42, marketCap: 'Commodity', pe: null, rating: 'Inflation Input', confidence: 100, thesis: 'Oil price signal for inflation pressure and energy/geopolitical risk.', risks: ['Inflation pressure', 'Supply shock'], opportunities: ['Demand strength signal', 'Energy-sector support'], catalysts: ['OPEC', 'Inventory data', 'Geopolitics'], chart: [77.4, 77.9, 77.6, 78.0, 78.2], dataSource: 'static' },
  { symbol: 'GOLD', dataSymbol: 'GC=F', name: 'Gold Futures', sector: 'Commodities', price: 2381, change: -0.22, marketCap: 'Commodity', pe: null, rating: 'Hedge', confidence: 100, thesis: 'Safe-haven and real-rate sensitivity signal.', risks: ['Real yields rising', 'Dollar strength'], opportunities: ['Hedge demand', 'Lower-rate support'], catalysts: ['Real yields', 'Central-bank buying', 'Geopolitical risk'], chart: [2390, 2388, 2384, 2386, 2381], dataSource: 'static' },
]

function sparkPath(values: number[], width = 96, height = 34) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const points = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width
    const y = height - ((value - min) / Math.max(max - min, 1)) * height
    return { x, y }
  })
  if (points.length < 2) return ''
  return points.reduce((path, point, index, all) => {
    if (index === 0) return `M${point.x.toFixed(2)} ${point.y.toFixed(2)}`
    const previous = all[index - 1]
    const midX = (previous.x + point.x) / 2
    return `${path} Q${previous.x.toFixed(2)} ${previous.y.toFixed(2)} ${midX.toFixed(2)} ${((previous.y + point.y) / 2).toFixed(2)} T${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  }, '')
}

function money(value: number, digits = 2) {
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function compactMoney(value?: number | null) {
  return Number.isFinite(Number(value)) ? `$${money(Number(value))}` : '—'
}

function targetUpside(stock: Stock) {
  if (!stock.targetPrice || !stock.price) return '—'
  const upside = ((stock.targetPrice - stock.price) / stock.price) * 100
  return `${upside >= 0 ? '+' : ''}${upside.toFixed(1)}%`
}

function sourceLabel(source?: Stock['dataSource']) {
  return source === 'live' ? 'Live quote' : source === 'stockbot' ? 'StockBot' : 'Static'
}

function expandedSeries(stock: Stock, range: string) {
  const config = rangeConfig[range] || rangeConfig['1D']
  const source = stock.chart.length > 1 ? stock.chart : [stock.price * 0.98, stock.price]
  const last = stock.price || source.at(-1) || 1
  const sourceLast = source.at(-1) || last
  return Array.from({ length: config.points }, (_, index) => {
    const t = index / Math.max(config.points - 1, 1)
    const sourceIndex = Math.min(source.length - 1, Math.round(t * (source.length - 1)))
    const sourceMove = ((source[sourceIndex] || sourceLast) - sourceLast) / Math.max(sourceLast, 1)
    const wave = Math.sin(index * 0.72 + stock.symbol.charCodeAt(0)) * 0.006 + Math.cos(index * 0.19 + stock.symbol.length) * 0.004
    const historicalDiscount = config.drift * (1 - t) * (stock.confidence >= 70 ? 1 : 0.55)
    const value = last * (1 + sourceMove * config.volatility + wave - historicalDiscount)
    return Number((index === config.points - 1 ? last : Math.max(value, last * 0.12)).toFixed(2))
  })
}

function movingAverage(values: number[], windowSize = 8) {
  return values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1)
    const slice = values.slice(start, index + 1)
    return slice.reduce((sum, value) => sum + value, 0) / slice.length
  })
}

function buildHiDpiChartData(stock: Stock, range: string) {
  const series = expandedSeries(stock, range)
  const config = rangeConfig[range] || rangeConfig['1D']
  const start = new Date()
  start.setDate(start.getDate() - config.points)
  const rows = series.map((close, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const open = index === 0 ? close : series[index - 1]
    const spread = Math.max(Math.abs(close - open) * 0.75, close * 0.003)
    const high = Math.max(open, close) + spread * (0.8 + (index % 5) * 0.08)
    const low = Math.min(open, close) - spread * (0.72 + (index % 4) * 0.07)
    const time = date.toISOString().slice(0, 10) as Time
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
  return rows
}

const yahooRangeMap: Record<string, { range: string; interval: string }> = {
  '1D': { range: '1d', interval: '5m' },
  '5D': { range: '5d', interval: '30m' },
  '1M': { range: '1mo', interval: '1d' },
  '3M': { range: '3mo', interval: '1d' },
  '6M': { range: '6mo', interval: '1d' },
  YTD: { range: 'ytd', interval: '1d' },
  '1Y': { range: '1y', interval: '1d' },
  '5Y': { range: '5y', interval: '1wk' },
  MAX: { range: 'max', interval: '1mo' },
}

async function fetchYahooHistory(symbol: string, range: string): Promise<ChartRow[] | null> {
  const config = yahooRangeMap[range] || yahooRangeMap['1D']
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${config.range}&interval=${config.interval}`, { signal: controller.signal })
    if (!response.ok) return null
    const payload = await response.json()
    const result = payload?.chart?.result?.[0]
    const timestamps = result?.timestamp as number[] | undefined
    const quote = result?.indicators?.quote?.[0]
    if (!timestamps?.length || !quote) return null
    const rows = timestamps.map((stamp, index) => {
      const open = Number(quote.open?.[index])
      const high = Number(quote.high?.[index])
      const low = Number(quote.low?.[index])
      const close = Number(quote.close?.[index])
      const volume = Number(quote.volume?.[index] || 0)
      if (![open, high, low, close].every(Number.isFinite) || close <= 0 || high <= 0 || low <= 0 || open <= 0) return null
      const date = new Date(stamp * 1000)
      const time = range === '1D'
        ? Math.floor(stamp) as Time
        : date.toISOString().slice(0, 10) as Time
      return { time, open: Number(open.toFixed(2)), high: Number(high.toFixed(2)), low: Number(low.toFixed(2)), close: Number(close.toFixed(2)), value: Number(close.toFixed(2)), volume }
    }).filter(Boolean) as ChartRow[]
    return rows.length > 1 ? rows : null
  } catch {
    return null
  } finally {
    window.clearTimeout(timeout)
  }
}

function HighResolutionChart({ chartMode, indicators, range, stock }: { chartMode: ChartMode; indicators: boolean; range: string; stock: Stock }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const areaRef = useRef<ISeriesApi<'Area'> | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const maRef = useRef<ISeriesApi<'Area'> | null>(null)
  const [hover, setHover] = useState<{ open: number; high: number; low: number; close: number } | null>(null)
  const [rows, setRows] = useState<ChartRow[]>(() => buildHiDpiChartData(stock, range))
  const [source, setSource] = useState<'cached' | 'live' | 'fallback'>('fallback')
  const historyRef = useRef<HistoryPayload | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#8aa0bd', fontSize: 11 },
      grid: { vertLines: { color: 'rgba(120,144,173,.08)' }, horzLines: { color: 'rgba(120,144,173,.12)' } },
      rightPriceScale: { borderColor: 'rgba(120,144,173,.22)', scaleMargins: { top: 0.08, bottom: 0.24 } },
      timeScale: { borderColor: 'rgba(120,144,173,.18)', timeVisible: range === '1D' || range === '5D', secondsVisible: false },
      crosshair: { mode: 1, vertLine: { color: 'rgba(226,239,251,.25)' }, horzLine: { color: 'rgba(226,239,251,.18)' } },
    })
    const area = chart.addSeries(AreaSeries, { lineColor: '#29d681', topColor: 'rgba(41,214,129,.30)', bottomColor: 'rgba(41,214,129,0)', lineWidth: 2, priceLineColor: 'rgba(41,214,129,.55)' })
    const candles = chart.addSeries(CandlestickSeries, { upColor: '#40d982', downColor: '#f05268', borderUpColor: '#40d982', borderDownColor: '#f05268', wickUpColor: '#9af7bf', wickDownColor: '#ff9aaa' })
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '' })
    const ma = chart.addSeries(AreaSeries, { lineColor: 'rgba(125,103,255,.95)', topColor: 'rgba(0,0,0,0)', bottomColor: 'rgba(0,0,0,0)', lineWidth: 1, priceLineVisible: false })
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } })
    chart.subscribeCrosshairMove((param) => {
      const candle = param.seriesData.get(candles)
      if (candle && 'open' in candle) setHover({ open: candle.open, high: candle.high, low: candle.low, close: candle.close })
      else setHover(null)
    })
    chartRef.current = chart
    areaRef.current = area
    candleRef.current = candles
    volumeRef.current = volume
    maRef.current = ma
    return () => chart.remove()
  }, [range])

  useEffect(() => {
    let cancelled = false
    async function loadHistory() {
      if (!historyRef.current) {
        historyRef.current = await fetch(`${import.meta.env.BASE_URL}data/history.json`).then((r) => r.json()).catch(() => null)
      }
      const chartSymbol = stock.dataSymbol || stock.symbol
      const cached = historyRef.current?.stocks?.[chartSymbol]?.[range]
      if (cancelled) return
      if (cached && cached.length >= (minCachedChartRows[range] || 2)) {
        setRows(cached.map((row) => ({ ...row, value: row.close })))
        setSource('cached')
        return
      }
      const history = await fetchYahooHistory(chartSymbol, range)
      if (cancelled) return
      if (history?.length) {
        setRows(history)
        setSource('live')
        return
      }
      setRows(buildHiDpiChartData(stock, range))
      setSource('fallback')
    }
    loadHistory()
    return () => { cancelled = true }
  }, [range, stock])

  useEffect(() => {
    const areaData = rows.map((row) => ({ time: row.time, value: row.close }))
    const volumeData = rows.map((row) => ({ time: row.time, value: row.volume, color: row.close >= row.open ? 'rgba(64,217,130,.28)' : 'rgba(240,82,104,.28)' }))
    const maData = movingAverage(rows.map((row) => row.close), range === '1D' ? 8 : 14).map((value, index) => ({ time: rows[index].time, value }))
    areaRef.current?.setData(areaData)
    candleRef.current?.setData(rows)
    volumeRef.current?.setData(volumeData)
    maRef.current?.setData(maData)
    areaRef.current?.applyOptions({ visible: chartMode === 'Line' })
    candleRef.current?.applyOptions({ visible: chartMode === 'Candles' })
    volumeRef.current?.applyOptions({ visible: chartMode === 'Candles' || chartMode === 'Volume' })
    maRef.current?.applyOptions({ visible: indicators && chartMode !== 'Volume' })
    chartRef.current?.timeScale().fitContent()
  }, [chartMode, indicators, range, rows])

  return <div className="hires-chart"><div className="real-chart" ref={containerRef} />{hover && chartMode === 'Candles' && <div className="ohlc-readout"><span>O <b>${money(hover.open)}</b></span><span>H <b>${money(hover.high)}</b></span><span>L <b>${money(hover.low)}</b></span><span>C <b>${money(hover.close)}</b></span></div>}<div className={`chart-source ${source}`}>{source === 'cached' ? 'StockBot cached history' : source === 'live' ? 'Yahoo live history' : 'Fallback history'}</div></div>
}

async function fetchYahooQuote(symbol: string, expectedPrice?: number): Promise<Partial<Stock> | null> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`, { signal: controller.signal })
    if (!response.ok) return null
    const payload = await response.json()
    const result = payload?.chart?.result?.[0]
    const meta = result?.meta
    const quote = result?.indicators?.quote?.[0]
    const closes = (quote?.close || []).filter((value: number | null) => typeof value === 'number' && value > 0) as number[]
    if (!meta || !closes.length) return null
    const price = Number(meta.regularMarketPrice ?? closes.at(-1))
    const previous = Number(meta.chartPreviousClose ?? closes[0])
    if (!Number.isFinite(price) || !Number.isFinite(previous) || previous === 0) return null
    if (expectedPrice && Math.abs(price - expectedPrice) / Math.max(expectedPrice, 1) > 0.35) return null
    const volume = (quote?.volume || []).filter((value: number | null) => typeof value === 'number').reduce((sum: number, value: number) => sum + value, 0) / 1_000_000
    return {
      price: Number(price.toFixed(2)),
      change: Number((((price - previous) / previous) * 100).toFixed(2)),
      chart: closes.slice(-48).map((value) => Number(value.toFixed(2))),
      volume: Number(volume.toFixed(2)),
      dataSource: 'live',
    }
  } catch {
    return null
  } finally {
    window.clearTimeout(timeout)
  }
}

function App() {
  const [stocks, setStocks] = useState<Stock[]>(fallbackStocks)
  const [portfolio, setPortfolio] = useState<PortfolioSeed>(fallbackPortfolio)
  const [selectedSymbol, setSelectedSymbol] = useState('NVDA')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [range, setRange] = useState('1D')
  const [chartMode, setChartMode] = useState<ChartMode>('Candles')
  const [view, setView] = useState<'Research' | 'News' | 'Portfolio'>('Research')
  const [indicators, setIndicators] = useState(true)
  const [saved, setSaved] = useState<string[]>(() => JSON.parse(localStorage.getItem('savedPortfolioSymbols') || '[]'))
  const [liveStatus, setLiveStatus] = useState<'loading' | 'live' | 'static'>('loading')
  const [lastLiveUpdate, setLastLiveUpdate] = useState<string>('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [detailPanel, setDetailPanel] = useState<DetailPanel>(null)
  const [marketSnapshots, setMarketSnapshots] = useState<Stock[]>(marketInstruments)
  const liveSymbolsKey = useMemo(() => stocks.map((stock) => stock.symbol).join('|'), [stocks])
  const stocksRef = useRef(stocks)

  useEffect(() => {
    stocksRef.current = stocks
  }, [stocks])

  useEffect(() => {
    let cancelled = false
    async function refreshMarketSnapshots() {
      const updates = await Promise.allSettled(marketInstruments.map(async (instrument) => {
        const quote = await fetchYahooQuote(instrument.dataSymbol || instrument.symbol)
        return quote ? { ...instrument, ...quote, symbol: instrument.symbol, dataSymbol: instrument.dataSymbol, name: instrument.name, sector: instrument.sector } : instrument
      }))
      if (cancelled) return
      setMarketSnapshots(updates.map((result, index) => result.status === 'fulfilled' ? result.value : marketInstruments[index]))
    }
    refreshMarketSnapshots()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/stocks.json`).then((r) => r.json()).catch(() => ({ stocks: fallbackStocks })),
      fetch(`${import.meta.env.BASE_URL}data/portfolio.json`).then((r) => r.json()).catch(() => fallbackPortfolio),
    ]).then(([stockPayload, portfolioData]) => {
      const stockData = Array.isArray(stockPayload) ? stockPayload : stockPayload.stocks
      const savedWatch = JSON.parse(localStorage.getItem('commandCenterWatchlist') || '[]') as Stock[]
      const savedPortfolio = JSON.parse(localStorage.getItem('commandCenterPortfolio') || 'null') as PortfolioSeed | null
      const merged = [...(stockData || fallbackStocks), ...savedWatch].filter((stock, index, all) => all.findIndex((s) => s.symbol === stock.symbol) === index)
      setStocks(merged)
      setPortfolio(savedPortfolio || portfolioData)
      setSelectedSymbol((current) => merged.some((stock) => stock.symbol === current) ? current : merged[0]?.symbol || 'NVDA')
    })
  }, [])

  useEffect(() => {
    function syncPanelFromHash() {
      const panel = window.location.hash.replace('#', '')
      if (panel === 'report' || panel === 'catalysts' || panel === 'risks' || panel === 'watchlist') setDetailPanel(panel)
    }
    syncPanelFromHash()
    window.addEventListener('hashchange', syncPanelFromHash)
    return () => window.removeEventListener('hashchange', syncPanelFromHash)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function refreshLivePrices() {
      const liveStocks = stocksRef.current.filter((stock) => liveSymbolsKey.split('|').includes(stock.symbol))
      const symbols = liveStocks.map((stock) => stock.symbol)
      if (!symbols.length) return
      const updates = await Promise.allSettled(liveStocks.map((stock) => fetchYahooQuote(stock.symbol, stock.price)))
      if (cancelled) return
      const updateMap = new Map<string, Partial<Stock>>()
      updates.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) updateMap.set(symbols[index], result.value)
      })
      if (!updateMap.size) {
        setLiveStatus('static')
        return
      }
      setStocks((current) => current.map((stock) => updateMap.has(stock.symbol) ? { ...stock, ...updateMap.get(stock.symbol) } : stock))
      setLiveStatus('live')
      setLastLiveUpdate(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    }
    refreshLivePrices()
    const interval = window.setInterval(refreshLivePrices, LIVE_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [liveSymbolsKey])

  async function refreshPricesNow() {
    const liveStocks = stocks.filter((stock) => liveSymbolsKey.split('|').includes(stock.symbol))
    const symbols = liveStocks.map((stock) => stock.symbol)
    if (!symbols.length || isRefreshing) return
    setIsRefreshing(true)
    setLiveStatus('loading')
    const updates = await Promise.allSettled(liveStocks.map((stock) => fetchYahooQuote(stock.symbol, stock.price)))
    const updateMap = new Map<string, Partial<Stock>>()
    updates.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) updateMap.set(symbols[index], result.value)
    })
    if (updateMap.size) {
      setStocks((current) => current.map((stock) => updateMap.has(stock.symbol) ? { ...stock, ...updateMap.get(stock.symbol) } : stock))
      setLiveStatus('live')
      setLastLiveUpdate(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    } else {
      setLiveStatus('static')
    }
    setIsRefreshing(false)
  }

  const allInstruments = useMemo(() => [...stocks, ...marketSnapshots], [marketSnapshots, stocks])
  const selected = allInstruments.find((stock) => stock.symbol === selectedSymbol) || stocks[0]
  const isMarketSelection = marketSnapshots.some((item) => item.symbol === selected.symbol)
  const filtered = useMemo(() => stocks.filter((stock) => {
    const matchesQuery = `${stock.symbol} ${stock.name}`.toLowerCase().includes(query.toLowerCase())
    const matchesCategory = !categoryFilter
      || (categoryFilter === 'AI & Semiconductors' && (stock.sector.includes('Semi') || ['NVDA', 'AVGO', 'ARM', 'TSM', 'QCOM', 'INTC', 'NVTS'].includes(stock.symbol)))
      || (categoryFilter === 'Cloud & Software' && (stock.sector.includes('Cloud') || stock.sector.includes('Software') || ['MSFT', 'ORCL', 'PLTR', 'GOOG', 'AMZN'].includes(stock.symbol)))
      || (categoryFilter === 'Consumer Tech' && ['AAPL', 'AMZN', 'GOOG', 'META'].includes(stock.symbol))
      || (categoryFilter === 'Watchlist' && portfolio.positions.some((position) => position.symbol === stock.symbol))
      || (categoryFilter === 'Long Term Holds' && ['NVDA', 'MSFT', 'AVGO', 'TSM', 'GOOG', 'META', 'AMZN', 'AAPL'].includes(stock.symbol))
    return matchesQuery && matchesCategory
  }), [categoryFilter, portfolio.positions, query, stocks])
  const positions = portfolio.positions.map((position) => ({ ...position, stock: stocks.find((stock) => stock.symbol === position.symbol) })).filter((p) => p.stock)
  const averageChange = positions.length ? positions.reduce((sum, position) => sum + (position.stock?.change || 0), 0) / positions.length : 0
  const gainers = positions.filter((position) => (position.stock?.change || 0) >= 0).length
  const grouped = stocks.reduce<Record<string, Stock[]>>((acc, stock) => {
    const key = stock.sector.includes('Semi') ? 'Semiconductors' : stock.sector.includes('Cloud') || stock.sector.includes('Software') ? 'Software' : stock.sector.includes('Consumer') ? 'Consumer Electronics' : stock.sector.includes('Communication') ? 'Consumer / Internet' : stock.sector.includes('Industrial') ? 'Industrials' : stock.sector
    acc[key] = [...(acc[key] || []), stock]
    return acc
  }, {})
  const sectorBoard = ['Semiconductors', 'Software', 'Consumer / Internet', 'Consumer Electronics', 'Industrials']
    .map((group) => ({ group, items: grouped[group] || [] }))
    .filter(({ items }) => items.length)
  const movers = [...stocks].sort((a, b) => b.change - a.change).slice(0, 5)
  const catalystRadar = [
    { label: 'Now', type: 'Primary', text: selected.catalysts[0] || selected.thesis, tone: selected.change >= 0 ? 'up' : 'down' },
    { label: 'Next', type: 'Bull trigger', text: selected.catalysts[1] || selected.opportunities[0] || 'Watch for confirmation in the next major update.', tone: 'up' },
    { label: 'Risk', type: 'Risk trigger', text: selected.risks[0] || selected.catalysts[2] || 'No specific risk trigger recorded yet.', tone: 'down' },
  ]
  const visibleWatchlist = query || categoryFilter ? filtered : stocks
  const hiddenWatchlistCount = query || categoryFilter ? 0 : Math.max(0, stocks.length - visibleWatchlist.length)
  const inPortfolio = saved.includes(selected.symbol)
  const marketStrip = marketSnapshots.map((item) => ({
    ...item,
    value: item.symbol === '10Y' ? `${item.price.toFixed(2)}%` : item.price >= 1000 ? item.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : money(item.price),
  }))
  const peerRows = [...stocks]
    .filter((stock) => stock.sector === selected.sector || stock.symbol === selected.symbol)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8)
  const chartSeries = useMemo(() => expandedSeries(selected, range), [range, selected])
  const chartChange = chartSeries.length > 1 ? ((chartSeries.at(-1)! - chartSeries[0]) / chartSeries[0]) * 100 : 0
  const activeRange = rangeConfig[range] || rangeConfig['1D']

  function addTicker() {
    const raw = query.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5)
    if (!raw) return
    const existing = stocks.find((stock) => stock.symbol === raw)
    if (existing) {
      setSelectedSymbol(existing.symbol)
      setQuery('')
      return
    }
    const generated: Stock = {
      symbol: raw,
      name: `${raw} Research Candidate`,
      sector: 'Watchlist',
      price: Number((40 + Math.random() * 240).toFixed(2)),
      change: Number((Math.random() * 8 - 4).toFixed(2)),
      marketCap: 'Research',
      pe: null,
      confidence: 62,
      thesis: 'Newly added research candidate. It is saved locally and ready for notes, portfolio tracking, and API enrichment.',
      risks: ['Needs real financial data', 'Unknown valuation setup', 'No catalyst history yet'],
      opportunities: ['Fresh research target', 'Can be promoted into portfolio tracking', 'Add notes and API enrichment later'],
      catalysts: ['User-added ticker', 'Awaiting data provider connection', 'Research queue item'],
      chart: Array.from({ length: 24 }, (_, i) => 60 + i * 1.5 + Math.sin(i) * 8),
      volume: 12,
    }
    const next = [...stocks, generated]
    setStocks(next)
    setSelectedSymbol(raw)
    localStorage.setItem('commandCenterWatchlist', JSON.stringify(next.filter((stock) => !fallbackStocks.some((seed) => seed.symbol === stock.symbol))))
    setQuery('')
  }

  function toggleSave() {
    const next = inPortfolio ? saved.filter((symbol) => symbol !== selected.symbol) : [...saved, selected.symbol]
    setSaved(next)
    localStorage.setItem('savedPortfolioSymbols', JSON.stringify(next))
  }

  function addSelectedHolding() {
    if (portfolio.positions.some((position) => position.symbol === selected.symbol)) return
    const next = { ...portfolio, positions: [...portfolio.positions, { symbol: selected.symbol }] }
    setPortfolio(next)
    localStorage.setItem('commandCenterPortfolio', JSON.stringify(next))
  }

  function openPanel(panel: Exclude<DetailPanel, null>) {
    setDetailPanel(panel)
    window.history.replaceState(null, '', `#${panel}`)
    window.setTimeout(() => document.querySelector('.detail-drawer')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  function closePanel() {
    setDetailPanel(null)
    window.history.replaceState(null, '', window.location.pathname)
  }

  function selectCategory(category: string) {
    setCategoryFilter((current) => current === category ? '' : category)
    setQuery('')
    openPanel('watchlist')
  }

  return (
    <main className="terminal">
      <nav className="rail">
        <div className="signal"><i/><i/><i/></div>
        {nav.map((item, index) => <button onClick={() => index === 0 ? openPanel('watchlist') : index === 1 ? openPanel('report') : index === 2 ? openPanel('catalysts') : index === 3 ? openPanel('risks') : setView('Portfolio')} className={index === 1 ? 'hot' : ''} key={item}>{item}</button>)}
      </nav>

      <aside className="watch-panel panel">
        <div className="brand"><span className="bars">▰</span><strong>Market Command Center</strong></div>
        <div className="watch-head"><span>Watchlists</span><button onClick={addTicker}>＋</button><button onClick={() => openPanel('watchlist')}>⋯</button></div>
        <button onClick={() => openPanel('watchlist')} className="watch-select">★ Tech Leaders <span>⌄</span></button>
        <div className="watch-labels"><span>Ticker</span><span>Price</span><span>24H %</span></div>
        <div className="watchlist">
          {visibleWatchlist.map((stock) => (
            <button key={stock.symbol} className={`watch ${stock.symbol === selected.symbol ? 'active' : ''}`} onClick={() => setSelectedSymbol(stock.symbol)}>
              <strong>{stock.symbol}</strong>
              <svg viewBox="0 0 90 28"><path d={sparkPath(stock.chart, 90, 28)} /></svg>
              <span>{money(stock.price)}</span>
              <b className={stock.change >= 0 ? 'up' : 'down'}>{stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%</b>
            </button>
          ))}
          {hiddenWatchlistCount > 0 && <div className="watch-more">+{hiddenWatchlistCount} more tracked names · search to filter</div>}
        </div>
        <div className="folders">
          {categories.map((category, index) => <button className={categoryFilter === category ? 'active' : ''} onClick={() => selectCategory(category)} key={category}>▸ {category}<b>{[8, 7, 6, positions.length, 8][index]}</b></button>)}
        </div>
        <div className="market-status">
          <span>Market Status <b>● Market Open</b></span>
          {['SPY', 'QQQ', 'IWM', 'VIX'].map((ticker, index) => <p key={ticker}><em>{ticker}</em><strong>{[532.54, 458.23, 210.17, 12.48][index]}</strong><b className={index === 3 ? 'down' : 'up'}>{index === 3 ? '-4.32%' : '+0.' + (index + 7) + '1%'}</b><svg viewBox="0 0 54 18"><path d="M0 14 L8 12 L15 13 L22 8 L30 10 L38 5 L46 7 L54 3" /></svg></p>)}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <label className="global-search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTicker()} placeholder="Search company or ticker…" /></label>
          <div className={`live-chip ${liveStatus}`}><i />{liveStatus === 'live' ? `Live prices ${lastLiveUpdate}` : liveStatus === 'loading' ? 'Connecting live prices' : 'Static fallback data'}<button onClick={refreshPricesNow} disabled={isRefreshing}>{isRefreshing ? 'Refreshing…' : 'Update prices'}</button></div>
          <div className="mode-tabs">{(['Research', 'News', 'Portfolio'] as const).map((tab) => <button className={view === tab ? 'selected' : ''} onClick={() => setView(tab)} key={tab}>▣ {tab}</button>)}</div>
          <div className="avatar">MC</div>
        </header>

        <section className="market-strip panel">
          {marketStrip.map((item) => <button onClick={() => setSelectedSymbol(item.symbol)} className={selected.symbol === item.symbol ? 'active' : ''} key={item.symbol}><strong>{item.symbol}</strong><span>{item.value}</span><b className={item.change >= 0 ? 'up' : 'down'}>{item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}%</b><svg viewBox="0 0 48 14"><path d="M0 10 L7 8 L13 9 L20 5 L27 7 L34 3 L41 5 L48 2" /></svg></button>)}
        </section>

        <div className="content-grid">
          <section className="main-stack">
            <section className="chart-panel panel">
              <div className="quote-head">
                <div><h1>{selected.symbol}</h1><strong>{money(selected.price)}</strong><span className={selected.change >= 0 ? 'up' : 'down'}>{selected.change >= 0 ? '+' : ''}{(selected.price * selected.change / 100).toFixed(2)} ({selected.change.toFixed(2)}%)</span><small className="source">{isMarketSelection ? 'Market benchmark snapshot' : selected.dataSource === 'live' ? 'Yahoo Finance live feed' : 'StockBot cached data'}</small></div>
                {!isMarketSelection && <button onClick={toggleSave} className="star">★</button>}
                <div className="quote-stats">
                  <span>Market Cap <b>{selected.marketCap}</b></span><span>P/E <b>{selected.pe ? selected.pe.toFixed(2) : '—'}</b></span><span>Rating <b>{selected.rating || 'Watch'}</b></span><span>Volume <b>{selected.volume || '—'}M</b></span><span>52W Range <b>{selected.range52w?.[0] && selected.range52w?.[1] ? `${selected.range52w[0]} - ${selected.range52w[1]}` : '—'}</b></span>
                  <span>Target <b>{compactMoney(selected.targetPrice)}</b></span><span>Target Gap <b className={selected.targetPrice && selected.targetPrice >= selected.price ? 'up' : 'down'}>{targetUpside(selected)}</b></span><span>Conviction <b>{selected.confidence}/100</b></span><span>Sector <b>{selected.sector}</b></span><span>Source <b>{sourceLabel(selected.dataSource)}</b></span>
                </div>
              </div>
              <div className="rangebar">{ranges.map((item) => <button className={range === item ? 'active' : ''} onClick={() => setRange(item)} key={item}>{item}</button>)}<button onClick={() => setIndicators(!indicators)} className="indicator">⌁ {indicators ? 'SMA on' : 'SMA off'}</button><button onClick={() => openPanel('report')}>⛶</button><button onClick={() => openPanel('catalysts')}>⋯</button></div>
              <div className="chart-toolbar"><div><strong>{range} performance</strong><span>{activeRange.label}</span></div><div className="chart-modes">{(['Line', 'Candles', 'Volume'] as ChartMode[]).map((mode) => <button className={chartMode === mode ? 'active' : ''} onClick={() => setChartMode(mode)} key={mode}>{mode}</button>)}</div><b className={chartChange >= 0 ? 'up' : 'down'}>{chartChange >= 0 ? '+' : ''}{chartChange.toFixed(2)}%</b></div>
              <div className="chart-wrap">
                <HighResolutionChart stock={selected} range={range} chartMode={chartMode} indicators={indicators} />
                <div className="unit-badge">USD / share · high-DPI interactive chart · hover candles for O/H/L/C</div>
              </div>
            </section>

            <section className="heat-panel panel">
              {sectorBoard.map(({ group, items }) => <div className="heat-sector" key={group}><span>{group}<b>{items.length}</b></span><div>{items.slice(0, 8).map((stock) => <button onClick={() => setSelectedSymbol(stock.symbol)} className={stock.change >= 0 ? 'gain' : 'loss'} key={stock.symbol}><strong>{stock.symbol}</strong><em>{stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%</em><small>{stock.marketCap}</small></button>)}</div></div>)}
            </section>

            <section className="research-deck">
              <article className="panel research-slice"><div className="card-title">Research Breakdown</div><strong>{selected.confidence}/100 conviction</strong><p>{selected.thesis}</p></article>
              <article className="panel research-slice"><div className="card-title">Catalysts to Watch</div>{selected.catalysts.slice(0,4).map((item) => <button onClick={() => openPanel('catalysts')} className="mini-catalyst" key={item}>{item}</button>)}</article>
              <article className="panel research-slice"><div className="card-title">Decision Frame</div><p><b className="up">Bull case:</b> {selected.opportunities[0]}</p><p><b className="down">Risk:</b> {selected.risks[0]}</p></article>
            </section>

            <section className="panel peer-table">
              <div className="card-title">Peer / Sector Comparison <button onClick={() => { setCategoryFilter(''); openPanel('watchlist') }}>{selected.sector}</button></div>
              <div className="peer-head"><span>Ticker</span><span>Last</span><span>%</span><span>Cap</span><span>P/E</span><span>Rating</span><span>Trend</span></div>
              {peerRows.map((stock) => <button key={stock.symbol} onClick={() => setSelectedSymbol(stock.symbol)} className={stock.symbol === selected.symbol ? 'active' : ''}><strong>{stock.symbol}</strong><span>${money(stock.price)}</span><b className={stock.change >= 0 ? 'up' : 'down'}>{stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%</b><span>{stock.marketCap}</span><span>{stock.pe ? stock.pe.toFixed(1) : '—'}</span><span>{stock.rating || 'Watch'}</span><svg viewBox="0 0 72 20"><path d={sparkPath(stock.chart, 72, 20)} /></svg></button>)}
            </section>

            <section className="bottom-grid">
              <div className="panel portfolio-card"><div className="card-title">Public Watchlist <button onClick={() => setView('Portfolio')}>No personal amounts</button></div><strong>{positions.length} tickers</strong><span className={averageChange >= 0 ? 'up' : 'down'}>{averageChange >= 0 ? '+' : ''}{averageChange.toFixed(2)}% average move · {gainers}/{positions.length} green</span><svg viewBox="0 0 280 90"><path d="M0 62 C35 20 70 84 105 46 S175 60 210 26 S250 55 280 18" /></svg><div className="mini-tabs">{['1D','1W','1M','3M','YTD','1Y','ALL'].map((x, i)=><button onClick={() => setRange(x)} className={range===x || (range === 'MAX' && x === 'ALL') || (i===0 && range==='1D')?'active':''} key={x}>{x}</button>)}</div></div>
              <div className="panel allocation"><div className="card-title">Watchlist Breakdown <button onClick={() => setView('Portfolio')}>Public</button></div><div className="donut"><b>{positions.length}</b><small>Names</small></div><ul><li><i/>Technology / AI <b>Core</b></li><li><i/>Semiconductors <b>Major</b></li><li><i/>Software & Cloud <b>Major</b></li><li><i/>Personal values <b>Hidden</b></li></ul></div>
              <div className="panel movers"><div className="card-title">Today’s Top Movers</div>{movers.map((stock) => <button onClick={() => setSelectedSymbol(stock.symbol)} key={stock.symbol}><strong>{stock.symbol}</strong><svg viewBox="0 0 70 22"><path d={sparkPath(stock.chart, 70, 22)} /></svg><span>{money(stock.price)}</span><b className={stock.change >= 0 ? 'up' : 'down'}>{stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%</b></button>)}</div>
            </section>

            <section className="terminal-grid">
              <article className="panel dense-list catalyst-radar-wide"><div className="card-title">Catalyst Radar <button onClick={() => openPanel('catalysts')}>{selected.symbol}</button></div>{catalystRadar.map((item) => <button className="radar-row" onClick={() => openPanel('catalysts')} key={`${item.label}-${item.text}`}><strong>{item.label}</strong><span>{item.text}</span><b className={item.tone}>{item.type}</b></button>)}</article>
              <article className="panel dense-list"><div className="card-title">Risk Matrix</div>{selected.risks.slice(0,4).map((item, index) => <p key={item}><strong>R{index + 1}</strong><span>{item}</span><b className="down">Watch</b></p>)}</article>
              <article className="panel dense-list"><div className="card-title">Opportunity Matrix</div>{selected.opportunities.slice(0,4).map((item, index) => <p key={item}><strong>O{index + 1}</strong><span>{item}</span><b className="up">Open</b></p>)}</article>
            </section>
          </section>

          <aside className="right-stack">
            <section className="panel catalyst-card"><div className="card-title">Catalyst Radar <button onClick={() => openPanel('catalysts')}>{selected.symbol}</button></div>{catalystRadar.map((item) => <article key={`${selected.symbol}-${item.label}`} onClick={() => openPanel('catalysts')}><span>{item.label}</span><strong>{item.text}</strong><b className={`${item.tone} badge`}>{item.type}</b></article>)}</section>
            <section className="panel ai-card"><div className="ai-label">AI</div><div className="card-title">AI Research Summary</div><h2>{selected.symbol} <small>{selected.name}</small></h2><b className="rating">⌁ {selected.confidence > 82 ? 'Strong Bullish' : selected.confidence > 68 ? 'Constructive' : 'Watch Carefully'}</b><p>{view === 'News' ? selected.catalysts.join(' · ') : view === 'Portfolio' ? `${selected.symbol} portfolio exposure can be tracked here. Save it, monitor catalysts, and compare it against the rest of the watchlist.` : selected.thesis}</p><div className="drivers"><span>Key Drivers</span>{selected.opportunities.slice(0,4).map((item) => <em key={item}>● {item}</em>)}</div><button onClick={() => openPanel('report')} className="full-report">View Full Research Report ›</button></section>
            {view === 'Portfolio' && <section className="panel holdings-editor"><div className="card-title">Public Tracker <button onClick={addSelectedHolding}>Track {selected.symbol}</button></div>{positions.map((position) => <div className="holding-row public" key={position.symbol}><strong>{position.symbol}</strong><span>{position.stock ? `$${money(position.stock.price)}` : 'No quote'}</span><b className={position.stock && position.stock.change >= 0 ? 'up' : 'down'}>{position.stock ? `${position.stock.change >= 0 ? '+' : ''}${position.stock.change.toFixed(2)}%` : '—'}</b></div>)}<small>Only ticker symbols and market performance are stored here. Cash, share counts, cost basis, and personal portfolio values are intentionally not included.</small></section>}
            <section className="panel risks"><div className="card-title">Risks & Opportunities <button onClick={() => openPanel('risks')}>View all</button></div><h3>Opportunities</h3>{selected.opportunities.slice(0,2).map((item) => <p className="good" key={item}>● {item}</p>)}<h3>Risks</h3>{selected.risks.slice(0,2).map((item) => <p className="bad" key={item}>● {item}</p>)}<button onClick={toggleSave} className="save">★ {inPortfolio ? 'Saved to Portfolio' : 'Save to Portfolio'}</button></section>
            <section className="panel market-summary"><div className="card-title">Market Summary</div><strong>S&P 500<br/>5,321.41</strong><span className="up">+0.71%</span><svg viewBox="0 0 230 72"><path d="M0 54 L18 50 L32 53 L45 43 L62 44 L78 34 L96 38 L113 30 L130 28 L147 35 L162 22 L178 26 L194 18 L213 20 L230 15" /></svg><div className="breadth"><span>Advancing <b>382</b></span><span>Declining <b>118</b></span><span>Unchanged <b>22</b></span></div><div className="bar"><i/><i/><i/></div></section>
          </aside>
        </div>
        {detailPanel && <section className="detail-drawer panel">
          <div className="drawer-head"><div><span className="eyebrow">Command detail</span><h2>{detailPanel === 'report' ? `${selected.symbol} Full Research Report` : detailPanel === 'catalysts' ? `${selected.symbol} Catalyst Radar` : detailPanel === 'risks' ? 'Risks & Opportunities' : 'Tracked StockBot Watchlist'}</h2></div><button onClick={closePanel}>Close ×</button></div>
          {detailPanel === 'report' && <div className="drawer-grid report-view"><article><h3>Thesis</h3><p>{selected.thesis}</p><dl><dt>Conviction</dt><dd>{selected.confidence}/100</dd><dt>Sector</dt><dd>{selected.sector}</dd><dt>Market cap</dt><dd>{selected.marketCap}</dd><dt>Rating</dt><dd>{selected.rating || 'Watch'}</dd><dt>Target</dt><dd>{selected.targetPrice ? `$${money(selected.targetPrice)}` : '—'}</dd></dl></article><article><h3>Catalysts</h3>{selected.catalysts.map((item) => <p key={item}>● {item}</p>)}<h3>Key drivers</h3>{selected.opportunities.map((item) => <p className="good" key={item}>+ {item}</p>)}</article><article><h3>Risk checklist</h3>{selected.risks.map((item) => <p className="bad" key={item}>− {item}</p>)}<button onClick={() => setView('Portfolio')} className="drawer-action">Track in public watchlist</button></article></div>}
          {detailPanel === 'catalysts' && <div className="drawer-grid report-view"><article><h3>What could move {selected.symbol}</h3>{catalystRadar.map((item) => <p key={item.label} className={item.tone === 'down' ? 'bad' : 'good'}><b>{item.label}:</b> {item.text}</p>)}</article><article><h3>Bull triggers</h3>{selected.opportunities.map((item) => <p className="good" key={item}>+ {item}</p>)}</article><article><h3>Risk triggers</h3>{selected.risks.map((item) => <p className="bad" key={item}>− {item}</p>)}</article></div>}
          {detailPanel === 'risks' && <div className="drawer-grid"><article><h3>Risks</h3>{selected.risks.map((item) => <p className="bad" key={item}>● {item}</p>)}</article><article><h3>Opportunities</h3>{selected.opportunities.map((item) => <p className="good" key={item}>● {item}</p>)}</article><article><h3>Decision frame</h3><p>Use this panel as the quick checklist for whether news changes the story. If a catalyst validates an opportunity, the stock deserves attention. If a risk moves from theoretical to active, it belongs on the watch list.</p></article></div>}
          {detailPanel === 'watchlist' && <div className="drawer-table watchlist-table">{filtered.map((stock) => <button key={stock.symbol} onClick={() => { setSelectedSymbol(stock.symbol); setDetailPanel('report') }}><strong>{stock.symbol}</strong><span>{stock.name}</span><span>${money(stock.price)}</span><b className={stock.change >= 0 ? 'up' : 'down'}>{stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%</b><small>{stock.sector}</small></button>)}</div>}
        </section>}
      </section>
    </main>
  )
}

export default App
