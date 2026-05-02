import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { fallbackPortfolio, fallbackStocks, heatmapSizes, navItems, news } from './data'
import type { PositionWithStock, PortfolioSeed, Stock, View } from './types'
import { DashboardPage } from './pages/DashboardPage'
import { NewsPage } from './pages/NewsPage'
import { PortfolioPage } from './pages/PortfolioPage'
import { ResearchPage } from './pages/ResearchPage'
import { SettingsPage } from './pages/SettingsPage'
import { StockPage } from './pages/StockPage'

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '')

function normalizePath(pathname: string) {
  const withoutBase = pathname.startsWith(basePath) ? pathname.slice(basePath.length) : pathname
  return withoutBase || '/'
}

function routeFor(pathname: string) {
  const [viewPath = '', symbolPath] = normalizePath(pathname).replace(/^\/+/, '').split('/')
  const viewFromPath: Partial<Record<string, View>> = {
    '': 'dashboard',
    stocks: 'stock',
    portfolio: 'portfolio',
    research: 'research',
    news: 'news',
    settings: 'settings',
  }
  return { view: viewFromPath[viewPath] || 'dashboard', symbol: symbolPath?.toUpperCase() }
}

function pathFor(view: View, symbol?: string) {
  const item = navItems.find((navItem) => navItem.id === view)
  const routePath = view === 'stock' && symbol ? `${item?.path || '/stocks'}/${symbol}` : item?.path || '/'
  return `${basePath}${routePath}`.replace(/\/{2,}/g, '/')
}

function sparkPath(values: number[], width = 96, height = 34) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  return values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width
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
  const [isNavOpen, setIsNavOpen] = useState(false)

  useEffect(() => {
    const applyRoute = () => {
      const requestedPath = new URLSearchParams(window.location.search).get('path')
      if (requestedPath) {
        const nextPath = `${basePath}${requestedPath.startsWith('/') ? requestedPath : `/${requestedPath}`}`
        window.history.replaceState(null, '', nextPath)
      }
      const route = routeFor(window.location.pathname)
      setActiveView(route.view)
      if (route.symbol) setSelectedSymbol(route.symbol)
      setIsNavOpen(false)
    }

    applyRoute()
    window.addEventListener('popstate', applyRoute)
    return () => window.removeEventListener('popstate', applyRoute)
  }, [])

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

  function navigate(view: View, symbol = selected.symbol) {
    const nextPath = pathFor(view, symbol)
    if (window.location.pathname !== nextPath) window.history.pushState(null, '', nextPath)
    setActiveView(view)
    if (view === 'stock') setSelectedSymbol(symbol)
    setIsNavOpen(false)
  }

  function addTicker() {
    const raw = query.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5)
    if (!raw) return
    const existing = stocks.find((stock) => stock.symbol === raw)
    if (existing) {
      navigate('stock', existing.symbol)
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
    navigate('stock', raw)
    localStorage.setItem('commandCenterWatchlist', JSON.stringify(next.filter((stock) => !fallbackStocks.some((seed) => seed.symbol === stock.symbol))))
    setQuery('')
  }

  const pageProps = {
    equity,
    heatmap,
    news,
    pnl,
    pnlPercent,
    portfolio,
    positions,
    quoteSource,
    selected,
    stocks,
    topExposure,
    onSelectStock: (symbol: string) => navigate('stock', symbol),
  }

  return (
    <main className={`shell ${isNavOpen ? 'nav-open' : ''}`}>
      <button className="mobile-nav-toggle" type="button" aria-expanded={isNavOpen} aria-label="Toggle navigation" onClick={() => setIsNavOpen((open) => !open)}>☰</button>
      <button className="nav-backdrop" type="button" aria-label="Close navigation" onClick={() => setIsNavOpen(false)} />
      <aside className="sidebar panel">
        <div className="brand"><span className="logo">▲</span><div><strong>Stock Command</strong><small>Market intelligence desk</small></div></div>
        <nav className="app-nav" aria-label="App sections">
          {navItems.map((item) => (
            <a key={item.id} href={pathFor(item.id, selected.symbol)} onClick={(event) => { event.preventDefault(); navigate(item.id) }} className={activeView === item.id ? 'active' : ''}>{item.label}</a>
          ))}
        </nav>
        <label className="search"><span>Search / add ticker</span><div><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTicker()} placeholder="NVDA, Microsoft, ARM..."/><button onClick={addTicker}>Add</button></div></label>
        <div className="watchlist">
          <div className="section-title">Watchlist</div>
          {(query ? filtered : stocks).map((stock) => (
            <button key={stock.symbol} className={`watch ${stock.symbol === selected.symbol ? 'active' : ''}`} onClick={() => navigate('stock', stock.symbol)}>
              <span><strong>{stock.symbol}</strong><small>{stock.name}</small></span>
              <svg viewBox="0 0 96 34" aria-hidden="true"><path d={sparkPath(stock.chart)} /></svg>
              <b className={stock.change >= 0 ? 'up' : 'down'}>{stock.change >= 0 ? '+' : ''}{stock.change}%</b>
            </button>
          ))}
        </div>
        <div className="market-card"><span>Market Status</span><strong>Risk-on, AI-led tape</strong><small>Semis leading; software selective; rates stable.</small></div>
      </aside>

      <section className="center">
        <header className="topbar panel"><div><span className="eyebrow">Live prototype · GitHub JSON database · prices via stockprices.dev</span><h1>{navItems.find((item) => item.id === activeView)?.label || 'Market Command Center'}</h1><small className="quote-status">Latest quote refresh: {quoteStamp}</small></div><button className="primary">Save thesis</button></header>
        {activeView === 'stock' && <StockPage {...pageProps} />}
        {activeView === 'portfolio' && <PortfolioPage {...pageProps} />}
        {activeView === 'research' && <ResearchPage {...pageProps} />}
        {activeView === 'news' && <NewsPage {...pageProps} />}
        {activeView === 'settings' && <SettingsPage />}
        {activeView === 'dashboard' && <DashboardPage {...pageProps} />}
      </section>

      <aside className="rightcol">
        <section className="panel"><div className="section-title">Latest catalysts</div>{news.map((item) => <article className="news" key={item.title}><span>{item.tag} · {item.time}</span><strong>{item.title}</strong><small>{item.impact}</small></article>)}</section>
        <section className="panel"><div className="section-title">AI research summary</div><p>{selected.thesis}</p><div className="confidence"><span style={{ width: `${selected.confidence}%` }} /></div></section>
        <section className="panel split"><div><div className="section-title">Opportunities</div>{selected.opportunities.map((item) => <p key={item}>+ {item}</p>)}</div><div><div className="section-title">Risks</div>{selected.risks.map((item) => <p key={item}>- {item}</p>)}</div></section>
        <section className="panel"><div className="section-title">Catalyst tracker</div>{selected.catalysts.map((item) => <button className="pill" key={item}>{item}</button>)}</section>
      </aside>
    </main>
  )
}

export default App
