import { z } from 'zod'

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform(value => value || null)
const documentNumber = z.string().transform(value => value.replace(/\D/g, ''))

export const supplierSchema = z.object({
  tipo_documento: z.enum(['CPF', 'CNPJ']),
  numero_documento: documentNumber,
  nome: z.string().trim().min(2).max(180),
  telefone: optionalText(30),
  nome_funcionario: optionalText(180),
  email: z.union([z.email().max(254), z.literal(''), z.null()]).optional().transform(value => value || null),
  observacoes: optionalText(4_000),
  site: z.union([z.url().max(4_000), z.literal(''), z.null()]).optional().transform(value => value || null),
  chave_pix: optionalText(255),
  especialidades: z.array(z.string().trim().min(1).max(80)).max(20).optional().default([]).transform(values => [...new Set(values.map(value => value.trim()).filter(Boolean))]),
}).superRefine((value, context) => {
  const expected = value.tipo_documento === 'CPF' ? 11 : 14
  if (value.numero_documento.length !== expected) context.addIssue({ code: 'custom', path: ['numero_documento'], message: `Informe um ${value.tipo_documento} com ${expected} dígitos.` })
})

