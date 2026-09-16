import { z } from 'zod'
import { AppError } from '../../shared/errors.js'

export const PROJECT_BACKUP_VERSION = '1.0' as const

const id = z.coerce.number().int().positive()
const textOrNumber = z.union([z.string(), z.number()])
const nullableTextOrNumber = textOrNumber.nullable()
const nullableText = z.string().nullable()
const nullableDate = z.preprocess((value) => value instanceof Date ? value.toISOString().slice(0,10) : value, z.string().nullable())
const date = z.preprocess((value) => value instanceof Date ? value.toISOString().slice(0,10) : value, z.string())
const projectRole = z.enum(['PROPRIETARIO', 'ENGENHEIRO', 'LEITOR'])

const projectSchema = z.object({
  nome: z.string().min(3).max(160), descricao: z.string().min(1).max(4_000), endereco: nullableText,
  cep: nullableText, logradouro: nullableText, numero: nullableText, complemento: nullableText, bairro: nullableText,
  cidade: nullableText, estado: nullableText, codigo_ibge_cidade: nullableText, latitude: nullableTextOrNumber,
  longitude: nullableTextOrNumber, data_inicio: nullableDate, previsao_termino: nullableDate,
  area_construida: nullableTextOrNumber, area_com_laje: nullableTextOrNumber, area_sem_laje: nullableTextOrNumber,
  processo_aprovacao: nullableText, pasta_digital: nullableText, planta_numero: nullableText, alvara: nullableText,
  art: nullableText, cno_obra: nullableText, matricula_terreno: nullableText,
})

const scheduleSchema = z.object({
  old_id: id, parent_old_id: id.nullable(), nome: z.string().min(1).max(180), descricao: nullableText,
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/), data_inicio_previsto: nullableDate, data_fim_previsto: nullableDate,
  data_inicio: nullableDate, data_fim: nullableDate, valor_previsto: textOrNumber, valor_executado: textOrNumber,
  ordem: z.number().int(),
})

const taskSchema = z.object({
  old_id: id, descricao: z.string().min(2).max(240), observacao: nullableText,
  status: z.enum(['PARADO', 'INICIADO', 'FINALIZADO']), prioridade: z.enum(['BAIXA', 'ALTA']),
})

const cashFlowSchema = z.object({
  old_id: id, competencia: date, ordem: z.number().int(),
  descricao: z.string().min(1).max(240), observacao: nullableText, valor: textOrNumber,
})

const paymentSchema = z.object({
  old_id: id, purchase_old_id: id.nullable().default(null), stage_old_id: id.nullable(), descricao: z.string().min(1).max(240), fornecedor: nullableText,
  contato_fornecedor: nullableText, nome_contato_fornecedor: nullableText, observacao: nullableText,
  ordem: z.number().int(), quantidade: nullableTextOrNumber, unidade: nullableText, chave_pix: nullableText,
  valor: nullableTextOrNumber, valor_unitario: nullableTextOrNumber.default(null), valor_desconto: nullableTextOrNumber.default(null), valor_total_manual: z.boolean().default(false), documentos_legados_habilitados: z.boolean().default(true), status: z.enum(['PENDENTE', 'EM_NEGOCIACAO', 'PAGO_AGUARDANDO_ENTREGA', 'CONCLUIDO']),
  forma_pagamento: nullableText, data_pagamento: nullableDate, data_agendamento: nullableDate, data_entrega: nullableDate,
})

const purchaseSchema = z.object({
  old_id: id, stage_old_id: id.nullable(), descricao: z.string().min(1).max(240),
  status: z.enum(['PENDENTE', 'EM_NEGOCIACAO', 'PAGO_AGUARDANDO_ENTREGA', 'CONCLUIDO']),
  data_pagamento: nullableDate, forma_pagamento: nullableText, fornecedor: nullableText,
  nome_contato_fornecedor: nullableText, contato_fornecedor: nullableText, observacao: nullableText, valor_desconto: nullableTextOrNumber.default(null), numero_nota_fiscal: nullableText,
  data_emissao: nullableDate, data_agendamento: nullableDate, data_entrega: nullableDate, ordem: z.number().int(),
})

const categorySchema = z.object({ old_id: id, nome: z.string().min(2).max(80) })
const attachmentSchema = z.object({ nome_original: z.string().max(255), tipo_mime: z.string().max(100), base64: z.string().min(1) })
const documentSchema = z.object({
  old_id: id, payment_old_id: id.nullable(), purchase_old_id: id.nullable().default(null), titulo: z.string().min(1).max(180), categoria: z.string().max(60),
  descricao: nullableText, tipo_origem: z.enum(['ARQUIVO', 'LINK']), url: nullableText, nome_original: nullableText,
  tipo_mime: nullableText, category_old_ids: z.array(id), arquivo: attachmentSchema.nullable(),
})
const quoteLinkSchema = z.object({ payment_old_id: id, url: z.url() })
const participantSchema = z.object({ email: z.email().max(254), papel: projectRole })
const memberPermissionSchema = z.object({ email: z.email().max(254), chave: z.string().min(3).max(120), permitido: z.boolean() })
const rolePermissionSchema = z.object({ papel: projectRole, chave: z.string().min(3).max(120), permitido: z.boolean() })

export const projectBackupSchema = z.object({
  backup: z.object({
    version: z.literal(PROJECT_BACKUP_VERSION), exported_at: z.iso.datetime(), source_project_id: id,
    warnings: z.array(z.string()), project: projectSchema,
    modules: z.object({
      cronograma: z.array(scheduleSchema), tarefas: z.array(taskSchema), fluxo_caixa: z.array(cashFlowSchema),
      compras: z.array(purchaseSchema).default([]), pagamentos: z.array(paymentSchema), links_cotacao: z.array(quoteLinkSchema), categorias: z.array(categorySchema),
      documentos: z.array(documentSchema), participantes: z.array(participantSchema),
      permissoes_membros: z.array(memberPermissionSchema), permissoes_papeis: z.array(rolePermissionSchema),
    }),
  }),
}).superRefine((value, context) => {
  const modules = value.backup.modules
  const ensureUnique = (values: number[], path: (string | number)[]) => {
    if (new Set(values).size !== values.length) context.addIssue({ code: 'custom', path, message: 'Existem identificadores duplicados.' })
  }
  ensureUnique(modules.cronograma.map((item) => item.old_id), ['backup','modules','cronograma'])
  ensureUnique(modules.tarefas.map((item) => item.old_id), ['backup','modules','tarefas'])
  ensureUnique(modules.fluxo_caixa.map((item) => item.old_id), ['backup','modules','fluxo_caixa'])
  ensureUnique(modules.pagamentos.map((item) => item.old_id), ['backup','modules','pagamentos'])
  ensureUnique(modules.compras.map((item) => item.old_id), ['backup','modules','compras'])
  ensureUnique(modules.categorias.map((item) => item.old_id), ['backup','modules','categorias'])
  ensureUnique(modules.documentos.map((item) => item.old_id), ['backup','modules','documentos'])
  const stages = new Set(modules.cronograma.map((item) => item.old_id))
  const payments = new Set(modules.pagamentos.map((item) => item.old_id))
  const purchases = new Set(modules.compras.map((item) => item.old_id))
  const categories = new Set(modules.categorias.map((item) => item.old_id))
  modules.cronograma.forEach((item, index) => {
    if (item.parent_old_id && !stages.has(item.parent_old_id)) context.addIssue({ code:'custom', path:['backup','modules','cronograma',index,'parent_old_id'], message:'A etapa pai não existe no backup.' })
  })
  modules.pagamentos.forEach((item, index) => {
    if (item.stage_old_id && !stages.has(item.stage_old_id)) context.addIssue({ code:'custom', path:['backup','modules','pagamentos',index,'stage_old_id'], message:'A etapa do pagamento não existe no backup.' })
    if (item.purchase_old_id && !purchases.has(item.purchase_old_id)) context.addIssue({ code:'custom', path:['backup','modules','pagamentos',index,'purchase_old_id'], message:'A Compra do item não existe no backup.' })
  })
  modules.compras.forEach((item, index) => {
    if (item.stage_old_id && !stages.has(item.stage_old_id)) context.addIssue({ code:'custom', path:['backup','modules','compras',index,'stage_old_id'], message:'A etapa da Compra não existe no backup.' })
  })
  modules.links_cotacao.forEach((item, index) => {
    if (!payments.has(item.payment_old_id)) context.addIssue({ code:'custom', path:['backup','modules','links_cotacao',index], message:'O pagamento do link não existe no backup.' })
  })
  modules.documentos.forEach((item, index) => {
    if (item.payment_old_id && !payments.has(item.payment_old_id)) context.addIssue({ code:'custom', path:['backup','modules','documentos',index,'payment_old_id'], message:'O pagamento do documento não existe no backup.' })
    if (item.purchase_old_id && !purchases.has(item.purchase_old_id)) context.addIssue({ code:'custom', path:['backup','modules','documentos',index,'purchase_old_id'], message:'A Compra do documento não existe no backup.' })
    if (item.category_old_ids.some((categoryId) => !categories.has(categoryId))) context.addIssue({ code:'custom', path:['backup','modules','documentos',index,'category_old_ids'], message:'Uma categoria do documento não existe no backup.' })
    if (item.tipo_origem === 'LINK' && !item.url) context.addIssue({ code:'custom', path:['backup','modules','documentos',index,'url'], message:'O endereço do documento não está disponível.' })
  })
})

export type ProjectBackup = z.infer<typeof projectBackupSchema>

export function parseProjectBackup(value: unknown): ProjectBackup {
  const version = value && typeof value === 'object' && 'backup' in value && value.backup && typeof value.backup === 'object' && 'version' in value.backup
    ? String(value.backup.version) : ''
  if (version && version !== PROJECT_BACKUP_VERSION) throw new AppError(422, `Versão de backup incompatível: ${version}. Versão aceita: ${PROJECT_BACKUP_VERSION}.`, 'BACKUP_VERSAO_INCOMPATIVEL')
  const parsed = projectBackupSchema.safeParse(value)
  if (!parsed.success) throw new AppError(422, 'O arquivo não possui uma estrutura de backup válida.', 'BACKUP_INVALIDO', parsed.error.issues.map((issue) => ({ campo: issue.path.join('.'), mensagem: issue.message })))
  return parsed.data
}

export function parseProjectBackupJson(content: string): ProjectBackup {
  try { return parseProjectBackup(JSON.parse(content)) }
  catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError(422, 'O arquivo selecionado não contém um JSON válido.', 'BACKUP_JSON_INVALIDO')
  }
}
