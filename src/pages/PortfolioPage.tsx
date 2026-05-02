import type { PageProps } from './pageTypes'

export function PortfolioPage({ onSelectStock, positions, stocks }: PageProps) {
  const averageChange = stocks.length ? stocks.reduce((sum, stock) => sum + stock.change, 0) / stocks.length : 0
  const gainers = stocks.filter((stock) => stock.change >= 0).length

  return (
    <>
      <section className="bottom-grid">
        <div className="panel metric"><span>Tracked tickers</span><strong>{positions.length}</strong><small>Public symbols only</small></div>
        <div className="panel metric"><span>Average daily move</span><strong className={averageChange >= 0 ? 'up' : 'down'}>{averageChange >= 0 ? '+' : ''}{averageChange.toFixed(2)}%</strong><small>{gainers}/{stocks.length} names green</small></div>
        <div className="panel metric"><span>Privacy posture</span><strong>Clean</strong><small>No cash, shares, cost basis, or account value</small></div>
      </section>
      <section className="panel holdings">
        <div className="section-title">Public stock tracker</div>
        {positions.map((position) => (
          <button key={position.symbol} onClick={() => onSelectStock(position.symbol)} className="holding-row public">
            <span><strong>{position.symbol}</strong><small>{position.stock.name}</small></span>
            <span>{position.stock.sector}</span>
            <span>${position.stock.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            <b className={position.stock.change >= 0 ? 'up' : 'down'}>{position.stock.change >= 0 ? '+' : ''}{position.stock.change.toFixed(2)}%</b>
          </button>
        ))}
      </section>
    </>
  )
}
