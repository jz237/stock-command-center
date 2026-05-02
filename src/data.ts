import type { NavItem, PortfolioSeed, Stock } from './types'

export const fallbackStocks: Stock[] = [
  {
    symbol: 'NVDA', name: 'NVIDIA', sector: 'AI Compute', price: 1132.4, change: 3.84, marketCap: '$2.8T', confidence: 94,
    thesis: 'NVIDIA remains the cleanest large-cap AI infrastructure story: demand for accelerators, networking, and software is still running ahead of supply.',
    risks: ['Customer concentration among hyperscalers', 'Export restrictions could pressure China revenue', 'Any Blackwell delay would hit sentiment fast'],
    opportunities: ['Blackwell ramp refreshes the upgrade cycle', 'Networking attach rates can lift system-level revenue', 'Enterprise AI software is still early'],
    catalysts: ['Blackwell shipment updates', 'Hyperscaler capex commentary', 'Data-center margin trend'],
    chart: [72, 74, 73, 78, 81, 80, 86, 91, 89, 94, 98, 102, 101, 108, 116],
  },
  {
    symbol: 'AVGO', name: 'Broadcom', sector: 'AI Networking', price: 1418.77, change: 2.11, marketCap: '$660B', confidence: 88,
    thesis: 'Broadcom is becoming a toll road for AI data centers through custom silicon, switching, and VMware cash flow.',
    risks: ['VMware integration execution', 'Custom AI chip demand can be lumpy', 'Debt load after acquisition'],
    opportunities: ['AI networking buildouts', 'VMware margin expansion', 'Custom ASIC wins'],
    catalysts: ['AI revenue guide', 'VMware renewal metrics', 'Large cloud customer wins'],
    chart: [61, 64, 66, 65, 69, 74, 73, 78, 82, 84, 83, 88, 91, 93, 96],
  },
  {
    symbol: 'MSFT', name: 'Microsoft', sector: 'Cloud / AI Apps', price: 432.68, change: 1.04, marketCap: '$3.2T', confidence: 86,
    thesis: 'Microsoft has the best distribution for turning AI into paid software, with Azure and Copilot doing the heavy lifting.',
    risks: ['AI capex could outpace near-term revenue', 'Copilot adoption may take longer than bulls expect', 'Regulatory pressure'],
    opportunities: ['Copilot monetization', 'Azure share gains', 'OpenAI ecosystem pull-through'],
    catalysts: ['Azure growth rate', 'Copilot seat disclosures', 'AI margin commentary'],
    chart: [83, 82, 84, 86, 88, 87, 90, 91, 93, 92, 95, 98, 97, 101, 103],
  },
  {
    symbol: 'TSM', name: 'Taiwan Semi', sector: 'Foundry', price: 168.92, change: -0.42, marketCap: '$875B', confidence: 82,
    thesis: 'TSMC is the manufacturing backbone of advanced AI chips, but geopolitics keeps a permanent risk discount on the stock.',
    risks: ['Taiwan geopolitical risk', 'Capex intensity', 'Customer bargaining power'],
    opportunities: ['Advanced packaging demand', '2nm cycle', 'Pricing power at leading nodes'],
    catalysts: ['Monthly sales', 'AI capacity expansion', '2nm yield updates'],
    chart: [58, 61, 64, 66, 68, 67, 69, 72, 75, 76, 74, 77, 80, 79, 81],
  },
  {
    symbol: 'PLTR', name: 'Palantir', sector: 'AI Software', price: 43.7, change: -2.26, marketCap: '$98B', confidence: 74,
    thesis: 'Palantir has real enterprise AI momentum, but the stock already prices in a lot of future perfection.',
    risks: ['High expectations', 'Government contract timing', 'Valuation sensitivity'],
    opportunities: ['AIP bootcamp conversion', 'Commercial customer expansion', 'Defense AI demand'],
    catalysts: ['Commercial revenue growth', 'Customer count', 'Margin durability'],
    chart: [35, 36, 39, 41, 40, 43, 47, 46, 50, 54, 52, 55, 57, 53, 51],
  },
  {
    symbol: 'AMZN', name: 'Amazon', sector: 'Cloud / Consumer', price: 187.21, change: 0.74, marketCap: '$1.95T', confidence: 80,
    thesis: 'Amazon is a two-engine story: AWS AI demand plus retail margin improvement.',
    risks: ['AWS competition', 'Consumer slowdown', 'Regulatory pressure'],
    opportunities: ['AWS AI services', 'Ads growth', 'Fulfillment efficiency'],
    catalysts: ['AWS growth', 'Retail operating margin', 'Advertising revenue'],
    chart: [67, 66, 68, 70, 69, 73, 75, 74, 77, 80, 79, 82, 84, 83, 86],
  },
]

export const fallbackPortfolio: PortfolioSeed = {
  positions: ['NVDA', 'MSFT', 'AVGO', 'TSM', 'PLTR', 'ARM', 'GOOG', 'META', 'AMZN', 'INTC', 'QCOM', 'VRT', 'CRWV', 'NVTS', 'ORCL', 'SOUN', 'BA', 'AAPL'].map((symbol) => ({ symbol })),
}

export const news = [
  { tag: 'AI Capex', title: 'Hyperscalers keep spending aggressively on AI data centers', impact: 'Bullish for NVDA, AVGO, VRT', time: '22m ago' },
  { tag: 'Chips', title: 'Advanced packaging capacity remains the bottleneck investors are watching', impact: 'Watch TSM and NVDA supply commentary', time: '1h ago' },
  { tag: 'Software', title: 'Enterprise AI budgets are shifting from pilots to production workloads', impact: 'MSFT and PLTR benefit if conversion holds', time: '3h ago' },
]

export const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/' },
  { id: 'stock', label: 'Stock Detail', path: '/stocks' },
  { id: 'portfolio', label: 'Portfolio', path: '/portfolio' },
  { id: 'research', label: 'Research', path: '/research' },
  { id: 'news', label: 'News', path: '/news' },
  { id: 'settings', label: 'Settings', path: '/settings' },
]

export const heatmapSizes: Record<string, number> = {
  NVDA: 20, AVGO: 15, MSFT: 13, AMZN: 12, GOOG: 11, META: 10, TSM: 10, ARM: 8, INTC: 8, QCOM: 7, PLTR: 7, VRT: 7,
}
