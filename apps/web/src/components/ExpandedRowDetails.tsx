import type { ReactNode } from 'react'

export type DetailValue = { label: string; value: string }

export function DetailField({ label, value }: DetailValue) {
  return <p><strong>{label}:</strong> <span>{value}</span></p>
}

export function ExpandedRowDetails({ title, columns, details, children }: { title: string; columns: DetailValue[][]; details: string | null; children?: ReactNode }) {
  return <div className="payment-expanded cash-flow-details"><strong>{title}</strong><div className="payment-detail-columns">{columns.map((column, index) => <div key={index}>{column.map(field => <DetailField key={field.label} {...field} />)}</div>)}</div><section className="cash-flow-payment-documents payment-observations"><strong>Observações</strong><p className="preserve-lines">{details || '—'}</p></section>{children}</div>
}
