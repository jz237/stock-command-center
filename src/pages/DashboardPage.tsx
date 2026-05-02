import { ChartPanel } from '../components/ChartPanel'
import type { PageProps } from './pageTypes'

export function DashboardPage({ heatmap, onSelectStock, positions, quoteSource, selected, stocks, topExposure }: PageProps) {
  const averageChange = stocks.length ? stocks.reduce((sum, stock) => sum + stock.change, 0) / stocks.length : 0
  const gainers = stocks.filter((stock) => stock.change >= 0).length
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
        <div className="panel metric"><span>Tracked names</span><strong>{positions.length}</strong><small>Public ticker list only</small></div>
        <div className="panel metric"><span>Average move</span><strong className={averageChange >= 0 ? 'up' : 'down'}>{averageChange >= 0 ? '+' : ''}{averageChange.toFixed(2)}%</strong><small>{gainers}/{stocks.length} green today</small></div>
        <div className="panel metric"><span>Strongest tracked name</span><strong>{topExposure?.symbol}</strong><small>{topExposure ? topExposure.stock.sector : 'Based on public watchlist JSON'}</small></div>
      </section>
    </>
  )
}
