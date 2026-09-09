export const PAYMENT_STATUS = {
  PENDENTE: 'PENDENTE',
  EM_NEGOCIACAO: 'EM_NEGOCIACAO',
  PAGO_AGUARDANDO_ENTREGA: 'PAGO_AGUARDANDO_ENTREGA',
  CONCLUIDO: 'CONCLUIDO',
} as const

export const PAYMENT_STATUS_VALUES = [
  PAYMENT_STATUS.PENDENTE,
  PAYMENT_STATUS.EM_NEGOCIACAO,
  PAYMENT_STATUS.PAGO_AGUARDANDO_ENTREGA,
  PAYMENT_STATUS.CONCLUIDO,
] as const

export type PaymentStatus = typeof PAYMENT_STATUS_VALUES[number]

export const PAYMENT_STATUSES = [
  { value: PAYMENT_STATUS.PENDENTE, label: 'Pendente' },
  { value: PAYMENT_STATUS.EM_NEGOCIACAO, label: 'Em negociação' },
  { value: PAYMENT_STATUS.PAGO_AGUARDANDO_ENTREGA, label: 'Pago - Aguardando Entrega' },
  { value: PAYMENT_STATUS.CONCLUIDO, label: 'Concluído' },
] as const

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = Object.fromEntries(
  PAYMENT_STATUSES.map((status) => [status.value, status.label]),
) as Record<PaymentStatus, string>

export const SETTLED_PAYMENT_STATUSES: PaymentStatus[] = [PAYMENT_STATUS.PAGO_AGUARDANDO_ENTREGA, PAYMENT_STATUS.CONCLUIDO]

export function normalizePaymentStatus(value: unknown): string {
  const normalized = String(value || 'PENDENTE')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s*-\s*/g, '_')
    .replaceAll(' ', '_')

  const aliases: Record<string, PaymentStatus> = {
    PARADO: 'PENDENTE',
    FINALIZADO: 'CONCLUIDO',
    CONCLUIDO: 'CONCLUIDO',
    PAGO: 'PAGO_AGUARDANDO_ENTREGA',
    PAGO_AGUARDANDO_ENTREGA: 'PAGO_AGUARDANDO_ENTREGA',
    EM_NEGOCIACAO: 'EM_NEGOCIACAO',
    PENDENTE: 'PENDENTE',
  }
  return aliases[normalized] || normalized
}
