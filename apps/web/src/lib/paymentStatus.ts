export const PAYMENT_STATUSES = [
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'EM_NEGOCIACAO', label: 'Em negociação' },
  { value: 'PAGO_AGUARDANDO_ENTREGA', label: 'Pago - Aguardando Entrega' },
  { value: 'CONCLUIDO', label: 'Concluído' },
] as const

export type PaymentStatus = typeof PAYMENT_STATUSES[number]['value']

export const paymentStatusLabel = (status: string) => PAYMENT_STATUSES.find((option) => option.value === status)?.label || status
export const paymentStatusClass = (status: string) => `status-${status.toLowerCase()}`
