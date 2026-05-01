import { ChartPanel } from '../components/ChartPanel'
import type { PageProps } from './pageTypes'

export function DashboardPage({ equity, heatmap, onSelectStock, pnl, pnlPercent, portfolio, quoteSource, selected, topExposure }: PageProps) {
  return (
    <>
      <ChartPanel stock={selected} quoteSource={quoteSource} />
      <section className="heat panel">
        <div className="section-title">Integrated market heatmap</div>
        <div className="heatgrid">
          {heatmap.map((tile) => (
            <button key={tile.symbol} onClick={() => onSelectStock(tile.symbol)} className={tile.change >= 0 ? 'gain' : 'loss'} style={{ flexGrow: tile.size }}>
              <strong>{tile.symbol}</strong><span>{tile.change >= 0 ? '+' : ''}{tile.change}%</span>
            </button>
          ))}
        </div>
      </section>
      <section className="bottom-grid">
        <div className="panel metric"><span>Portfolio value</span><strong>${(equity + portfolio.cash).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong><small>Cash ${portfolio.cash.toLocaleString()}</small></div>
        <div className="panel metric"><span>Open gain/loss</span><strong className={pnl >= 0 ? 'up' : 'down'}>{pnl >= 0 ? '+' : ''}${pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong><small>{pnlPercent.toFixed(1)}% on tracked positions</small></div>
        <div className="panel metric"><span>Top exposure</span><strong>{topExposure?.symbol}</strong><small>{topExposure ? `${topExposure.shares} shares · ${topExposure.stock.sector}` : 'Based on seed portfolio JSON'}</small></div>
      </section>
    </>
  )
}
