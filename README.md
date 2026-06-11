# Stock Command Center

A static GitHub Pages market dashboard: dark command-center UI with a watchlist,
real OHLCV charts, sector heatmap, market instruments strip, catalysts, research
summaries, a news radar, and a private portfolio P&L tracker.

Live: https://jz237.github.io/stock-command-center/

## How data works

GitHub Pages is static hosting, and the free market-data APIs (Yahoo Finance
chart API, Cboe, etc.) do **not** send CORS headers, so the browser can never
call them directly. All market data therefore flows through JSON files
produced server-side by GitHub Actions:

- `data/stocks.json` (mirrored to `public/data/`) — quotes for 18 equities plus
  9 market instruments (S&P, NASDAQ, DOW, VIX, 10Y, DXY, BTC, WTI, GOLD):
  price, day change, previous close, day range, 52-week range, volume, and a
  60-day sparkline of real closes. Refreshed every 30 minutes during NYSE hours
  by `.github/workflows/update-prices.yml` and committed.
- `public/data/history.json` — real OHLCV bars per symbol (5-minute, 30-minute,
  daily, weekly, monthly) powering every chart range. Rebuilt on each deploy
  but **not** committed each run (it is ~1.2 MB); the checked-in copy is a seed
  for local development.
- `data/portfolio.json` — tracked symbols only. Share counts and cost basis
  entered in the Portfolio view stay in the visitor's `localStorage`; nothing
  personal is published.

Both update scripts validate everything they fetch (price inside the 52-week
range, sane day-change caps, fresh quote timestamps, cross-checks between
intraday and daily series) and refuse to write anything if any symbol fails,
so bad upstream data can never silently land in a commit.

## Local development

```bash
npm install
npm run update-prices -- --force  # refresh quotes (any time of day)
npm run update-history            # refresh chart history
npm run dev
npm run build && npm run lint
```

## Stack

Vite + React 19 + TypeScript, charts by `lightweight-charts` v5.
