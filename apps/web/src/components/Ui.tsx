import { AlertCircle, ArrowDown, ArrowUp, ChevronsUpDown, Inbox, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import type { SortDirection } from '../lib/sorting'
import { paymentStatusClass, paymentStatusLabel } from '../lib/paymentStatus'

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title?: string; description?: string; action?: ReactNode }) {
  return <header className="page-heading"><div>{eyebrow && <span>{eyebrow}</span>}{title && <h1>{title}</h1>}{description && <p>{description}</p>}</div>{action}</header>
}

export function EmptyState({ title, description, action, icon: Icon = Inbox }: { title: string; description: string; action?: ReactNode; icon?: typeof Inbox }) {
  return <div className="empty-state"><Icon /><h3>{title}</h3><p>{description}</p>{action}</div>
}

export function ErrorNotice({ message }: { message: string }) {
  return <div className="error-notice"><AlertCircle /> <span>{message}</span></div>
}

export function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className="app-button primary" type="button" {...props}>{children}</button>
}

export function AddButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <PrimaryButton {...props}><Plus size={16} />{children}</PrimaryButton>
}

export function MetricCard({ label, value, detail, tone }: { label: string; value: ReactNode; detail?: string; tone?: string }) {
  return <article className={`metric-card ${tone || ''}`}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</article>
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge ${paymentStatusClass(status)}`}>{paymentStatusLabel(status)}</span>
}

export function SortableHeader<T>({ label, column, activeColumn, direction, onSort, rowSpan, colSpan, className }: { label: string; column: keyof T; activeColumn: keyof T; direction: SortDirection; onSort: (column: keyof T) => void; rowSpan?: number; colSpan?: number; className?: string }) {
  const Icon = activeColumn === column ? direction === 'asc' ? ArrowUp : ArrowDown : ChevronsUpDown
  return <th rowSpan={rowSpan} colSpan={colSpan} className={className} aria-sort={activeColumn === column ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button className="sort-header" type="button" onClick={() => onSort(column)}>{label}<Icon /></button></th>
}
