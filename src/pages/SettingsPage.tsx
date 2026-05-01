export function SettingsPage() {
  return (
    <section className="settings-grid">
      <article className="panel detail-card"><div className="section-title">Data source</div><h3>stockprices.dev + Lightweight Charts</h3><p>Quotes refresh through GitHub Actions and the chart renders with TradingView's open-source Lightweight Charts library. The current historical series is derived from the GitHub JSON chart data until a no-key historical feed is promoted.</p></article>
      <article className="panel detail-card"><div className="section-title">GitHub database</div><h3>JSON-backed prototype</h3><p>Seed data lives in <code>data/stocks.json</code> and <code>data/portfolio.json</code>. User-added tickers stay in localStorage until we add a private backend.</p></article>
      <article className="panel detail-card"><div className="section-title">Next backend step</div><h3>Supabase or serverless</h3><p>For private portfolio saves, notes, and account-level watchlists, move writes out of the browser and behind auth.</p></article>
    </section>
  )
}
