export const formatMoney = (value: string | number | null | undefined) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 2,
}).format(Number(value || 0))

export const formatDate = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`))
  : '—'

export const formatMonth = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 7)}-01T12:00:00Z`)).replace('.', '')
  : '—'

export const formatDateRange = (start: string | null | undefined, end: string | null | undefined) => {
  if (start && end) return `${formatDate(start)} à ${formatDate(end)}`
  if (start) return `A partir de ${formatDate(start)}`
  if (end) return `Até ${formatDate(end)}`
  return 'Período não informado'
}

export const formatQuantity = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') return ''
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(Number(value))
}
