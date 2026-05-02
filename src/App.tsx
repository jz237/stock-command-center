import { useEffect, useMemo, useState } from 'react'
import './App.css'

type Stock = {
  symbol: string
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
  dataSource?: 'static' | 'live'
}

type PortfolioSeed = {
  positions: { symbol: string }[]
}

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
const categories = ['AI & Semiconductors', 'Cloud & Software', 'Consumer Tech', 'Watchlist', 'Long Term Holds']
const nav = ['▦', '▧', '▤', '▭', '⚙']
const LIVE_REFRESH_MS = 120_000

function sparkPath(values: number[], width = 96, height = 34) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  return values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width
    const y = height - ((value - min) / Math.max(max - min, 1)) * height
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
}

function money(value: number, digits = 2) {
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

async function fetchYahooQuote(symbol: string): Promise<Partial<Stock> | null> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`, { signal: controller.signal })
    if (!response.ok) return null
    const payload = await response.json()
    const result = payload?.chart?.result?.[0]
    const meta = result?.meta
    const quote = result?.indicators?.quote?.[0]
    const closes = (quote?.close || []).filter((value: number | null) => typeof value === 'number') as number[]
    if (!meta || !closes.length) return null
    const price = Number(meta.regularMarketPrice ?? closes.at(-1))
    const previous = Number(meta.chartPreviousClose ?? closes[0])
    if (!Number.isFinite(price) || !Number.isFinite(previous) || previous === 0) return null
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
  const [range, setRange] = useState('1D')
  const [view, setView] = useState<'Research' | 'News' | 'Portfolio'>('Research')
  const [indicators, setIndicators] = useState(true)
  const [saved, setSaved] = useState<string[]>(() => JSON.parse(localStorage.getItem('savedPortfolioSymbols') || '[]'))
  const [liveStatus, setLiveStatus] = useState<'loading' | 'live' | 'static'>('loading')
  const [lastLiveUpdate, setLastLiveUpdate] = useState<string>('')
  const liveSymbolsKey = useMemo(() => stocks.map((stock) => stock.symbol).join('|'), [stocks])

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
    let cancelled = false
    async function refreshLivePrices() {
      const symbols = liveSymbolsKey.split('|').filter(Boolean)
      if (!symbols.length) return
      const updates = await Promise.allSettled(symbols.map((symbol) => fetchYahooQuote(symbol)))
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

  const selected = stocks.find((stock) => stock.symbol === selectedSymbol) || stocks[0]
  const filtered = useMemo(() => stocks.filter((stock) => `${stock.symbol} ${stock.name}`.toLowerCase().includes(query.toLowerCase())), [query, stocks])
  const positions = portfolio.positions.map((position) => ({ ...position, stock: stocks.find((stock) => stock.symbol === position.symbol) })).filter((p) => p.stock)
  const averageChange = positions.length ? positions.reduce((sum, position) => sum + (position.stock?.change || 0), 0) / positions.length : 0
  const gainers = positions.filter((position) => (position.stock?.change || 0) >= 0).length
  const grouped = stocks.reduce<Record<string, Stock[]>>((acc, stock) => {
    const key = stock.sector.includes('Semi') ? 'Semiconductors' : stock.sector.includes('Cloud') || stock.sector.includes('Software') ? 'Software' : stock.sector.includes('Consumer') ? 'Consumer Electronics' : stock.sector.includes('Communication') ? 'Communication Services' : stock.sector
    acc[key] = [...(acc[key] || []), stock]
    return acc
  }, {})
  const movers = [...stocks].sort((a, b) => b.change - a.change).slice(0, 5)
  const latestCatalysts = stocks.flatMap((stock) => stock.catalysts.slice(0, 1).map((title) => ({ stock, title }))).slice(0, 4)
  const inPortfolio = saved.includes(selected.symbol)

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

  return (
    <main className="terminal">
      <nav className="rail">
        <div className="signal"><i/><i/><i/></div>
        {nav.map((item, index) => <button className={index === 1 ? 'hot' : ''} key={item}>{item}</button>)}
      </nav>

      <aside className="watch-panel panel">
        <div className="brand"><span className="bars">▰</span><strong>Market Command Center</strong></div>
        <div className="watch-head"><span>Watchlists</span><button>＋</button><button>⋯</button></div>
        <button className="watch-select">★ Tech Leaders <span>⌄</span></button>
        <div className="watch-labels"><span>Ticker</span><span>Price</span><span>24H %</span></div>
        <div className="watchlist">
          {(query ? filtered : stocks).map((stock) => (
            <button key={stock.symbol} className={`watch ${stock.symbol === selected.symbol ? 'active' : ''}`} onClick={() => setSelectedSymbol(stock.symbol)}>
              <strong>{stock.symbol}</strong>
              <svg viewBox="0 0 90 28"><path d={sparkPath(stock.chart, 90, 28)} /></svg>
              <span>{money(stock.price)}</span>
              <b className={stock.change >= 0 ? 'up' : 'down'}>{stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%</b>
            </button>
          ))}
        </div>
        <div className="folders">
          {categories.map((category, index) => <button key={category}>▸ {category}<b>{[8, 7, 6, 12, 15][index]}</b></button>)}
        </div>
        <div className="market-status">
          <span>Market Status <b>● Market Open</b></span>
          {['SPY', 'QQQ', 'IWM', 'VIX'].map((ticker, index) => <p key={ticker}><em>{ticker}</em><strong>{[532.54, 458.23, 210.17, 12.48][index]}</strong><b className={index === 3 ? 'down' : 'up'}>{index === 3 ? '-4.32%' : '+0.' + (index + 7) + '1%'}</b><svg viewBox="0 0 54 18"><path d="M0 14 L8 12 L15 13 L22 8 L30 10 L38 5 L46 7 L54 3" /></svg></p>)}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <label className="global-search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTicker()} placeholder="Search company or ticker…" /></label>
          <div className={`live-chip ${liveStatus}`}><i />{liveStatus === 'live' ? `Live prices ${lastLiveUpdate}` : liveStatus === 'loading' ? 'Connecting live prices' : 'Static fallback data'}</div>
          <div className="mode-tabs">{(['Research', 'News', 'Portfolio'] as const).map((tab) => <button className={view === tab ? 'selected' : ''} onClick={() => setView(tab)} key={tab}>▣ {tab}</button>)}</div>
          <div className="avatar">MC</div>
        </header>

        <div className="content-grid">
          <section className="main-stack">
            <section className="chart-panel panel">
              <div className="quote-head">
                <div><h1>{selected.symbol}</h1><strong>{money(selected.price)}</strong><span className={selected.change >= 0 ? 'up' : 'down'}>{selected.change >= 0 ? '+' : ''}{(selected.price * selected.change / 100).toFixed(2)} ({selected.change.toFixed(2)}%)</span><small className="source">{selected.dataSource === 'live' ? 'Yahoo Finance live feed' : 'StockBot cached data'}</small></div>
                <button className="star">★</button>
                <div className="quote-stats">
                  <span>Market Cap <b>{selected.marketCap}</b></span><span>P/E <b>{selected.pe ? selected.pe.toFixed(2) : '—'}</b></span><span>Rating <b>{selected.rating || 'Watch'}</b></span><span>Volume <b>{selected.volume || '—'}M</b></span><span>52W Range <b>{selected.range52w?.[0] && selected.range52w?.[1] ? `${selected.range52w[0]} - ${selected.range52w[1]}` : '—'}</b></span>
                </div>
              </div>
              <div className="rangebar">{ranges.map((item) => <button className={range === item ? 'active' : ''} onClick={() => setRange(item)} key={item}>{item}</button>)}<button onClick={() => setIndicators(!indicators)} className="indicator">⌁ Indicators</button><button>⛶</button><button>⋯</button></div>
              <svg className="big-chart" viewBox="0 0 900 330" preserveAspectRatio="none">
                {[0,1,2,3,4,5].map((i) => <line key={i} x1="0" x2="900" y1={35 + i*48} y2={35 + i*48} className="grid"/>)}
                {indicators && <path className="ma" d={sparkPath(selected.chart.map((v, i) => v * (0.985 + Math.sin(i) * .002)), 900, 210)} transform="translate(0 48)"/>}
                <path className="line" d={sparkPath(selected.chart, 900, 210)} transform="translate(0 48)"/>
                {selected.chart.slice(-18).map((v, i, arr) => {
                  const prev = arr[Math.max(i - 1, 0)]
                  const up = v >= prev
                  const h = 28 + Math.abs(v - prev) * 1.3
                  return <g key={i} transform={`translate(${i * 50 + 18}, ${245 - (v % 58)})`}><line y1={-18} y2={h} className={up ? 'candle upc' : 'candle downc'} /><rect x="-8" y="0" width="16" height={Math.max(12, h / 2)} rx="2" className={up ? 'body upc' : 'body downc'} /></g>
                })}
                {selected.chart.slice(-22).map((v, i) => <rect key={`vol-${i}`} x={i*41+8} y={292 - (v % 34)} width="23" height={24 + (v % 34)} className={i % 3 === 0 ? 'redvol' : 'greenvol'} />)}
              </svg>
            </section>

            <section className="heat-panel panel">
              {Object.entries(grouped).map(([group, items]) => <div className="heat-sector" key={group}><span>{group}</span><div>{items.slice(0, 8).map((stock) => <button onClick={() => setSelectedSymbol(stock.symbol)} className={stock.change >= 0 ? 'gain' : 'loss'} style={{ '--weight': Math.max(6, Math.min(24, Math.abs(stock.price) / 20 + stock.confidence / 8)) } as React.CSSProperties} key={stock.symbol}><strong>{stock.symbol}</strong><em>{stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%</em><small>{stock.marketCap}</small></button>)}</div></div>)}
            </section>

            <section className="bottom-grid">
              <div className="panel portfolio-card"><div className="card-title">Public Watchlist <button>No personal amounts</button></div><strong>{positions.length} tickers</strong><span className={averageChange >= 0 ? 'up' : 'down'}>{averageChange >= 0 ? '+' : ''}{averageChange.toFixed(2)}% average move · {gainers}/{positions.length} green</span><svg viewBox="0 0 280 90"><path d="M0 62 C35 20 70 84 105 46 S175 60 210 26 S250 55 280 18" /></svg><div className="mini-tabs">{['1D','1W','1M','3M','YTD','1Y','ALL'].map((x, i)=><button className={i===0?'active':''} key={x}>{x}</button>)}</div></div>
              <div className="panel allocation"><div className="card-title">Watchlist Breakdown <button>Public</button></div><div className="donut"><b>{positions.length}</b><small>Names</small></div><ul><li><i/>Technology / AI <b>Core</b></li><li><i/>Semiconductors <b>Major</b></li><li><i/>Software & Cloud <b>Major</b></li><li><i/>Personal values <b>Hidden</b></li></ul></div>
              <div className="panel movers"><div className="card-title">Today’s Top Movers</div>{movers.map((stock) => <button onClick={() => setSelectedSymbol(stock.symbol)} key={stock.symbol}><strong>{stock.symbol}</strong><svg viewBox="0 0 70 22"><path d={sparkPath(stock.chart, 70, 22)} /></svg><span>{money(stock.price)}</span><b className={stock.change >= 0 ? 'up' : 'down'}>{stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%</b></button>)}</div>
            </section>
          </section>

          <aside className="right-stack">
            <section className="panel catalyst-card"><div className="card-title">Latest Catalysts <button>View all</button></div>{latestCatalysts.map(({ stock, title }, index) => <article key={`${stock.symbol}-${title}`}><span>{[2,4,4,7][index]}h ago</span><strong>{title}</strong><b className={stock.change >= 0 ? 'up badge' : 'down badge'}>{stock.change >= 0 ? 'Bullish' : 'Watch'}</b></article>)}</section>
            <section className="panel ai-card"><div className="ai-label">AI</div><div className="card-title">AI Research Summary</div><h2>{selected.symbol} <small>{selected.name}</small></h2><b className="rating">⌁ {selected.confidence > 82 ? 'Strong Bullish' : selected.confidence > 68 ? 'Constructive' : 'Watch Carefully'}</b><p>{view === 'News' ? selected.catalysts.join(' · ') : view === 'Portfolio' ? `${selected.symbol} portfolio exposure can be tracked here. Save it, monitor catalysts, and compare it against the rest of the watchlist.` : selected.thesis}</p><div className="drivers"><span>Key Drivers</span>{selected.opportunities.slice(0,4).map((item) => <em key={item}>● {item}</em>)}</div><button className="full-report">View Full Research Report ›</button></section>
            {view === 'Portfolio' && <section className="panel holdings-editor"><div className="card-title">Public Tracker <button onClick={addSelectedHolding}>Track {selected.symbol}</button></div>{positions.map((position) => <div className="holding-row public" key={position.symbol}><strong>{position.symbol}</strong><span>{position.stock ? `$${money(position.stock.price)}` : 'No quote'}</span><b className={position.stock && position.stock.change >= 0 ? 'up' : 'down'}>{position.stock ? `${position.stock.change >= 0 ? '+' : ''}${position.stock.change.toFixed(2)}%` : '—'}</b></div>)}<small>Only ticker symbols and market performance are stored here. Cash, share counts, cost basis, and personal portfolio values are intentionally not included.</small></section>}
            <section className="panel risks"><div className="card-title">Risks & Opportunities <button>View all</button></div><h3>Opportunities</h3>{selected.opportunities.slice(0,3).map((item) => <p className="good" key={item}>● {item}</p>)}<h3>Risks</h3>{selected.risks.slice(0,3).map((item) => <p className="bad" key={item}>● {item}</p>)}<button onClick={toggleSave} className="save">★ {inPortfolio ? 'Saved to Portfolio' : 'Save to Portfolio'}</button></section>
            <section className="panel market-summary"><div className="card-title">Market Summary</div><strong>S&P 500<br/>5,321.41</strong><span className="up">+0.71%</span><svg viewBox="0 0 230 72"><path d="M0 54 L18 50 L32 53 L45 43 L62 44 L78 34 L96 38 L113 30 L130 28 L147 35 L162 22 L178 26 L194 18 L213 20 L230 15" /></svg><div className="breadth"><span>Advancing <b>382</b></span><span>Declining <b>118</b></span><span>Unchanged <b>22</b></span></div><div className="bar"><i/><i/><i/></div></section>
          </aside>
        </div>
      </section>
    </main>
  )
}

export default App
