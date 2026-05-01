import type { PageProps } from './pageTypes'

export function ResearchPage({ onSelectStock, stocks }: PageProps) {
  return (
    <section className="research-grid">
      {stocks.slice(0, 8).map((stock) => (
        <article className="panel research-card" key={stock.symbol} onClick={() => onSelectStock(stock.symbol)}>
          <div className="research-head"><strong>{stock.symbol}</strong><span>{stock.confidence}/100</span></div>
          <small>{stock.sector}</small>
          <p>{stock.thesis}</p>
          <div className="confidence"><span style={{ width: `${stock.confidence}%` }} /></div>
        </article>
      ))}
    </section>
  )
}
