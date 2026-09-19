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
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((value) => value || null)

function normalizeBrazilianPhone(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return value
  let digits = value.replace(/\D/g, '')
  if (!digits) return null
  if (digits === '55') return null
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length !== 10 && digits.length !== 11) return value
  return `55${digits}`
}

const supplierPhone = z.preprocess(normalizeBrazilianPhone, z.string().regex(/^55\d{10,11}$/, 'Informe um telefone brasileiro com DDD.').optional().nullable()).transform((value) => value || null)

export const purchaseSchema = z.object({
  descricao: z.string().trim().min(2).max(240),
  etapa_id: z.coerce.number().int().positive(),
  status: z.enum(PAYMENT_STATUS_VALUES).default('PENDENTE'),
  data_pagamento: optionalDate,
  forma_pagamento: z.enum(['PIX', 'CARTAO', 'DINHEIRO', 'BOLETO', 'TRANSFERENCIA', 'OUTRO']).optional().nullable(),
  fornecedor: optionalText(180),
  nome_contato_fornecedor: optionalText(180),
  contato_fornecedor: supplierPhone,
  observacao: optionalText(4_000),
  valor_desconto: z.preprocess(parseBrazilianNumber, z.coerce.number().min(0).max(999_999_999_999.99).optional().nullable()).transform((value) => value ?? null),
  numero_nota_fiscal: optionalText(100),
  data_emissao: optionalDate,
  data_agendamento: optionalDate,
  data_entrega: optionalDate,
  ordem: z.coerce.number().int().min(0).max(999_999).default(0),
}).superRefine((value, context) => {
  if (value.status === 'PAGO_AGUARDANDO_ENTREGA' && !value.data_pagamento) context.addIssue({ code: 'custom', path: ['data_pagamento'], message: 'A data do pagamento é obrigatória para o status Pago - Aguardando Entrega.' })
})

export const purchaseItemSchema = z.object({
  descricao: z.string().trim().min(2).max(240),
  quantidade: z.preprocess(parseBrazilianNumber, z.coerce.number().positive().max(999_999_999).optional().nullable()).transform((value) => value ?? null),
  unidade: optionalText(40),
  observacao: optionalText(4_000),
  valor_unitario: z.preprocess(parseBrazilianNumber, z.coerce.number().min(0).max(999_999_999_999.99).optional().nullable()).transform((value) => value ?? null),
  valor_desconto: z.preprocess(parseBrazilianNumber, z.coerce.number().min(0).max(999_999_999_999.99).optional().nullable()).transform((value) => value ?? null),
  valor_total: z.preprocess(parseBrazilianNumber, z.coerce.number().min(0).max(999_999_999_999.99).optional().nullable()).transform((value) => value ?? null),
  ordem: z.coerce.number().int().min(0).max(999_999).default(0),
  links_cotacao: z.array(z.string().trim().min(8).max(4_000)).max(50).optional(),
})

const normalizeExpenseReference = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const source = value as Record<string, unknown>
  return source.despesa_id === undefined && source.compra_id !== undefined ? { ...source, despesa_id: source.compra_id } : source
}

export const moveItemsSchema = z.preprocess(normalizeExpenseReference, z.object({
  item_ids: z.array(z.coerce.number().int().positive()).min(1).max(200).transform((values) => [...new Set(values)]),
  despesa_id: z.coerce.number().int().positive(),
}))

export const moveItemSchema = z.preprocess(normalizeExpenseReference, z.object({ despesa_id: z.coerce.number().int().positive() }))

export const paymentSchema = z.object({
  etapa_id: z.coerce.number().int().positive().optional().nullable(),
  quantidade: z.preprocess(parseBrazilianNumber, z.coerce.number().min(0).optional().nullable()).transform((value) => value ?? null),
  unidade: z.string().trim().max(40).optional().nullable().transform((value) => value || null),
  descricao: z.string().trim().min(2).max(240),
  fornecedor: z.string().trim().max(180).optional().nullable().transform((value) => value || null),
  contato_fornecedor: supplierPhone,
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
}).superRefine((value, context) => {
  if (value.status === 'PAGO_AGUARDANDO_ENTREGA' && !value.data_pagamento) context.addIssue({ code: 'custom', path: ['data_pagamento'], message: 'A data do pagamento é obrigatória para o status Pago - Aguardando Entrega.' })
})

export const linkSchema = z.object({ url: z.string().trim().min(8).max(4_000) })
export const paymentStatusSchema = z.object({ status: z.enum(PAYMENT_STATUS_VALUES) })
