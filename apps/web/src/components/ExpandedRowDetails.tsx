import type { ReactNode } from 'react'

export type DetailValue = { label: string; value: string }

export function DetailField({ label, value }: DetailValue) {
  return <p><strong>{label}:</strong> <span>{value}</span></p>
}

export function ExpandedRowDetails({ title, columns, details = null, children }: { title: string; columns: DetailValue[][]; details?: string | null; children?: ReactNode }) {
  if (title.toLowerCase().includes('item')) {
    const observation = columns[0]?.[0]?.value || details || '—'
    return <div className="payment-expanded item-observation-expanded"><section className="cash-flow-payment-documents payment-observations"><strong>Observações</strong><p className="preserve-lines">{observation}</p></section>{children}</div>
  }
  return <div className="payment-expanded cash-flow-details"><strong>{title}</strong><div className="payment-detail-columns">{columns.map((column, index) => <div key={index}>{column.map(field => <DetailField key={field.label} {...field} />)}</div>)}</div><section className="cash-flow-payment-documents payment-observations"><strong>Observações</strong><p className="preserve-lines">{details || '—'}</p></section>{children}</div>
}
