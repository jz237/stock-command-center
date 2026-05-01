import { useEffect, useMemo, useState } from 'react'
import './App.css'

type Stock = {
  symbol: string
  name: string
  sector: string
  price: number
  change: number
  marketCap: string
  confidence: number
  thesis: string
  risks: string[]
  opportunities: string[]
  catalysts: string[]
  chart: number[]
  changeAmount?: number
  quoteSource?: string
  quoteUpdatedAt?: string
}

type PortfolioSeed = {
  cash: number
  positions: { symbol: string; shares: number; avgCost: number }[]
}

type View = 'dashboard' | 'stock' | 'portfolio' | 'research' | 'news' | 'settings'

type PositionWithStock = PortfolioSeed['positions'][number] & { stock: Stock }

const fallbackStocks: Stock[] = [
  {
    symbol: 'NVDA', name: 'NVIDIA', sector: 'AI Compute', price: 1132.4, change: 3.84, marketCap: '$2.8T', confidence: 94,
    thesis: 'NVIDIA remains the cleanest large-cap AI infrastructure story: demand for accelerators, networking, and software is still running ahead of supply.',
    risks: ['Customer concentration among hyperscalers', 'Export restrictions could pressure China revenue', 'Any Blackwell delay would hit sentiment fast'],
    opportunities: ['Blackwell ramp refreshes the upgrade cycle', 'Networking attach rates can lift system-level revenue', 'Enterprise AI software is still early'],
    catalysts: ['Blackwell shipment updates', 'Hyperscaler capex commentary', 'Data-center margin trend'],
    chart: [72, 74, 73, 78, 81, 80, 86, 91, 89, 94, 98, 102, 101, 108, 116]
  },
  {
    symbol: 'AVGO', name: 'Broadcom', sector: 'AI Networking', price: 1418.77, change: 2.11, marketCap: '$660B', confidence: 88,
    thesis: 'Broadcom is becoming a toll road for AI data centers through custom silicon, switching, and VMware cash flow.',
    risks: ['VMware integration execution', 'Custom AI chip demand can be lumpy', 'Debt load after acquisition'],
    opportunities: ['AI networking buildouts', 'VMware margin expansion', 'Custom ASIC wins'],
    catalysts: ['AI revenue guide', 'VMware renewal metrics', 'Large cloud customer wins'],
    chart: [61, 64, 66, 65, 69, 74, 73, 78, 82, 84, 83, 88, 91, 93, 96]
  },
  {
    symbol: 'MSFT', name: 'Microsoft', sector: 'Cloud / AI Apps', price: 432.68, change: 1.04, marketCap: '$3.2T', confidence: 86,
    thesis: 'Microsoft has the best distribution for turning AI into paid software, with Azure and Copilot doing the heavy lifting.',
    risks: ['AI capex could outpace near-term revenue', 'Copilot adoption may take longer than bulls expect', 'Regulatory pressure'],
    opportunities: ['Copilot monetization', 'Azure share gains', 'OpenAI ecosystem pull-through'],
    catalysts: ['Azure growth rate', 'Copilot seat disclosures', 'AI margin commentary'],
    chart: [83, 82, 84, 86, 88, 87, 90, 91, 93, 92, 95, 98, 97, 101, 103]
  },
  {
    symbol: 'TSM', name: 'Taiwan Semi', sector: 'Foundry', price: 168.92, change: -0.42, marketCap: '$875B', confidence: 82,
    thesis: 'TSMC is the manufacturing backbone of advanced AI chips, but geopolitics keeps a permanent risk discount on the stock.',
    risks: ['Taiwan geopolitical risk', 'Capex intensity', 'Customer bargaining power'],
    opportunities: ['Advanced packaging demand', '2nm cycle', 'Pricing power at leading nodes'],
    catalysts: ['Monthly sales', 'AI capacity expansion', '2nm yield updates'],
    chart: [58, 61, 64, 66, 68, 67, 69, 72, 75, 76, 74, 77, 80, 79, 81]
  },
  {
    symbol: 'PLTR', name: 'Palantir', sector: 'AI Software', price: 43.7, change: -2.26, marketCap: '$98B', confidence: 74,
    thesis: 'Palantir has real enterprise AI momentum, but the stock already prices in a lot of future perfection.',
    risks: ['High expectations', 'Government contract timing', 'Valuation sensitivity'],
    opportunities: ['AIP bootcamp conversion', 'Commercial customer expansion', 'Defense AI demand'],
    catalysts: ['Commercial revenue growth', 'Customer count', 'Margin durability'],
    chart: [35, 36, 39, 41, 40, 43, 47, 46, 50, 54, 52, 55, 57, 53, 51]
  },
  {
    symbol: 'AMZN', name: 'Amazon', sector: 'Cloud / Consumer', price: 187.21, change: 0.74, marketCap: '$1.95T', confidence: 80,
    thesis: 'Amazon is a two-engine story: AWS AI demand plus retail margin improvement.',
    risks: ['AWS competition', 'Consumer slowdown', 'Regulatory pressure'],
    opportunities: ['AWS AI services', 'Ads growth', 'Fulfillment efficiency'],
    catalysts: ['AWS growth', 'Retail operating margin', 'Advertising revenue'],
    chart: [67, 66, 68, 70, 69, 73, 75, 74, 77, 80, 79, 82, 84, 83, 86]
  }
]

const fallbackPortfolio: PortfolioSeed = {
  cash: 18420,
  positions: [
    { symbol: 'NVDA', shares: 18, avgCost: 742 },
    { symbol: 'MSFT', shares: 24, avgCost: 318 },
    { symbol: 'AVGO', shares: 8, avgCost: 936 },
    { symbol: 'TSM', shares: 40, avgCost: 112 },
  ],
}

const news = [
  { tag: 'AI Capex', title: 'Hyperscalers keep spending aggressively on AI data centers', impact: 'Bullish for NVDA, AVGO, VRT', time: '22m ago' },
  { tag: 'Chips', title: 'Advanced packaging capacity remains the bottleneck investors are watching', impact: 'Watch TSM and NVDA supply commentary', time: '1h ago' },
  { tag: 'Software', title: 'Enterprise AI budgets are shifting from pilots to production workloads', impact: 'MSFT and PLTR benefit if conversion holds', time: '3h ago' },
]

const navItems: { id: View; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'stock', label: 'Stock Detail' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'research', label: 'Research' },
  { id: 'news', label: 'News' },
  { id: 'settings', label: 'Settings' },
]

const heatmapSizes: Record<string, number> = {
  NVDA: 20, AVGO: 15, MSFT: 13, AMZN: 12, GOOG: 11, META: 10, TSM: 10, ARM: 8, INTC: 8, QCOM: 7, PLTR: 7, VRT: 7,
}

function sparkPath(values: number[], width = 96, height = 34) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  return values.map((value, index) => {
    const x = (index / (values.length - 1)) * width
    const y = height - ((value - min) / Math.max(max - min, 1)) * height
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
}

function App() {
  const [stocks, setStocks] = useState<Stock[]>(fallbackStocks)
  const [portfolio, setPortfolio] = useState<PortfolioSeed>(fallbackPortfolio)
  const [selectedSymbol, setSelectedSymbol] = useState('NVDA')
  const [activeView, setActiveView] = useState<View>('dashboard')
  const [query, setQuery] = useState('')

  useEffect(() => {
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/stocks.json`).then((r) => r.json()).catch(() => fallbackStocks),
      fetch(`${import.meta.env.BASE_URL}data/portfolio.json`).then((r) => r.json()).catch(() => fallbackPortfolio),
    ]).then(([stockData, portfolioData]) => {
      const saved = JSON.parse(localStorage.getItem('commandCenterWatchlist') || '[]') as Stock[]
      const merged = [...stockData, ...saved].filter((stock, index, all) => all.findIndex((s) => s.symbol === stock.symbol) === index)
      setStocks(merged)
      setPortfolio(portfolioData)
    })
  }, [])

  const selected = stocks.find((stock) => stock.symbol === selectedSymbol) || stocks[0]
  const positions = portfolio.positions
    .map((position) => {
      const stock = stocks.find((item) => item.symbol === position.symbol)
      return stock ? ({ ...position, stock } satisfies PositionWithStock) : null
    })
    .filter((position): position is PositionWithStock => Boolean(position))
  const equity = positions.reduce((sum, position) => sum + position.stock.price * position.shares, 0)
  const cost = positions.reduce((sum, position) => sum + position.avgCost * position.shares, 0)
  const pnl = equity - cost
  const pnlPercent = cost ? (pnl / cost) * 100 : 0
  const sortedPositions = [...positions].sort((a, b) => b.stock.price * b.shares - a.stock.price * a.shares)
  const topExposure = sortedPositions[0]

  const filtered = useMemo(() => stocks.filter((stock) => `${stock.symbol} ${stock.name}`.toLowerCase().includes(query.toLowerCase())), [query, stocks])
  const liveQuotes = stocks.filter((stock) => stock.quoteUpdatedAt)
  const latestQuoteTime = liveQuotes.map((stock) => new Date(stock.quoteUpdatedAt as string).getTime()).filter(Number.isFinite).sort((a, b) => b - a)[0]
  const quoteStamp = latestQuoteTime ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(latestQuoteTime)) : 'Seed data only'
  const quoteSource = selected.quoteSource || 'GitHub JSON seed'
  const heatmap = stocks.slice(0, 12).map((stock) => ({ symbol: stock.symbol, change: stock.change, size: heatmapSizes[stock.symbol] || 6 }))

  function addTicker() {
    const raw = query.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5)
    if (!raw) return
    const existing = stocks.find((stock) => stock.symbol === raw)
    if (existing) {
      setSelectedSymbol(existing.symbol)
      setActiveView('stock')
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
      confidence: 62,
      thesis: 'Newly added research candidate. Live quote refresh runs for seeded GitHub database tickers; this local ticker is saved in your browser until it is promoted into the repo data file.',
      risks: ['Needs real financial data', 'Unknown valuation setup', 'No catalyst history yet'],
      opportunities: ['Fresh research target', 'Can be promoted into portfolio tracking', 'Add notes and API enrichment later'],
      catalysts: ['User-added ticker', 'Awaiting data provider connection', 'Research queue item'],
      chart: Array.from({ length: 15 }, (_, i) => 60 + i * 1.5 + Math.sin(i) * 8),
    }
    const next = [...stocks, generated]
    setStocks(next)
    setSelectedSymbol(raw)
    setActiveView('stock')
    localStorage.setItem('commandCenterWatchlist', JSON.stringify(next.filter((stock) => !fallbackStocks.some((seed) => seed.symbol === stock.symbol))))
    setQuery('')
  }

  function selectStock(symbol: string, view: View = 'stock') {
    setSelectedSymbol(symbol)
    setActiveView(view)
  }

  const ChartPanel = ({ expanded = false }: { expanded?: boolean }) => (
    <section className={`hero-card panel ${expanded ? 'expanded-chart' : ''}`}>
      <div className="stock-head"><div><span className="eyebrow">Selected equity</span><h2>{selected.symbol} <small>{selected.name}</small></h2></div><div className="price"><strong>${selected.price.toLocaleString()}</strong><span className={selected.change >= 0 ? 'up' : 'down'}>{selected.change >= 0 ? '+' : ''}{selected.change}% today</span><small>{selected.changeAmount !== undefined ? `${selected.changeAmount >= 0 ? '+' : ''}$${Math.abs(selected.changeAmount).toFixed(2)} · ` : ''}{quoteSource}</small></div></div>
      <div className="stats"><span>Sector <b>{selected.sector}</b></span><span>Market cap <b>{selected.marketCap}</b></span><span>Conviction <b>{selected.confidence}/100</b></span></div>
      <div className="timeframes"><button className="active">1D</button><button>5D</button><button>1M</button><button>6M</button><button>1Y</button></div>
      <svg className="chart" viewBox="0 0 900 300" preserveAspectRatio="none">
        <defs><linearGradient id="glow" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#4ade80" stopOpacity=".35"/><stop offset="1" stopColor="#4ade80" stopOpacity="0"/></linearGradient></defs>
        {[0,1,2,3,4].map((i) => <line key={i} x1="0" x2="900" y1={55 + i*48} y2={55 + i*48} className="grid"/>)}
        <path d={`${sparkPath(selected.chart, 900, 230)} L900 300 L0 300 Z`} fill="url(#glow)" transform="translate(0 28)"/>
        <path d={sparkPath(selected.chart, 900, 230)} className="line" transform="translate(0 28)"/>
        {selected.chart.map((v, i) => <rect key={i} x={i*60+10} y={250 - (v % 42)} width="28" height={30 + (v % 42)} rx="4" className="volume"/>)}
      </svg>
    </section>
  )

  const Dashboard = () => (
    <>
      <ChartPanel />
      <section className="heat panel"><div className="section-title">Integrated market heatmap</div><div className="heatgrid">{heatmap.map((tile) => <button key={tile.symbol} onClick={() => selectStock(tile.symbol)} className={tile.change >= 0 ? 'gain' : 'loss'} style={{ flexGrow: tile.size }}><strong>{tile.symbol}</strong><span>{tile.change >= 0 ? '+' : ''}{tile.change}%</span></button>)}</div></section>
      <section className="bottom-grid">
        <div className="panel metric"><span>Portfolio value</span><strong>${(equity + portfolio.cash).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong><small>Cash ${portfolio.cash.toLocaleString()}</small></div>
        <div className="panel metric"><span>Open gain/loss</span><strong className={pnl >= 0 ? 'up' : 'down'}>{pnl >= 0 ? '+' : ''}${pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong><small>{pnlPercent.toFixed(1)}% on tracked positions</small></div>
        <div className="panel metric"><span>Top exposure</span><strong>{topExposure?.symbol}</strong><small>{topExposure ? `${topExposure.shares} shares · ${topExposure.stock.sector}` : 'Based on seed portfolio JSON'}</small></div>
      </section>
    </>
  )

  const StockDetail = () => (
    <>
      <ChartPanel expanded />
      <section className="detail-grid">
        <article className="panel detail-card"><div className="section-title">Investment thesis</div><p>{selected.thesis}</p></article>
        <article className="panel detail-card"><div className="section-title">Catalyst checklist</div>{selected.catalysts.map((item) => <button className="pill" key={item}>{item}</button>)}</article>
        <article className="panel detail-card"><div className="section-title">Opportunities</div>{selected.opportunities.map((item) => <p key={item}>+ {item}</p>)}</article>
        <article className="panel detail-card"><div className="section-title">Risks</div>{selected.risks.map((item) => <p key={item}>− {item}</p>)}</article>
      </section>
    </>
  )

  const Portfolio = () => (
    <>
      <section className="bottom-grid">
        <div className="panel metric"><span>Total value</span><strong>${(equity + portfolio.cash).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong><small>Portfolio plus cash</small></div>
        <div className="panel metric"><span>Invested equity</span><strong>${equity.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong><small>Seed portfolio positions</small></div>
        <div className="panel metric"><span>Unrealized P/L</span><strong className={pnl >= 0 ? 'up' : 'down'}>{pnl >= 0 ? '+' : ''}${pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong><small>{pnlPercent.toFixed(1)}%</small></div>
      </section>
      <section className="panel holdings"><div className="section-title">Holdings</div>{positions.map((position) => {
        const value = position.stock.price * position.shares
        const gain = value - position.avgCost * position.shares
        return <button key={position.symbol} onClick={() => selectStock(position.symbol)} className="holding-row"><span><strong>{position.symbol}</strong><small>{position.stock.name}</small></span><span>{position.shares} shares</span><span>${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span><b className={gain >= 0 ? 'up' : 'down'}>{gain >= 0 ? '+' : ''}${gain.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b></button>
      })}</section>
    </>
  )

  const Research = () => (
    <section className="research-grid">
      {stocks.slice(0, 8).map((stock) => <article className="panel research-card" key={stock.symbol} onClick={() => selectStock(stock.symbol)}><div className="research-head"><strong>{stock.symbol}</strong><span>{stock.confidence}/100</span></div><small>{stock.sector}</small><p>{stock.thesis}</p><div className="confidence"><span style={{ width: `${stock.confidence}%` }} /></div></article>)}
    </section>
  )

  const News = () => (
    <section className="news-page">
      <div className="panel detail-card"><div className="section-title">Today’s market catalysts</div>{news.map((item) => <article className="news" key={item.title}><span>{item.tag} · {item.time}</span><strong>{item.title}</strong><small>{item.impact}</small></article>)}</div>
      <div className="panel detail-card"><div className="section-title">Ticker-specific watch items</div>{stocks.slice(0, 6).map((stock) => <button className="catalyst-row" onClick={() => selectStock(stock.symbol)} key={stock.symbol}><strong>{stock.symbol}</strong><span>{stock.catalysts[0]}</span><b className={stock.change >= 0 ? 'up' : 'down'}>{stock.change >= 0 ? '+' : ''}{stock.change}%</b></button>)}</div>
    </section>
  )

  const Settings = () => (
    <section className="settings-grid">
      <article className="panel detail-card"><div className="section-title">Data source</div><h3>stockprices.dev</h3><p>Free, no-auth quote source refreshed by GitHub Actions. The static site reads the committed JSON so the browser does not need secrets.</p></article>
      <article className="panel detail-card"><div className="section-title">GitHub database</div><h3>JSON-backed prototype</h3><p>Seed data lives in <code>data/stocks.json</code> and <code>data/portfolio.json</code>. User-added tickers stay in localStorage until we add a private backend.</p></article>
      <article className="panel detail-card"><div className="section-title">Next backend step</div><h3>Supabase or serverless</h3><p>For private portfolio saves, notes, and account-level watchlists, move writes out of the browser and behind auth.</p></article>
    </section>
  )

  function renderView() {
    if (activeView === 'stock') return <StockDetail />
    if (activeView === 'portfolio') return <Portfolio />
    if (activeView === 'research') return <Research />
    if (activeView === 'news') return <News />
    if (activeView === 'settings') return <Settings />
    return <Dashboard />
  }

  return (
    <main className="shell">
      <aside className="sidebar panel">
        <div className="brand"><span className="logo">▲</span><div><strong>Stock Command</strong><small>Market intelligence desk</small></div></div>
        <nav className="app-nav" aria-label="App sections">{navItems.map((item) => <button key={item.id} onClick={() => setActiveView(item.id)} className={activeView === item.id ? 'active' : ''}>{item.label}</button>)}</nav>
        <label className="search"><span>Search / add ticker</span><div><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTicker()} placeholder="NVDA, Microsoft, ARM..."/><button onClick={addTicker}>Add</button></div></label>
        <div className="watchlist">
          <div className="section-title">Watchlist</div>
          {(query ? filtered : stocks).map((stock) => (
            <button key={stock.symbol} className={`watch ${stock.symbol === selected.symbol ? 'active' : ''}`} onClick={() => selectStock(stock.symbol)}>
              <span><strong>{stock.symbol}</strong><small>{stock.name}</small></span>
              <svg viewBox="0 0 96 34"><path d={sparkPath(stock.chart)} /></svg>
              <b className={stock.change >= 0 ? 'up' : 'down'}>{stock.change >= 0 ? '+' : ''}{stock.change}%</b>
            </button>
          ))}
        </div>
        <div className="market-card"><span>Market Status</span><strong>Risk-on, AI-led tape</strong><small>Semis leading; software selective; rates stable.</small></div>
      </aside>

      <section className="center">
        <header className="topbar panel"><div><span className="eyebrow">Live prototype · GitHub JSON database · prices via stockprices.dev</span><h1>{navItems.find((item) => item.id === activeView)?.label || 'Market Command Center'}</h1><small className="quote-status">Latest quote refresh: {quoteStamp}</small></div><button className="primary">Save thesis</button></header>
        {renderView()}
      </section>

      <aside className="rightcol">
        <section className="panel"><div className="section-title">Latest catalysts</div>{news.map((item) => <article className="news" key={item.title}><span>{item.tag} · {item.time}</span><strong>{item.title}</strong><small>{item.impact}</small></article>)}</section>
        <section className="panel"><div className="section-title">AI research summary</div><p>{selected.thesis}</p><div className="confidence"><span style={{ width: `${selected.confidence}%` }} /></div></section>
        <section className="panel split"><div><div className="section-title">Opportunities</div>{selected.opportunities.map((item) => <p key={item}>+ {item}</p>)}</div><div><div className="section-title">Risks</div>{selected.risks.map((item) => <p key={item}>− {item}</p>)}</div></section>
        <section className="panel"><div className="section-title">Catalyst tracker</div>{selected.catalysts.map((item) => <button className="pill" key={item}>{item}</button>)}</section>
      </aside>
    </main>
  )
}

export default App
