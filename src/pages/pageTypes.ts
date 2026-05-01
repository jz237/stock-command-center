import type { PositionWithStock, PortfolioSeed, Stock } from '../types'

export type PageProps = {
  equity: number
  heatmap: { symbol: string; change: number; size: number }[]
  news: { tag: string; title: string; impact: string; time: string }[]
  pnl: number
  pnlPercent: number
  portfolio: PortfolioSeed
  positions: PositionWithStock[]
  quoteSource: string
  selected: Stock
  stocks: Stock[]
  topExposure?: PositionWithStock
  onSelectStock: (symbol: string) => void
}
