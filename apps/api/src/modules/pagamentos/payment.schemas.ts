import { z } from 'zod'
import { parseBrazilianNumber } from '../../shared/importParser.js'
import { PAYMENT_STATUS_VALUES } from './payment-status.js'

function normalizeDate(value: unknown) {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return trimmed
  const [, day, month, year] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return value
  return `${year}-${month}-${day}`
}

const optionalDate = z.preprocess(normalizeDate, z.union([z.iso.date(), z.literal(''), z.null()]).optional()).transform((value) => value || null)

export const paymentSchema = z.object({
  etapa_id: z.coerce.number().int().positive().optional().nullable(),
  quantidade: z.preprocess(parseBrazilianNumber, z.coerce.number().min(0).optional().nullable()).transform((value) => value ?? null),
  unidade: z.string().trim().max(40).optional().nullable().transform((value) => value || null),
  descricao: z.string().trim().min(2).max(240),
  fornecedor: z.string().trim().max(180).optional().nullable().transform((value) => value || null),
  contato_fornecedor: z.string().trim().max(30).optional().nullable().transform((value) => value || null),
  nome_contato_fornecedor: z.string().trim().max(180).optional().nullable().transform((value) => value || null),
  chave_pix: z.string().trim().max(255).optional().nullable().transform((value) => value || null),
  valor: z.preprocess(parseBrazilianNumber, z.coerce.number().min(0).max(999_999_999_999.99).optional().nullable()).transform((value) => value ?? null),
  status: z.enum(PAYMENT_STATUS_VALUES).default('PENDENTE'),
  forma_pagamento: z.enum(['PIX', 'CARTAO', 'DINHEIRO', 'BOLETO', 'TRANSFERENCIA', 'OUTRO']).optional().nullable(),
  data_pagamento: optionalDate,
  data_agendamento: optionalDate,
  data_entrega: optionalDate,
  observacao: z.string().trim().max(4_000).optional().nullable().transform((value) => value || null),
  ordem: z.coerce.number().int().min(0).max(999_999).default(0),
  links_cotacao: z.array(z.string().trim().min(8).max(4_000)).max(50).optional(),
  documentos: z.array(z.string().trim().min(8).max(4_000)).max(50).optional(),
}).superRefine((value, context) => {
  if (value.status === 'PAGO_AGUARDANDO_ENTREGA' && !value.data_pagamento) context.addIssue({ code: 'custom', path: ['data_pagamento'], message: 'A data do pagamento é obrigatória para o status Pago - Aguardando Entrega.' })
})

export const linkSchema = z.object({ url: z.string().trim().min(8).max(4_000) })
export const paymentStatusSchema = z.object({ status: z.enum(PAYMENT_STATUS_VALUES) })
