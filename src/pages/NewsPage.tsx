import type { PageProps } from './pageTypes'

export function NewsPage({ news, onSelectStock, stocks }: PageProps) {
  return (
    <section className="news-page">
      <div className="panel detail-card">
        <div className="section-title">Today's market catalysts</div>
        {news.map((item) => <article className="news" key={item.title}><span>{item.tag} · {item.time}</span><strong>{item.title}</strong><small>{item.impact}</small></article>)}
      </div>
      <div className="panel detail-card">
        <div className="section-title">Ticker-specific watch items</div>
        {stocks.slice(0, 6).map((stock) => <button className="catalyst-row" onClick={() => onSelectStock(stock.symbol)} key={stock.symbol}><strong>{stock.symbol}</strong><span>{stock.catalysts[0]}</span><b className={stock.change >= 0 ? 'up' : 'down'}>{stock.change >= 0 ? '+' : ''}{stock.change}%</b></button>)}
      </div>
    </section>
  )
}
