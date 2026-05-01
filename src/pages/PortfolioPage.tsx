import type { PageProps } from './pageTypes'

export function PortfolioPage({ equity, onSelectStock, pnl, pnlPercent, portfolio, positions }: PageProps) {
  return (
    <>
      <section className="bottom-grid">
        <div className="panel metric"><span>Total value</span><strong>${(equity + portfolio.cash).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong><small>Portfolio plus cash</small></div>
        <div className="panel metric"><span>Invested equity</span><strong>${equity.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong><small>Seed portfolio positions</small></div>
        <div className="panel metric"><span>Unrealized P/L</span><strong className={pnl >= 0 ? 'up' : 'down'}>{pnl >= 0 ? '+' : ''}${pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong><small>{pnlPercent.toFixed(1)}%</small></div>
      </section>
      <section className="panel holdings">
        <div className="section-title">Holdings</div>
        {positions.map((position) => {
          const value = position.stock.price * position.shares
          const gain = value - position.avgCost * position.shares
          return (
            <button key={position.symbol} onClick={() => onSelectStock(position.symbol)} className="holding-row">
              <span><strong>{position.symbol}</strong><small>{position.stock.name}</small></span>
              <span>{position.shares} shares</span>
              <span>${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <b className={gain >= 0 ? 'up' : 'down'}>{gain >= 0 ? '+' : ''}${gain.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b>
            </button>
          )
        })}
      </section>
    </>
  )
}
