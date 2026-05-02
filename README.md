# Stock Command Center

A static GitHub Pages market-command-center dashboard for StockBot's portfolio intelligence.

## Features

- Dark command-center UI with watchlist, live quote panel, sector heatmap, catalysts, AI research summary, risks, opportunities, portfolio widgets, allocation, movers, and market summary.
- Client-side free live pricing refresh via Yahoo Finance chart data, with visible static-data fallback if the browser/API blocks a request.
- StockBot-backed JSON seed data in `public/data/stocks.json` and `public/data/portfolio.json`.
- `scripts/export_site_data.py` exports StockBot workspace files into the static site data payload.
- User-added tickers and saved portfolio symbols persist in `localStorage`, so the static site needs no backend secrets.
- Built with Vite, React, and TypeScript.

## Local development

```bash
npm install
python3 scripts/export_site_data.py  # optional: refresh from StockBot workspace
npm run dev
npm run build
```

## Data flow

1. Static JSON loads first so the site is fast and works on GitHub Pages.
2. The browser attempts to refresh prices/charts from Yahoo Finance every two minutes.
3. If the live feed fails, the dashboard keeps working from StockBot's cached data and shows `Static fallback data`.

## Next upgrades

- Add a serverless price proxy if Yahoo blocks CORS/rate limits in production.
- Replace decorative market-summary data with a real index/breadth feed.
- Add per-ticker notes, holdings editing, and generated full research report pages.
