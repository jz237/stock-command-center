import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AreaSeries, CandlestickSeries, HistogramSeries, createChart, type IChartApi, type ISeriesApi, type Time } from 'lightweight-charts'
import './App.css'

// All market data comes from the JSON files committed/deployed by the
// scheduled GitHub Action (scripts/update-prices.mjs + update-history.mjs).
// Browsers cannot call Yahoo/Cboe/etc. directly — those APIs send no CORS
// headers — so there is intentionally no client-side quote fetching here.

type Stock = {
  symbol: string
  dataSymbol?: string
  kind?: 'equity' | 'instrument'
  name: string
  sector: string
  price: number
  change: number
  changeAmount?: number
  prevClose?: number
  dayLow?: number | null
  dayHigh?: number | null
  range52w?: [number, number]
  volume?: number | null
  currency?: string
  exchange?: string | null
  chart: number[]
  rating?: string
  confidence: number
  thesis: string
  risks: string[]
  opportunities: string[]
  catalysts: string[]
  quoteUpdatedAt?: string
}

type StocksPayload = { updatedAt: string; source?: string; stocks: Stock[] }
type PortfolioSeed = { positions: { symbol: string }[] }
type Holding = { shares: number; avgCost: number }
type CompactBar = [number | string, number, number, number, number, number]
type SeriesKey = 'i1d' | 'i5d' | 'd1y' | 'w5y' | 'mmax'
type HistoryPayload = { updatedAt: string; symbols: Record<string, Partial<Record<SeriesKey, CompactBar[]>>> }
type ChartRow = { time: Time; open: number; high: number; low: number; close: number; volume: number }

type DetailPanel = 'report' | 'research' | 'catalysts' | 'risks' | 'watchlist' | null
type ChartMode = 'Line' | 'Candles' | 'Volume'
type SortKey = 'default' | 'symbol' | 'price' | 'change'

const ranges = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'MAX'] as const
const rangeLabels: Record<string, string> = {
  '1D': 'Last session · 5 minute bars',
  '5D': '5 trading days · 30 minute bars',
  '1M': '1 month · daily bars',
  '3M': '3 months · daily bars',
  '6M': '6 months · daily bars',
  YTD: 'Year to date · daily bars',
  '1Y': '1 year · daily bars',
  '5Y': '5 years · weekly bars',
  MAX: 'Full history · monthly bars',
}
const DATA_REFRESH_MS = 10 * 60 * 1000

const fallbackStocks: Stock[] = [
  {
    symbol: 'NVDA', name: 'NVIDIA', sector: 'Semiconductors', price: 0, change: 0, confidence: 88,
    thesis: 'Data is still loading. If this message persists, the price data files could not be fetched.',
    risks: ['Data unavailable'], opportunities: ['Data unavailable'], catalysts: ['Data unavailable'], chart: [],
  },
]

function sparkPath(values: number[], width = 96, height = 34) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const points = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width
    const y = height - ((value - min) / Math.max(max - min, 1e-9)) * height
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

function bigNumber(value: number) {
  return value >= 1000 ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : money(value)
}

function fmtShares(value?: number | null) {
  if (!Number.isFinite(Number(value)) || !value) return '—'
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`
  return String(Math.round(value))
}

function changeAmount(stock: Stock) {
  return stock.changeAmount ?? (stock.prevClose ? stock.price - stock.prevClose : (stock.price * stock.change) / 100)
}

function pctIn52w(stock: Stock) {
  const [lo, hi] = stock.range52w || [0, 0]
  if (!lo || !hi || hi <= lo) return null
  return Math.round(((stock.price - lo) / (hi - lo)) * 100)
}

function setupLabel(stock: Stock) {
  if (stock.sector === 'Volatility') return stock.change > 0 ? 'Stress rising' : 'Stress easing'
  if (stock.sector === 'Rates') return stock.change > 0 ? 'Rate pressure' : 'Rate relief'
  if (stock.sector === 'Currency') return stock.change > 0 ? 'Dollar tightening' : 'Dollar easing'
  if (stock.confidence >= 84 && stock.change >= 0) return 'Bullish momentum'
  if (stock.confidence >= 72) return 'Constructive setup'
  if (stock.change < -2) return 'Caution / reset'
  return 'Needs confirmation'
}

function actionPosture(stock: Stock) {
  if (stock.sector === 'Volatility') return stock.change > 0 ? 'Respect risk-off signals' : 'Risk appetite improving'
  if (stock.sector === 'Rates') return stock.change > 0 ? 'Watch growth-stock pressure' : 'Rate backdrop supportive'
  if (stock.sector === 'Currency') return stock.change > 0 ? 'Dollar strength may tighten liquidity' : 'Dollar relief can help risk assets'
  if (stock.confidence >= 84 && stock.change >= 1) return 'Momentum active'
  if (stock.confidence >= 74) return 'Watch pullbacks'
  if (stock.change < -2) return 'Wait for stabilization'
  return 'Monitor for catalyst confirmation'
}

// US regular session approximation (client-side, no holiday table — the data
// freshness chip is the authoritative signal).
function isMarketSession(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value || ''
  if (get('weekday') === 'Sat' || get('weekday') === 'Sun') return false
  const minutes = Number(get('hour')) * 60 + Number(get('minute'))
  return minutes >= 9 * 60 + 30 && minutes <= 16 * 60
}

function movingAverage(values: number[], windowSize = 8) {
  return values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1)
    const slice = values.slice(start, index + 1)
    return slice.reduce((sum, value) => sum + value, 0) / slice.length
  })
}

function inflate(bars: CompactBar[]): ChartRow[] {
  return bars.map(([time, open, high, low, close, volume]) => ({ time: time as Time, open, high, low, close, volume }))
}

function rowsForRange(history: HistoryPayload | null, stock: Stock, range: string): ChartRow[] | null {
  const series = history?.symbols?.[stock.dataSymbol || stock.symbol]
  if (!series) return null
  let rows: ChartRow[] | null = null
  if (range === '1D' && series.i1d) rows = inflate(series.i1d)
  else if (range === '5D' && series.i5d) rows = inflate(series.i5d)
  else if (range === '5Y' && series.w5y) rows = inflate(series.w5y)
  else if (range === 'MAX' && series.mmax) rows = inflate(series.mmax)
  else if (series.d1y) {
    const daily = inflate(series.d1y)
    if (range === '1M') rows = daily.slice(-22)
    else if (range === '3M') rows = daily.slice(-64)
    else if (range === '6M') rows = daily.slice(-128)
    else if (range === 'YTD') {
      const jan1 = `${new Date().getFullYear()}-01-01`
      rows = daily.filter((row) => String(row.time) >= jan1)
    } else if (range === '1Y') rows = daily
  }
  return rows && rows.length >= 2 ? rows : null
}

function HistoryChart({ chartMode, history, indicators, range, stock }: { chartMode: ChartMode; history: HistoryPayload | null; indicators: boolean; range: string; stock: Stock }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const areaRef = useRef<ISeriesApi<'Area'> | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const maRef = useRef<ISeriesApi<'Area'> | null>(null)
  const [hover, setHover] = useState<{ open: number; high: number; low: number; close: number } | null>(null)

  const rows = useMemo(() => rowsForRange(history, stock, range), [history, range, stock])
  const hasVolume = useMemo(() => (rows || []).some((row) => row.volume > 0), [rows])

  useEffect(() => {
    if (!containerRef.current || !rows) return
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
    return () => {
      chart.remove()
      chartRef.current = null
    }
    // rows is checked only for existence here; data updates happen below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, !rows])

  useEffect(() => {
    if (!rows || !chartRef.current) return
    const areaData = rows.map((row) => ({ time: row.time, value: row.close }))
    const volumeData = rows.map((row) => ({ time: row.time, value: row.volume, color: row.close >= row.open ? 'rgba(64,217,130,.28)' : 'rgba(240,82,104,.28)' }))
    const maData = movingAverage(rows.map((row) => row.close), range === '1D' ? 8 : 14).map((value, index) => ({ time: rows[index].time, value }))
    areaRef.current?.setData(areaData)
    candleRef.current?.setData(rows)
    volumeRef.current?.setData(volumeData)
    maRef.current?.setData(maData)
    areaRef.current?.applyOptions({ visible: chartMode === 'Line' })
    candleRef.current?.applyOptions({ visible: chartMode === 'Candles' })
    volumeRef.current?.applyOptions({ visible: hasVolume && (chartMode === 'Candles' || chartMode === 'Volume') })
    maRef.current?.applyOptions({ visible: indicators && chartMode !== 'Volume' })
    chartRef.current.timeScale().fitContent()
  }, [chartMode, hasVolume, indicators, range, rows])

  if (!rows) {
    return <div className="hires-chart"><div className="chart-empty">No chart history available for {stock.symbol} ({range}).<br /><small>History refreshes with the next scheduled data update.</small></div></div>
  }
  return (
    <div className="hires-chart">
      <div className="real-chart" ref={containerRef} />
      {hover && chartMode === 'Candles' && <div className="ohlc-readout"><span>O <b>{money(hover.open)}</b></span><span>H <b>{money(hover.high)}</b></span><span>L <b>{money(hover.low)}</b></span><span>C <b>{money(hover.close)}</b></span></div>}
      {history && <div className="chart-source live">Yahoo OHLC · {new Date(history.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>}
    </div>
  )
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function App() {
  const [stocksPayload, setStocksPayload] = useState<StocksPayload | null>(null)
  const [history, setHistory] = useState<HistoryPayload | null>(null)
  const [portfolio, setPortfolio] = useState<PortfolioSeed>({ positions: [] })
  const [holdings, setHoldings] = useState<Record<string, Holding>>(() => readJson('commandCenterHoldings', {}))
  const [dataStatus, setDataStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedSymbol, setSelectedSymbol] = useState('NVDA')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('default')
  const [sortDir, setSortDir] = useState(1)
  const [range, setRange] = useState('1D')
  const [chartMode, setChartMode] = useState<ChartMode>('Candles')
  const [view, setView] = useState<'Research' | 'News' | 'Portfolio'>('Research')
  const [indicators, setIndicators] = useState(true)
  const [starred, setStarred] = useState<string[]>(() => readJson('savedPortfolioSymbols', []))
  const [detailPanel, setDetailPanel] = useState<DetailPanel>(null)
  const [focusedCatalyst, setFocusedCatalyst] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const searchRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(tick)
  }, [])

  const loadData = useCallback(async (bust = false) => {
    const suffix = bust ? `?t=${Date.now()}` : ''
    setIsRefreshing(true)
    try {
      const [stocksData, portfolioData, historyData] = await Promise.all([
        fetch(`${import.meta.env.BASE_URL}data/stocks.json${suffix}`).then((r) => r.json() as Promise<StocksPayload>),
        fetch(`${import.meta.env.BASE_URL}data/portfolio.json${suffix}`).then((r) => r.json() as Promise<PortfolioSeed>).catch(() => null),
        fetch(`${import.meta.env.BASE_URL}data/history.json${suffix}`).then((r) => r.json() as Promise<HistoryPayload>).catch(() => null),
      ])
      if (!Array.isArray(stocksData.stocks)) throw new Error('unexpected stocks.json shape')
      setStocksPayload(stocksData)
      if (historyData) setHistory(historyData)
      const savedPortfolio = readJson<PortfolioSeed | null>('commandCenterPortfolio', null)
      if (savedPortfolio?.positions?.length) setPortfolio(savedPortfolio)
      else if (portfolioData?.positions) setPortfolio(portfolioData)
      setDataStatus('ready')
    } catch {
      setDataStatus((current) => (current === 'ready' ? 'ready' : 'error'))
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const initial = window.setTimeout(() => loadData(), 0)
    const interval = window.setInterval(() => loadData(true), DATA_REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadData(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loadData])

  useEffect(() => {
    function syncPanelFromHash() {
      const panel = window.location.hash.replace('#', '')
      if (panel === 'report' || panel === 'research' || panel === 'catalysts' || panel === 'risks' || panel === 'watchlist') setDetailPanel(panel)
    }
    syncPanelFromHash()
    window.addEventListener('hashchange', syncPanelFromHash)
    return () => window.removeEventListener('hashchange', syncPanelFromHash)
  }, [])

  const allInstruments = useMemo(() => stocksPayload?.stocks || fallbackStocks, [stocksPayload])
  const stocks = useMemo(() => allInstruments.filter((stock) => (stock.kind || 'equity') === 'equity'), [allInstruments])
  const marketSnapshots = useMemo(() => allInstruments.filter((stock) => stock.kind === 'instrument'), [allInstruments])
  const selected = allInstruments.find((stock) => stock.symbol === selectedSymbol) || stocks[0] || fallbackStocks[0]
  const isMarketSelection = selected.kind === 'instrument'

  const categories = useMemo(() => {
    const defs: { name: string; member: (stock: Stock) => boolean }[] = [
      { name: 'AI & Semiconductors', member: (s) => s.sector.includes('Semi') || ['NVDA', 'AVGO', 'ARM', 'TSM', 'QCOM', 'INTC', 'NVTS'].includes(s.symbol) },
      { name: 'Cloud & Software', member: (s) => s.sector.includes('Cloud') || s.sector.includes('Software') || ['MSFT', 'ORCL', 'PLTR', 'GOOG', 'AMZN', 'CRWV', 'SOUN'].includes(s.symbol) },
      { name: 'Consumer Tech', member: (s) => ['AAPL', 'AMZN', 'GOOG', 'META'].includes(s.symbol) },
      { name: 'Portfolio', member: (s) => portfolio.positions.some((p) => p.symbol === s.symbol) },
      { name: '★ Starred', member: (s) => starred.includes(s.symbol) },
    ]
    return defs.map(({ name, member }) => ({ name, member, count: stocks.filter(member).length }))
  }, [portfolio.positions, starred, stocks])

  const filtered = useMemo(() => {
    const active = categories.find((category) => category.name === categoryFilter)
    let list = stocks.filter((stock) => {
      const matchesQuery = `${stock.symbol} ${stock.name}`.toLowerCase().includes(query.toLowerCase())
      return matchesQuery && (!active || active.member(stock))
    })
    if (sortKey !== 'default') {
      list = [...list].sort((a, b) => {
        if (sortKey === 'symbol') return a.symbol.localeCompare(b.symbol) * sortDir
        if (sortKey === 'price') return (a.price - b.price) * sortDir
        return (a.change - b.change) * sortDir
      })
    }
    return list
  }, [categories, categoryFilter, query, sortDir, sortKey, stocks])

  const positions = useMemo(() => portfolio.positions
    .map((position) => ({ ...position, stock: stocks.find((stock) => stock.symbol === position.symbol) }))
    .filter((position): position is { symbol: string; stock: Stock } => Boolean(position.stock)), [portfolio.positions, stocks])

  const plSummary = useMemo(() => {
    let value = 0
    let cost = 0
    let dayPl = 0
    let held = 0
    for (const position of positions) {
      const holding = holdings[position.symbol]
      if (!holding || !(holding.shares > 0)) continue
      held += 1
      value += holding.shares * position.stock.price
      cost += holding.shares * holding.avgCost
      dayPl += holding.shares * changeAmount(position.stock)
    }
    return { value, cost, dayPl, held, totalPl: value - cost, totalPlPct: cost > 0 ? ((value - cost) / cost) * 100 : 0 }
  }, [holdings, positions])

  const grouped = stocks.reduce<Record<string, Stock[]>>((acc, stock) => {
    const key = stock.sector.includes('Semi') ? 'Semiconductors' : stock.sector.includes('Cloud') || stock.sector.includes('Software') ? 'Software' : stock.sector.includes('Consumer') ? 'Consumer Tech' : stock.sector.includes('Communication') ? 'Consumer / Internet' : stock.sector.includes('Industrial') ? 'Industrials' : stock.sector
    acc[key] = [...(acc[key] || []), stock]
    return acc
  }, {})
  const sectorBoard = Object.entries(grouped).map(([group, items]) => ({ group, items })).filter(({ items }) => items.length)

  const movers = [...stocks]
    .filter((stock) => Number.isFinite(stock.change) && Number.isFinite(stock.price))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 8)

  const catalystRadar = [
    { label: 'Now', type: 'Primary', text: selected.catalysts[0] || selected.thesis, tone: selected.change >= 0 ? 'up' : 'down' },
    { label: 'Next', type: 'Bull trigger', text: selected.catalysts[1] || selected.opportunities[0] || 'Watch for confirmation in the next major update.', tone: 'up' },
    { label: 'Risk', type: 'Risk trigger', text: selected.risks[0] || selected.catalysts[2] || 'No specific risk trigger recorded yet.', tone: 'down' },
  ]
  const catalystWorkbench = [
    ...selected.catalysts.map((text, index) => ({ label: index === 0 ? 'Primary' : `C${index + 1}`, type: index === 0 ? 'Main catalyst' : 'Watch item', text, tone: index < 2 ? 'up' : 'neutral' })),
    ...selected.opportunities.slice(0, 4).map((text, index) => ({ label: `Bull ${index + 1}`, type: 'Upside trigger', text, tone: 'up' })),
    ...selected.risks.slice(0, 4).map((text, index) => ({ label: `Risk ${index + 1}`, type: 'Downside trigger', text, tone: 'down' })),
  ]
  const activeCatalyst = catalystWorkbench.find((item) => item.text === focusedCatalyst) || catalystWorkbench[0]
  const investmentReadout = [
    { label: 'Setup', value: setupLabel(selected), text: `${selected.symbol} is currently a ${setupLabel(selected).toLowerCase()} story based on conviction, recent move, and instrument type.`, tone: selected.change >= 0 ? 'up' : 'down' },
    { label: 'Why it matters', value: 'Thesis', text: selected.thesis, tone: 'neutral' },
    { label: 'Confirms it', value: 'Bull case', text: selected.opportunities[0] || selected.catalysts[0] || 'Needs a clear confirming catalyst.', tone: 'up' },
    { label: 'Breaks it', value: 'Risk case', text: selected.risks[0] || 'No explicit break point recorded yet.', tone: 'down' },
    { label: 'Posture', value: actionPosture(selected), text: actionPosture(selected), tone: selected.change >= 0 ? 'up' : 'neutral' },
  ]

  const isStarred = starred.includes(selected.symbol)
  const marketOpen = isMarketSession(new Date(now))
  const dataAgeMinutes = stocksPayload ? Math.max(0, Math.round((now - new Date(stocksPayload.updatedAt).getTime()) / 60000)) : null
  const dataStale = marketOpen && dataAgeMinutes !== null && dataAgeMinutes > 45
  const dataChipLabel = dataStatus === 'loading' ? 'Loading market data…'
    : dataStatus === 'error' ? 'Data files unavailable'
    : `Data as of ${new Date(stocksPayload!.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}${dataStale ? ' · stale' : ''}`

  const marketStrip = marketSnapshots.map((item) => ({
    ...item,
    value: item.sector === 'Rates' ? `${item.price.toFixed(2)}%` : bigNumber(item.price),
  }))
  const marketSummary = marketSnapshots[0]
  const marketBreadth = {
    advancing: stocks.filter((stock) => stock.change > 0).length,
    declining: stocks.filter((stock) => stock.change < 0).length,
    unchanged: stocks.filter((stock) => stock.change === 0).length,
  }
  const breadthTotal = Math.max(1, marketBreadth.advancing + marketBreadth.declining + marketBreadth.unchanged)
  const peerUniverse = isMarketSelection ? marketSnapshots : stocks
  const peerRows = [...peerUniverse]
    .filter((stock) => stock.sector === selected.sector || stock.symbol === selected.symbol)
    .sort((a, b) => (b.confidence - a.confidence) || (b.change - a.change))
    .slice(0, 10)
  const chartRows = useMemo(() => rowsForRange(history, selected, range), [history, range, selected])
  const chartChange = chartRows && chartRows.length > 1 ? ((chartRows.at(-1)!.close - chartRows[0].close) / chartRows[0].close) * 100 : null

  const statusInstruments = marketSnapshots.filter((item) => ['S&P', 'NASDAQ', 'VIX', '10Y'].includes(item.symbol))

  function searchEnter() {
    if (filtered.length) {
      setSelectedSymbol(filtered[0].symbol)
      setQuery('')
    }
  }

  function toggleStar() {
    const next = isStarred ? starred.filter((symbol) => symbol !== selected.symbol) : [...starred, selected.symbol]
    setStarred(next)
    localStorage.setItem('savedPortfolioSymbols', JSON.stringify(next))
  }

  function savePortfolio(next: PortfolioSeed) {
    setPortfolio(next)
    localStorage.setItem('commandCenterPortfolio', JSON.stringify(next))
  }

  function addSelectedHolding() {
    if (isMarketSelection || portfolio.positions.some((position) => position.symbol === selected.symbol)) return
    savePortfolio({ ...portfolio, positions: [...portfolio.positions, { symbol: selected.symbol }] })
  }

  function removeHolding(symbol: string) {
    savePortfolio({ ...portfolio, positions: portfolio.positions.filter((position) => position.symbol !== symbol) })
  }

  function updateHolding(symbol: string, patch: Partial<Holding>) {
    const current = holdings[symbol] || { shares: 0, avgCost: 0 }
    const next = { ...holdings, [symbol]: { ...current, ...patch } }
    setHoldings(next)
    localStorage.setItem('commandCenterHoldings', JSON.stringify(next))
  }

  function openPanel(panel: Exclude<DetailPanel, null>) {
    setDetailPanel(panel)
    window.history.replaceState(null, '', `#${panel}`)
    if (panel !== 'research' && panel !== 'catalysts') {
      window.setTimeout(() => document.querySelector('.detail-drawer')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
    }
  }

  function openCatalysts(text?: string) {
    if (text) setFocusedCatalyst(text)
    else setFocusedCatalyst(selected.catalysts[0] || selected.opportunities[0] || selected.thesis)
    openPanel('catalysts')
  }

  function openNewsSearch(text: string, stock: Stock = selected) {
    const newsQuery = encodeURIComponent(`${stock.symbol} ${stock.name} ${text}`)
    window.open(`https://www.google.com/search?tbm=nws&q=${newsQuery}`, '_blank', 'noopener,noreferrer')
  }

  function closePanel() {
    setDetailPanel(null)
    window.history.replaceState(null, '', window.location.pathname)
  }

  function selectCategory(category: string) {
    setCategoryFilter((current) => (current === category ? '' : category))
    setQuery('')
  }

  function sortBy(key: SortKey) {
    if (sortKey === key) {
      if (sortDir === 1) setSortDir(-1)
      else {
        setSortKey('default')
        setSortDir(1)
      }
    } else {
      setSortKey(key)
      setSortDir(1)
    }
  }

  const sortMark = (key: SortKey) => (sortKey === key ? (sortDir === 1 ? ' ▲' : ' ▼') : '')

  return (
    <main className="terminal">
      <nav className="rail">
        <a className="home-link" href="https://jz237.github.io/jez237-site/?v=3fee6936" title="Back to homepage" aria-label="Back to homepage"><span>⌂</span><b>Home</b></a>
        <button title="Watchlist table" onClick={() => openPanel('watchlist')}>▦</button>
        <button title="Full research report" className="hot" onClick={() => openPanel('report')}>▧</button>
        <button title="Catalyst workbench" onClick={() => openCatalysts()}>▤</button>
        <button title="Risks & opportunities" onClick={() => openPanel('risks')}>▭</button>
        <button title="Portfolio view" onClick={() => setView('Portfolio')}>⚙</button>
      </nav>

      <aside className="watch-panel panel">
        <div className="brand"><span className="bars">▰</span><strong>Market Command Center</strong></div>
        <div className="watch-head"><span>Watchlist</span><button title="Search tickers" onClick={() => searchRef.current?.focus()}>⌕</button><button title="Open watchlist table" onClick={() => openPanel('watchlist')}>⋯</button></div>
        <div className="watch-labels">
          <button onClick={() => sortBy('symbol')}>Ticker{sortMark('symbol')}</button>
          <button onClick={() => sortBy('price')}>Price{sortMark('price')}</button>
          <button onClick={() => sortBy('change')}>24H %{sortMark('change')}</button>
        </div>
        <div className="watchlist">
          {filtered.map((stock) => (
            <button key={stock.symbol} className={`watch ${stock.symbol === selected.symbol ? 'active' : ''}`} onClick={() => setSelectedSymbol(stock.symbol)}>
              <strong>{starred.includes(stock.symbol) ? '★ ' : ''}{stock.symbol}</strong>
              <svg viewBox="0 0 90 28"><path d={sparkPath(stock.chart, 90, 28)} /></svg>
              <span>{money(stock.price)}</span>
              <b className={stock.change >= 0 ? 'up' : 'down'}>{stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%</b>
            </button>
          ))}
          {!filtered.length && <div className="watch-more">No tickers match{query ? ` “${query}”` : ''}{categoryFilter ? ` in ${categoryFilter}` : ''}.</div>}
        </div>
        <div className="folders">
          {categories.map((category) => <button className={categoryFilter === category.name ? 'active' : ''} onClick={() => selectCategory(category.name)} key={category.name}>▸ {category.name}<b>{category.count}</b></button>)}
        </div>
        <div className="market-status">
          <span>Market Status <b className={marketOpen ? 'up' : 'down'}>● {marketOpen ? 'Market Open' : 'Market Closed'}</b></span>
          {statusInstruments.map((item) => (
            <p key={item.symbol}>
              <em>{item.symbol}</em>
              <strong>{item.sector === 'Rates' ? `${item.price.toFixed(2)}%` : bigNumber(item.price)}</strong>
              <b className={item.change >= 0 ? 'up' : 'down'}>{item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}%</b>
              <svg viewBox="0 0 54 18"><path d={sparkPath(item.chart.slice(-20), 54, 18)} /></svg>
            </p>
          ))}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <label className="global-search"><span>⌕</span><input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchEnter()} placeholder="Search company or ticker…" /></label>
          <div className={`live-chip ${dataStatus === 'loading' ? 'loading' : dataStatus === 'error' || dataStale ? 'static' : 'live'}`}><i />{dataChipLabel}<button onClick={() => loadData(true)} disabled={isRefreshing}>{isRefreshing ? 'Refreshing…' : 'Refresh'}</button></div>
          <div className="mode-tabs">{(['Research', 'News', 'Portfolio'] as const).map((tab) => <button className={view === tab ? 'selected' : ''} onClick={() => setView(tab)} key={tab}>▣ {tab}</button>)}</div>
        </header>

        <section className="market-strip panel">
          {marketStrip.map((item) => <button onClick={() => setSelectedSymbol(item.symbol)} className={selected.symbol === item.symbol ? 'active' : ''} key={item.symbol}><strong>{item.symbol}</strong><span>{item.value}</span><b className={item.change >= 0 ? 'up' : 'down'}>{item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}%</b><svg viewBox="0 0 48 14"><path d={sparkPath(item.chart.slice(-24), 48, 14)} /></svg></button>)}
        </section>

        <div className="content-grid">
          <section className="main-stack">
            <section className="chart-panel panel">
              <div className="quote-head">
                <div>
                  <h1>{selected.symbol}</h1>
                  <strong>{selected.sector === 'Rates' ? `${selected.price.toFixed(2)}%` : money(selected.price)}</strong>
                  <span className={selected.change >= 0 ? 'up' : 'down'}>{changeAmount(selected) >= 0 ? '+' : ''}{money(changeAmount(selected))} ({selected.change >= 0 ? '+' : ''}{selected.change.toFixed(2)}%)</span>
                  <small className="source">{selected.name}{selected.exchange ? ` · ${selected.exchange}` : ''}</small>
                </div>
                {!isMarketSelection && <button onClick={toggleStar} className={`star ${isStarred ? 'on' : ''}`} title={isStarred ? 'Remove from starred' : 'Add to starred'}>{isStarred ? '★' : '☆'}</button>}
                <div className="quote-stats">
                  <span>Prev Close <b>{selected.prevClose ? money(selected.prevClose) : '—'}</b></span>
                  <span>Day Range <b>{selected.dayLow && selected.dayHigh ? `${money(selected.dayLow)} – ${money(selected.dayHigh)}` : '—'}</b></span>
                  <span>52W Range <b>{selected.range52w ? `${money(selected.range52w[0])} – ${money(selected.range52w[1])}` : '—'}</b></span>
                  <span>52W Position <b>{pctIn52w(selected) !== null ? `${pctIn52w(selected)}%` : '—'}</b></span>
                  <span>Volume <b>{fmtShares(selected.volume)}</b></span>
                  <span>Rating <b>{selected.rating || 'Watch'}</b></span>
                  <span>Conviction <b>{selected.confidence}/100</b></span>
                  <span>Sector <b>{selected.sector}</b></span>
                  <span>Currency <b>{selected.currency || 'USD'}</b></span>
                  <span>Quote Time <b>{selected.quoteUpdatedAt ? new Date(selected.quoteUpdatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</b></span>
                </div>
              </div>
              <div className="rangebar">{ranges.map((item) => <button className={range === item ? 'active' : ''} onClick={() => setRange(item)} key={item}>{item}</button>)}<button onClick={() => setIndicators(!indicators)} className="indicator">⌁ {indicators ? 'SMA on' : 'SMA off'}</button><button title="Full report" onClick={() => openPanel('report')}>⛶</button><button title="Catalysts" onClick={() => openCatalysts()}>⋯</button></div>
              <div className="chart-toolbar"><div><strong>{range} performance</strong><span>{rangeLabels[range]}</span></div><div className="chart-modes">{(['Line', 'Candles', 'Volume'] as ChartMode[]).map((mode) => <button className={chartMode === mode ? 'active' : ''} onClick={() => setChartMode(mode)} key={mode}>{mode}</button>)}</div><b className={chartChange === null ? '' : chartChange >= 0 ? 'up' : 'down'}>{chartChange === null ? '—' : `${chartChange >= 0 ? '+' : ''}${chartChange.toFixed(2)}%`}</b></div>
              <div className="chart-wrap">
                <HistoryChart stock={selected} range={range} chartMode={chartMode} indicators={indicators} history={history} />
                <div className="unit-badge">{selected.currency || 'USD'}{isMarketSelection ? '' : ' / share'} · hover candles for O/H/L/C</div>
              </div>
            </section>

            <section className="heat-panel panel">
              {sectorBoard.map(({ group, items }) => <div className="heat-sector" key={group}><span>{group}<b>{items.length}</b></span><div>{items.slice(0, 8).map((stock) => <button onClick={() => setSelectedSymbol(stock.symbol)} className={stock.change >= 0 ? 'gain' : 'loss'} key={stock.symbol}><strong>{stock.symbol}</strong><em>{stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%</em><small>${money(stock.price)}</small></button>)}</div></div>)}
            </section>

            <section className="research-deck">
              <article className="panel research-slice readout-slice" onClick={() => openPanel('research')}><div className="card-title">Investment Readout <button>{selected.symbol}</button></div><strong>{setupLabel(selected)}</strong><p>{actionPosture(selected)} · {selected.thesis}</p></article>
              <article className="panel research-slice catalyst-slice" onClick={() => openCatalysts()}><div className="card-title">Catalysts to Watch</div>{selected.catalysts.slice(0, 4).map((item) => <button onClick={(event) => { event.stopPropagation(); openCatalysts(item) }} className="mini-catalyst" key={item}>{item}</button>)}</article>
              <article className="panel research-slice decision-slice"><div className="card-title">Decision Frame <button>{selected.change >= 0 ? 'Constructive' : 'Caution'}</button></div><p><b className="up">Stay interested if:</b> {selected.opportunities[0]}</p><p><b className="down">Reassess if:</b> {selected.risks[0]}</p><small>Next check: {selected.catalysts[0] || 'fresh catalyst update'}</small></article>
            </section>

            <section className="panel peer-table">
              <div className="card-title">Peer / Sector Comparison <button onClick={() => { setCategoryFilter(''); openPanel('watchlist') }}>{selected.sector}</button></div>
              <div className="peer-head"><span>Ticker</span><span>Name</span><span>Last</span><span>%</span><span>Volume</span><span>52W Pos</span><span>Rating</span><span>Conv.</span><span>Trend</span></div>
              {peerRows.map((stock) => <button key={stock.symbol} onClick={() => setSelectedSymbol(stock.symbol)} className={stock.symbol === selected.symbol ? 'active' : ''}><strong>{stock.symbol}</strong><span>{stock.name}</span><span>{stock.sector === 'Rates' ? `${money(stock.price)}%` : `$${money(stock.price)}`}</span><b className={stock.change >= 0 ? 'up' : 'down'}>{stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%</b><span>{fmtShares(stock.volume)}</span><span>{pctIn52w(stock) !== null ? `${pctIn52w(stock)}%` : '—'}</span><span>{stock.rating || 'Watch'}</span><span>{stock.confidence}/100</span><svg viewBox="0 0 96 22"><path d={sparkPath(stock.chart, 96, 22)} /></svg></button>)}
            </section>

            <section className="bottom-grid movers-grid">
              <div className="panel movers"><div className="card-title">Today’s Top Movers <button>{dataAgeMinutes !== null ? `${dataAgeMinutes}m ago` : '…'}</button></div>{movers.map((stock) => <button onClick={() => setSelectedSymbol(stock.symbol)} key={stock.symbol}><strong>{stock.symbol}</strong><svg viewBox="0 0 96 24"><path d={sparkPath(stock.chart, 96, 24)} /></svg><span>{stock.name}</span><span>${money(stock.price)}</span><b className={stock.change >= 0 ? 'up' : 'down'}>{stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%</b><small>{stock.sector}</small></button>)}</div>
            </section>

            <section className="terminal-grid">
              <article className="panel dense-list catalyst-radar-wide"><div className="card-title">Catalyst Radar <button onClick={() => openCatalysts()}>{selected.symbol}</button></div>{catalystRadar.map((item) => <button className="radar-row" onClick={() => openCatalysts(item.text)} key={`${item.label}-${item.text}`}><strong>{item.label}</strong><span>{item.text}</span><b className={item.tone}>{item.type}</b></button>)}</article>
              <article className="panel dense-list"><div className="card-title">Risk Matrix</div>{selected.risks.slice(0, 4).map((item, index) => <p key={item}><strong>R{index + 1}</strong><span>{item}</span><b className="down">Watch</b></p>)}</article>
              <article className="panel dense-list"><div className="card-title">Opportunity Matrix</div>{selected.opportunities.slice(0, 4).map((item, index) => <p key={item}><strong>O{index + 1}</strong><span>{item}</span><b className="up">Open</b></p>)}</article>
            </section>
          </section>

          <aside className={`right-stack ${detailPanel === 'catalysts' || detailPanel === 'research' ? 'catalyst-mode' : ''}`}>
            {detailPanel === 'research' ? <section className="panel catalyst-workbench readout-workbench"><div className="card-title">{selected.symbol} Investment Readout <button onClick={closePanel}>Collapse</button></div><p className="workbench-note">Plain-English decision frame for the selected stock or market instrument.</p>{investmentReadout.map((item) => <button className="workbench-row" onClick={() => openPanel('report')} key={`${item.label}-${item.text}`}><span>{item.label}</span><strong>{item.text}</strong><b className={item.tone}>{item.value}</b></button>)}</section> : detailPanel === 'catalysts' ? <section className="panel catalyst-workbench"><div className="card-title">{selected.symbol} Catalyst Workbench <button onClick={closePanel}>Collapse</button></div>{activeCatalyst && <div className="focused-catalyst"><span>Focused catalyst</span><strong>{activeCatalyst.text}</strong><button onClick={() => openNewsSearch(activeCatalyst.text)}>Open news</button></div>}<p className="workbench-note">Catalyst mode stays active as you change stocks. Click any item to open a live news search.</p>{catalystWorkbench.map((item) => <button className={`workbench-row ${activeCatalyst?.text === item.text ? 'active' : ''}`} onClick={() => { setFocusedCatalyst(item.text); openNewsSearch(item.text) }} key={`${item.label}-${item.text}`}><span>{item.label}</span><strong>{item.text}</strong><b className={item.tone}>{item.type}</b></button>)}</section> : <>
            {view === 'News' && <section className="panel news-panel"><div className="card-title">News Radar <button>{stocks.length} tickers</button></div><p className="workbench-note">Top catalyst per tracked name, sorted by today’s move. Each row opens a live news search in a new tab.</p>{[...stocks].sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).map((stock) => <button className="news-row" key={stock.symbol} onClick={() => openNewsSearch(stock.catalysts[0] || '', stock)}><strong>{stock.symbol}</strong><span>{stock.catalysts[0] || stock.thesis}</span><b className={stock.change >= 0 ? 'up' : 'down'}>{stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%</b><em>↗</em></button>)}</section>}
            {view === 'Portfolio' && <section className="panel holdings-editor">
              <div className="card-title">Portfolio P&L <button onClick={addSelectedHolding} disabled={isMarketSelection || portfolio.positions.some((p) => p.symbol === selected.symbol)}>Track {selected.symbol}</button></div>
              <div className="pl-summary">
                <span>Market Value <b>${money(plSummary.value)}</b></span>
                <span>Day P&L <b className={plSummary.dayPl >= 0 ? 'up' : 'down'}>{plSummary.dayPl >= 0 ? '+' : ''}${money(plSummary.dayPl)}</b></span>
                <span>Total P&L <b className={plSummary.totalPl >= 0 ? 'up' : 'down'}>{plSummary.totalPl >= 0 ? '+' : ''}${money(plSummary.totalPl)} ({plSummary.totalPlPct >= 0 ? '+' : ''}{plSummary.totalPlPct.toFixed(1)}%)</b></span>
                <span>Positions Sized <b>{plSummary.held}/{positions.length}</b></span>
              </div>
              {positions.map((position) => {
                const holding = holdings[position.symbol]
                const hasSize = holding && holding.shares > 0
                const value = hasSize ? holding.shares * position.stock.price : 0
                const pl = hasSize && holding.avgCost > 0 ? value - holding.shares * holding.avgCost : null
                return <div className="holding-row" key={position.symbol}>
                  <strong>{position.symbol}</strong>
                  <label>Shares<input type="number" min="0" step="any" value={holding?.shares || ''} placeholder="0" onChange={(e) => updateHolding(position.symbol, { shares: Number(e.target.value) || 0 })} /></label>
                  <label>Avg Cost<input type="number" min="0" step="any" value={holding?.avgCost || ''} placeholder="0.00" onChange={(e) => updateHolding(position.symbol, { avgCost: Number(e.target.value) || 0 })} /></label>
                  <span className="holding-value">{hasSize ? `$${money(value)}` : `$${money(position.stock.price)}`}<b className={(pl ?? changeAmount(position.stock)) >= 0 ? 'up' : 'down'}>{pl !== null ? `${pl >= 0 ? '+' : ''}$${money(pl)}` : `${position.stock.change >= 0 ? '+' : ''}${position.stock.change.toFixed(2)}%`}</b></span>
                  <button className="remove" title={`Stop tracking ${position.symbol}`} onClick={() => removeHolding(position.symbol)}>✕</button>
                </div>
              })}
              <small>Share counts and cost basis live only in this browser (localStorage). The public site never stores or uploads them.</small>
            </section>}
            <section className="panel catalyst-card"><div className="card-title">Catalyst Radar <button onClick={() => openCatalysts()}>{selected.symbol}</button></div>{catalystRadar.map((item) => <article key={`${selected.symbol}-${item.label}`} onClick={() => openCatalysts(item.text)}><span>{item.label}</span><strong>{item.text}</strong><b className={`${item.tone} badge`}>{item.type}</b></article>)}</section>
            {view === 'Research' && <section className="panel ai-card"><div className="ai-label">AI</div><div className="card-title">Research Summary <button>{selected.kind === 'instrument' ? 'Macro' : 'Equity'}</button></div><h2>{selected.symbol} <small>{selected.name}</small></h2><b className="rating">⌁ {selected.confidence > 82 ? 'Strong Bullish' : selected.confidence > 68 ? 'Constructive' : 'Watch Carefully'}</b><p>{selected.thesis}</p><div className="drivers"><span>Key Drivers</span>{selected.opportunities.slice(0, 3).map((item) => <em key={item}>● {item}</em>)}<em>● Price move today: {selected.change >= 0 ? '+' : ''}{selected.change.toFixed(2)}%</em></div><button onClick={() => openPanel('report')} className="full-report">View Full Research Report ›</button></section>}
            <section className="panel risks"><div className="card-title">Risks & Opportunities <button onClick={() => openPanel('risks')}>View all</button></div><h3>Opportunities</h3>{selected.opportunities.slice(0, 2).map((item) => <p className="good" key={item}>● {item}</p>)}<h3>Risks</h3>{selected.risks.slice(0, 2).map((item) => <p className="bad" key={item}>● {item}</p>)}<div className="signal-row"><span>Conviction <b>{selected.confidence}/100</b></span><span>Rating <b>{selected.rating || 'Watch'}</b></span></div>{!isMarketSelection && <button onClick={toggleStar} className="save">{isStarred ? '★ Starred' : '☆ Add to Starred'}</button>}</section>
            {view === 'Research' && marketSummary && <section className="panel market-summary"><div className="card-title">Market Summary <button onClick={() => setSelectedSymbol(marketSummary.symbol)}>{marketSummary.symbol}</button></div><strong>{marketSummary.name}<br />{bigNumber(marketSummary.price)}</strong><span className={marketSummary.change >= 0 ? 'up' : 'down'}>{marketSummary.change >= 0 ? '+' : ''}{marketSummary.change.toFixed(2)}%</span><svg viewBox="0 0 230 72"><path d={sparkPath(marketSummary.chart, 230, 72)} /></svg><div className="breadth"><span>Advancing <b>{marketBreadth.advancing}</b></span><span>Declining <b>{marketBreadth.declining}</b></span><span>Unchanged <b>{marketBreadth.unchanged}</b></span></div><div className="bar"><i style={{ flex: marketBreadth.advancing / breadthTotal }} /><i style={{ flex: marketBreadth.declining / breadthTotal }} /><i style={{ flex: Math.max(0.02, marketBreadth.unchanged / breadthTotal) }} /></div></section>}
            </>}
          </aside>
        </div>
        {detailPanel && detailPanel !== 'research' && detailPanel !== 'catalysts' && <section className="detail-drawer panel">
          <div className="drawer-head"><div><span className="eyebrow">Command detail</span><h2>{detailPanel === 'report' ? `${selected.symbol} Full Research Report` : detailPanel === 'risks' ? 'Risks & Opportunities' : 'Tracked Watchlist'}</h2></div><button onClick={closePanel}>Close ×</button></div>
          {detailPanel === 'report' && <div className="drawer-grid report-view"><article><h3>Thesis</h3><p>{selected.thesis}</p><dl><dt>Conviction</dt><dd>{selected.confidence}/100</dd><dt>Sector</dt><dd>{selected.sector}</dd><dt>52W range</dt><dd>{selected.range52w ? `${money(selected.range52w[0])} – ${money(selected.range52w[1])}` : '—'}</dd><dt>Rating</dt><dd>{selected.rating || 'Watch'}</dd><dt>Exchange</dt><dd>{selected.exchange || '—'}</dd></dl></article><article><h3>Catalysts</h3>{selected.catalysts.map((item) => <p key={item}>● {item}</p>)}<h3>Key drivers</h3>{selected.opportunities.map((item) => <p className="good" key={item}>+ {item}</p>)}</article><article><h3>Risk checklist</h3>{selected.risks.map((item) => <p className="bad" key={item}>− {item}</p>)}<button onClick={() => setView('Portfolio')} className="drawer-action">Open portfolio view</button></article></div>}
          {detailPanel === 'risks' && <div className="drawer-grid"><article><h3>Risks</h3>{selected.risks.map((item) => <p className="bad" key={item}>● {item}</p>)}</article><article><h3>Opportunities</h3>{selected.opportunities.map((item) => <p className="good" key={item}>● {item}</p>)}</article><article><h3>Decision frame</h3><p>Use this panel as the quick checklist for whether news changes the story. If a catalyst validates an opportunity, the stock deserves attention. If a risk moves from theoretical to active, it belongs on the watch list.</p></article></div>}
          {detailPanel === 'watchlist' && <div className="drawer-table watchlist-table">{filtered.map((stock) => <button key={stock.symbol} onClick={() => { setSelectedSymbol(stock.symbol); setDetailPanel('report') }}><strong>{stock.symbol}</strong><span>{stock.name}</span><span>${money(stock.price)}</span><b className={stock.change >= 0 ? 'up' : 'down'}>{stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%</b><small>{stock.sector}</small></button>)}</div>}
        </section>}
      </section>
    </main>
  )
}

export default App
