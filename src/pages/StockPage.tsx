import { ChartPanel } from '../components/ChartPanel'
import type { PageProps } from './pageTypes'

export function StockPage({ quoteSource, selected }: PageProps) {
  return (
    <>
      <ChartPanel expanded stock={selected} quoteSource={quoteSource} />
      <section className="detail-grid">
        <article className="panel detail-card"><div className="section-title">Investment thesis</div><p>{selected.thesis}</p></article>
        <article className="panel detail-card"><div className="section-title">Catalyst checklist</div>{selected.catalysts.map((item) => <button className="pill" key={item}>{item}</button>)}</article>
        <article className="panel detail-card"><div className="section-title">Opportunities</div>{selected.opportunities.map((item) => <p key={item}>+ {item}</p>)}</article>
        <article className="panel detail-card"><div className="section-title">Risks</div>{selected.risks.map((item) => <p key={item}>- {item}</p>)}</article>
      </section>
    </>
  )
}
