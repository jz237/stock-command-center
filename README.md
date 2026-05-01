# Stock Command Center

A static GitHub Pages prototype for a premium stock investing dashboard.

## Features

- Dark market-command-center UI with watchlist, central chart, heatmap, catalysts, AI research, risks, opportunities, and portfolio widgets.
- GitHub-backed JSON data in `data/stocks.json` and `data/portfolio.json`.
- Seed stock prices refresh from the free `stockprices.dev` quote API via GitHub Actions, then deploy as static JSON for the site to read.
- User-added tickers persist in `localStorage` so the static site needs no backend secrets.
- Built with Vite, React, and TypeScript.

## Local development

```bash
npm install
npm run dev
npm run build
npm run update-prices
```

## Notes

This is a polished prototype. Stock prices for seeded tickers are refreshed through GitHub Actions using `stockprices.dev` with no frontend API keys. News, research text, and user-added tickers are still prototype/local data until a backend or GitHub-authorized write flow is added.
