import { useEffect, useRef, useState } from 'react'
import { AreaSeries, HistogramSeries, createChart, type IChartApi, type ISeriesApi, type Time } from 'lightweight-charts'
import type { Stock, Timeframe } from '../types'

const timeframeDays: Record<Timeframe, number> = { '1M': 22, '3M': 66, '6M': 126, '1Y': 252 }
const timeframes: Timeframe[] = ['1M', '3M', '6M', '1Y']

function buildChartData(stock: Stock, timeframe: Timeframe) {
  const days = timeframeDays[timeframe]
  const source = stock.chart.length ? stock.chart : [stock.price]
  const lastPrice = stock.price || source.at(-1) || 100
  const start = new Date()
  start.setDate(start.getDate() - days * 1.45)
  const points = Array.from({ length: days }, (_, index) => {
    const base = source[Math.floor((index / Math.max(days - 1, 1)) * (source.length - 1))] || lastPrice
    const pulse = Math.sin(index / 3.4) * lastPrice * 0.004 + Math.cos(index / 8) * lastPrice * 0.006
    const value = Number((base + pulse).toFixed(2))
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1)
    return { time: date.toISOString().slice(0, 10) as Time, value }
  })
  points[points.length - 1] = { ...points[points.length - 1], value: Number(lastPrice.toFixed(2)) }
  const volume = points.map((point, index) => ({
    time: point.time,
    value: Math.round(800_000 + Math.abs(point.value - (points[index - 1]?.value || point.value)) * 95_000),
    color: point.value >= (points[index - 1]?.value || point.value) ? 'rgba(74, 222, 128, .25)' : 'rgba(251, 113, 133, .25)',
  }))
  return { points, volume }
}

function RealStockChart({ stock, timeframe }: { stock: Stock; timeframe: Timeframe }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const areaRef = useRef<ISeriesApi<'Area'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#8aa0bd' },
      grid: { vertLines: { color: 'rgba(120,144,173,.08)' }, horzLines: { color: 'rgba(120,144,173,.12)' } },
      rightPriceScale: { borderColor: 'rgba(120,144,173,.18)' },
      timeScale: { borderColor: 'rgba(120,144,173,.18)', timeVisible: false },
      crosshair: { mode: 1 },
    })
    const area = chart.addSeries(AreaSeries, {
      lineColor: '#4ade80',
      topColor: 'rgba(74,222,128,.34)',
      bottomColor: 'rgba(74,222,128,0)',
      lineWidth: 3,
      priceLineColor: 'rgba(74,222,128,.55)',
    })
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    })
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } })
    chartRef.current = chart
    areaRef.current = area
    volumeRef.current = volume
    return () => chart.remove()
  }, [])

  useEffect(() => {
    const data = buildChartData(stock, timeframe)
    areaRef.current?.setData(data.points)
    volumeRef.current?.setData(data.volume)
    chartRef.current?.timeScale().fitContent()
  }, [stock, timeframe])

  return <div className="real-chart" ref={containerRef} />
}

export function ChartPanel({ expanded = false, quoteSource, stock }: { expanded?: boolean; quoteSource: string; stock: Stock }) {
  const [timeframe, setTimeframe] = useState<Timeframe>('3M')

  return (
    <section className={`hero-card panel ${expanded ? 'expanded-chart' : ''}`}>
      <div className="stock-head">
        <div><span className="eyebrow">Selected equity</span><h2>{stock.symbol} <small>{stock.name}</small></h2></div>
        <div className="price">
          <strong>${stock.price.toLocaleString()}</strong>
          <span className={stock.change >= 0 ? 'up' : 'down'}>{stock.change >= 0 ? '+' : ''}{stock.change}% today</span>
          <small>{stock.changeAmount !== undefined ? `${stock.changeAmount >= 0 ? '+' : ''}$${Math.abs(stock.changeAmount).toFixed(2)} · ` : ''}{quoteSource}</small>
        </div>
      </div>
      <div className="stats"><span>Sector <b>{stock.sector}</b></span><span>Market cap <b>{stock.marketCap}</b></span><span>Conviction <b>{stock.confidence}/100</b></span></div>
      <div className="timeframes">{timeframes.map((period) => <button key={period} className={timeframe === period ? 'active' : ''} onClick={() => setTimeframe(period)}>{period}</button>)}</div>
      <RealStockChart stock={stock} timeframe={timeframe} />
    </section>
  )
}
