export type Stock = {
  symbol: string
  name: string
  sector: string
  price: number
  change: number
  marketCap: string
  confidence: number
  thesis: string
  risks: string[]
  opportunities: string[]
  catalysts: string[]
  chart: number[]
  changeAmount?: number
  quoteSource?: string
  quoteUpdatedAt?: string
}

export type PortfolioSeed = {
  positions: { symbol: string }[]
}

export type PositionWithStock = PortfolioSeed['positions'][number] & { stock: Stock }

export type Timeframe = '1M' | '3M' | '6M' | '1Y'

export type View = 'dashboard' | 'stock' | 'portfolio' | 'research' | 'news' | 'settings'

export type NavItem = { id: View; label: string; path: string }
