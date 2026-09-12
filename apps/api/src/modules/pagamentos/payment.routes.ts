import { Router } from 'express'
import multer from 'multer'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import { query, withTransaction } from '../../config/database.js'
import { env } from '../../config/env.js'
import { requireAuth } from '../../shared/auth.js'
import { recordAudit } from '../../shared/audit.js'
import { AppError } from '../../shared/errors.js'
import { parseImportContent } from '../../shared/importParser.js'
import { requireProjectPermission } from '../../shared/projectAccess.js'
import { readStoredFile, safeDownloadName, saveUploadedFile } from '../../shared/storage.js'
import { identifyStore, validateHttpUrl } from '../../shared/url.js'
import { validateBody } from '../../shared/validation.js'
import { assignDocumentCategoryByName } from '../arquivos/document-categories.js'
import { activeScheduleStageOrder, activeScheduleStageWhere } from '../etapas/stage-query.js'
import { createPaymentPdf, createPaymentWorkbook, getPaymentReport } from './payment-report.service.js'
import { normalizePaymentStatus, PAYMENT_STATUS_VALUES, type PaymentStatus } from './payment-status.js'
import { linkSchema, paymentSchema, paymentStatusSchema } from './payment.schemas.js'

const paymentImportSchema = z.object({
  formato: z.enum(['TSV', 'JSON']), conteudo: z.string().min(2), modo: z.enum(['ACRESCENTAR', 'SUBSTITUIR']).optional(), nomeArquivo: z.string().max(255).optional(),
})

const documentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.maxUploadBytes, files: 1 } })
const paymentDocumentSchema = z.object({
  titulo: z.string().trim().min(2).max(180),
  categoria: z.string().trim().min(2).max(40).default('OUTROS'),
  url: z.string().trim().max(4_000).optional().nullable().transform((value) => value || null),
})

async function ensureStage(projectId: number, stageId?: number | null) {
  if (!stageId) return
  const { rowCount } = await query('SELECT 1 FROM cronogramas WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL', [stageId, projectId])
  if (!rowCount) throw new AppError(422, 'A etapa não pertence ao projeto.', 'ETAPA_INVALIDA')
}

async function resolveStage(projectId: number, value: unknown): Promise<number | null> {
  if (value === null || value === undefined || value === '') return null
  if (Number.isInteger(Number(value))) {
    const { rows } = await query<{ id: number }>('SELECT id FROM cronogramas WHERE (id=$1 OR ordem=$1) AND projeto_id=$2 AND excluido_em IS NULL ORDER BY parent_id IS NOT NULL DESC,id=$1 DESC LIMIT 1', [Number(value), projectId])
    return rows[0]?.id ?? null
  }
  const { rows } = await query<{ id: number }>('SELECT id FROM cronogramas WHERE projeto_id=$1 AND LOWER(nome)=LOWER($2) AND excluido_em IS NULL ORDER BY parent_id IS NOT NULL DESC LIMIT 1', [projectId, String(value).trim()])
  return rows[0]?.id ?? null
}

function splitPipe(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean)
  return typeof value === 'string' ? value.split('|').map((item) => item.trim()).filter(Boolean) : []
}

async function syncPaymentLinks(client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }, paymentId: number, links: string[], userId: number) {
  await client.query('DELETE FROM links_cotacao_pagamento WHERE pagamento_id=$1', [paymentId])
  for (const rawUrl of links) {
    const url = validateHttpUrl(rawUrl)
    await client.query('INSERT INTO links_cotacao_pagamento (pagamento_id,url,criado_por) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [paymentId,url,userId])
  }
}

async function syncPaymentDocumentLinks(client: PoolClient, paymentId: number, links: string[], userId: number) {
  await client.query(`INSERT INTO categorias_documento (projeto_id,nome,criado_por)
    SELECT projeto_id,'Pagamentos',$2 FROM pagamentos WHERE id=$1 ON CONFLICT DO NOTHING`, [paymentId, userId])
  for (const rawUrl of links) {
    const url = validateHttpUrl(rawUrl)
    const document = await client.query<{ id: number; projeto_id: number }>(`INSERT INTO documentos_projeto
      (projeto_id,pagamento_id,titulo,categoria,tipo_origem,url,criado_por)
      SELECT projeto_id,id,$2,'Pagamentos','LINK',$3,$4 FROM pagamentos WHERE id=$1 RETURNING id,projeto_id`, [paymentId, identifyStore(url) || 'Documento relacionado', url, userId])
    if (document.rows[0]) await assignDocumentCategoryByName(client, document.rows[0].id, document.rows[0].projeto_id, 'Pagamentos')
  }
}

export const paymentsRouter = Router({ mergeParams: true })
paymentsRouter.use(requireAuth)

paymentsRouter.get('/', requireProjectPermission('pagamentos.visualizar'), async (req, res) => {
  const page = Math.max(1, Number(req.query.pagina) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(req.query.porPagina) || 20))
  const status = String(req.query.status || '')
  if (status && !PAYMENT_STATUS_VALUES.includes(status as PaymentStatus)) throw new AppError(422, 'Status de pagamento inválido.', 'STATUS_INVALIDO')
  const search = String(req.query.busca || '').trim()
  const stageId = Number.isSafeInteger(Number(req.query.etapaId)) && Number(req.query.etapaId) > 0 ? Number(req.query.etapaId) : null
  const [payments, count] = await Promise.all([
    query(`SELECT p.id,p.descricao,p.fornecedor,p.contato_fornecedor,p.nome_contato_fornecedor,p.observacao,p.ordem,p.etapa_id,CASE WHEN COALESCE(pai.id,e.id) IS NULL THEN NULL ELSE 'ETAPA '||COALESCE(pai.ordem,e.ordem)||' - '||COALESCE(pai.nome,e.nome) END AS etapa,COALESCE(pai.ordem,e.ordem) AS etapa_ordem,COALESCE(pai.cor,e.cor) AS etapa_cor,p.criado_em,
      p.quantidade,p.unidade,p.chave_pix,p.valor,p.status,p.forma_pagamento,p.data_pagamento,p.data_agendamento,p.data_entrega,
      p.valor::numeric(15,2) AS valor_total,
      COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT('id',lc.id,'url',lc.url,'loja',CASE
        WHEN LOWER(lc.url) LIKE '%amazon.%' THEN 'Amazon' WHEN LOWER(lc.url) LIKE '%shopee.%' THEN 'Shopee'
        WHEN LOWER(lc.url) LIKE '%mercadolivre.%' THEN 'Mercado Livre'
        ELSE REGEXP_REPLACE(SPLIT_PART(REGEXP_REPLACE(lc.url,'^https?://','','i'), '/', 1),'^www\\.','','i') END) ORDER BY lc.id)
        FROM links_cotacao_pagamento lc WHERE lc.pagamento_id=p.id),'[]'::jsonb) AS links_cotacao,
      (SELECT COUNT(*)::int FROM documentos_projeto d WHERE d.pagamento_id=p.id AND d.excluido_em IS NULL) AS quantidade_documentos
      FROM pagamentos p LEFT JOIN cronogramas e ON e.id=p.etapa_id LEFT JOIN cronogramas pai ON pai.id=e.parent_id
      WHERE p.projeto_id=$1 AND p.excluido_em IS NULL
        AND ($2='' OR p.status=$2)
        AND ($3='%%' OR p.descricao ILIKE $3 OR p.fornecedor ILIKE $3)
        AND ($4::bigint IS NULL OR p.etapa_id=$4 OR e.parent_id=$4)
      GROUP BY p.id,e.id,e.nome,e.ordem,e.cor,pai.id,pai.nome,pai.ordem,pai.cor ORDER BY p.data_pagamento DESC NULLS FIRST,p.id DESC LIMIT $5 OFFSET $6`, [req.acessoProjeto!.projetoId,status,`%${search}%`,stageId,pageSize,(page-1)*pageSize]),
    query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM pagamentos p LEFT JOIN cronogramas e ON e.id=p.etapa_id WHERE p.projeto_id=$1 AND p.excluido_em IS NULL
      AND ($2='' OR p.status=$2)
      AND ($3='%%' OR p.descricao ILIKE $3 OR p.fornecedor ILIKE $3)
      AND ($4::bigint IS NULL OR p.etapa_id=$4 OR e.parent_id=$4)`, [req.acessoProjeto!.projetoId,status,`%${search}%`,stageId]),
  ])
  res.json({ pagamentos: payments.rows, pagina: page, porPagina: pageSize, total: count.rows[0]!.total })
})

paymentsRouter.get('/relatorio.pdf', requireProjectPermission('pagamentos.exportar'), async (req, res) => {
  const projectId = req.acessoProjeto!.projetoId
  const document = createPaymentPdf(projectId, await getPaymentReport(projectId))
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="pagamentos-${projectId}.pdf"`)
  document.pipe(res)
  document.end()
})

paymentsRouter.get('/relatorio.xlsx', requireProjectPermission('pagamentos.exportar'), async (req, res) => {
  const projectId = req.acessoProjeto!.projetoId
  const content = await createPaymentWorkbook(projectId, await getPaymentReport(projectId))
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="pagamentos-${projectId}.xlsx"`)
  res.send(Buffer.from(content))
})

paymentsRouter.get('/etapas', requireProjectPermission('pagamentos.visualizar'), async (req, res) => {
  const { rows } = await query(`SELECT id,parent_id,nome,ordem,cor FROM cronogramas
    WHERE projeto_id=$1 AND ${activeScheduleStageWhere('cronogramas')}
    ORDER BY ${activeScheduleStageOrder('cronogramas')}`, [req.acessoProjeto!.projetoId])
  res.json({ etapas: rows })
})

paymentsRouter.post('/', requireProjectPermission('pagamentos.inserir'), validateBody(paymentSchema), async (req, res) => {
  await ensureStage(req.acessoProjeto!.projetoId, req.body.etapa_id)
  const payment = await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: number }>(`INSERT INTO pagamentos
      (projeto_id,etapa_id,quantidade,unidade,descricao,fornecedor,contato_fornecedor,nome_contato_fornecedor,chave_pix,valor,status,forma_pagamento,data_pagamento,data_agendamento,data_entrega,observacao,ordem,criado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`, [
      req.acessoProjeto!.projetoId,req.body.etapa_id,req.body.quantidade,req.body.unidade,req.body.descricao,req.body.fornecedor,req.body.contato_fornecedor,req.body.nome_contato_fornecedor,req.body.chave_pix,
      req.body.valor,req.body.status,req.body.forma_pagamento,req.body.data_pagamento,req.body.data_agendamento,req.body.data_entrega,req.body.observacao,req.body.ordem,req.usuarioId,
    ])
    const id = rows[0]!.id
    await syncPaymentLinks(client, id, req.body.links_cotacao ?? [], req.usuarioId!)
    await syncPaymentDocumentLinks(client, id, req.body.documentos ?? [], req.usuarioId!)
    await recordAudit(client, { projetoId: req.acessoProjeto!.projetoId, usuarioId: req.usuarioId!, acao: 'PAGAMENTO_CRIADO', entidade: 'pagamentos', registroId: id, dadosNovos: req.body, enderecoIp: req.ip })
    return { id }
  })
  res.status(201).json({ pagamento: payment })
})

paymentsRouter.put('/:pagamentoId', requireProjectPermission('pagamentos.atualizar'), validateBody(paymentSchema), async (req, res) => {
  const paymentId = Number(req.params.pagamentoId)
  await ensureStage(req.acessoProjeto!.projetoId, req.body.etapa_id)
  await withTransaction(async (client) => {
    const before = await client.query('SELECT * FROM pagamentos WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL FOR UPDATE', [paymentId, req.acessoProjeto!.projetoId])
    if (!before.rows[0]) throw new AppError(404, 'Pagamento não encontrado.', 'PAGAMENTO_NAO_ENCONTRADO')
    await client.query(`UPDATE pagamentos SET etapa_id=$3,quantidade=$4,unidade=$5,descricao=$6,fornecedor=$7,contato_fornecedor=$8,nome_contato_fornecedor=$9,chave_pix=$10,
      valor=$11,status=$12,forma_pagamento=$13,data_pagamento=$14,data_agendamento=$15,data_entrega=$16,observacao=$17,ordem=$18
      WHERE id=$1 AND projeto_id=$2`, [paymentId,req.acessoProjeto!.projetoId,req.body.etapa_id,req.body.quantidade,req.body.unidade,req.body.descricao,
      req.body.fornecedor,req.body.contato_fornecedor,req.body.nome_contato_fornecedor,req.body.chave_pix,req.body.valor,req.body.status,req.body.forma_pagamento,req.body.data_pagamento,req.body.data_agendamento,
      req.body.data_entrega,req.body.observacao,req.body.ordem])
    if (req.body.links_cotacao) await syncPaymentLinks(client, paymentId, req.body.links_cotacao, req.usuarioId!)
    if (req.body.documentos) await syncPaymentDocumentLinks(client, paymentId, req.body.documentos, req.usuarioId!)
    await recordAudit(client, { projetoId: req.acessoProjeto!.projetoId, usuarioId: req.usuarioId!, acao: 'PAGAMENTO_ATUALIZADO', entidade: 'pagamentos', registroId: paymentId, dadosAnteriores: before.rows[0], dadosNovos: req.body, enderecoIp: req.ip })
  })
  res.status(204).end()
})

paymentsRouter.patch('/:pagamentoId/status', requireProjectPermission('pagamentos.atualizar'), validateBody(paymentStatusSchema), async (req, res) => {
  const paymentId = Number(req.params.pagamentoId)
  const payment = await withTransaction(async (client) => {
    const before = await client.query<{ status: PaymentStatus; data_pagamento: string | null }>('SELECT status,data_pagamento FROM pagamentos WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL FOR UPDATE', [paymentId,req.acessoProjeto!.projetoId])
    if (!before.rows[0]) throw new AppError(404, 'Pagamento não encontrado.', 'PAGAMENTO_NAO_ENCONTRADO')
    if (req.body.status === 'PAGO_AGUARDANDO_ENTREGA' && !before.rows[0].data_pagamento) throw new AppError(422, 'Informe a data do pagamento antes de usar o status Pago - Aguardando Entrega.', 'DATA_PAGAMENTO_OBRIGATORIA')
    const { rows } = await client.query<{ id: number; status: PaymentStatus }>('UPDATE pagamentos SET status=$3 WHERE id=$1 AND projeto_id=$2 RETURNING id,status', [paymentId,req.acessoProjeto!.projetoId,req.body.status])
    await recordAudit(client, { projetoId: req.acessoProjeto!.projetoId, usuarioId: req.usuarioId!, acao: 'STATUS_PAGAMENTO_ATUALIZADO', entidade: 'pagamentos', registroId: paymentId, dadosAnteriores: before.rows[0], dadosNovos: rows[0], enderecoIp: req.ip })
    return rows[0]
  })
  res.json({ pagamento: payment })
})

paymentsRouter.delete('/:pagamentoId', requireProjectPermission('pagamentos.excluir'), async (req, res) => {
  const paymentId = Number(req.params.pagamentoId)
  await withTransaction(async (client) => {
    const { rowCount } = await client.query('UPDATE pagamentos SET excluido_em=NOW() WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL', [paymentId, req.acessoProjeto!.projetoId])
    if (!rowCount) throw new AppError(404, 'Pagamento não encontrado.', 'PAGAMENTO_NAO_ENCONTRADO')
    await client.query('UPDATE itens_pagamento SET excluido_em=NOW() WHERE pagamento_id=$1 AND excluido_em IS NULL', [paymentId])
    await recordAudit(client, { projetoId: req.acessoProjeto!.projetoId, usuarioId: req.usuarioId!, acao: 'PAGAMENTO_EXCLUIDO', entidade: 'pagamentos', registroId: paymentId, enderecoIp: req.ip })
  })
  res.status(204).end()
})

paymentsRouter.post('/:pagamentoId/links', requireProjectPermission('pagamentos.atualizar'), validateBody(linkSchema), async (req, res) => {
  const paymentId = Number(req.params.pagamentoId)
  const url = validateHttpUrl(req.body.url)
  const payment = await query('SELECT 1 FROM pagamentos WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL', [paymentId,req.acessoProjeto!.projetoId])
  if (!payment.rowCount) throw new AppError(404, 'Pagamento não encontrado.', 'PAGAMENTO_NAO_ENCONTRADO')
  const { rows } = await query<{ id: number; url: string }>(`INSERT INTO links_cotacao_pagamento
    (pagamento_id,url,criado_por) VALUES ($1,$2,$3) ON CONFLICT (pagamento_id,url) DO UPDATE SET url=EXCLUDED.url RETURNING id,url`, [paymentId,url,req.usuarioId])
  res.status(201).json({ link: { ...rows[0]!, loja: identifyStore(url) } })
})

paymentsRouter.delete('/:pagamentoId/links/:linkId', requireProjectPermission('pagamentos.atualizar'), async (req, res) => {
  const { rowCount } = await query(`DELETE FROM links_cotacao_pagamento lc USING pagamentos p
    WHERE lc.id=$1 AND lc.pagamento_id=$2 AND p.id=lc.pagamento_id AND p.projeto_id=$3`, [Number(req.params.linkId),Number(req.params.pagamentoId),req.acessoProjeto!.projetoId])
  if (!rowCount) throw new AppError(404, 'Link não encontrado.', 'LINK_NAO_ENCONTRADO')
  res.status(204).end()
})

async function parsePayments(projectId: number, format: 'TSV' | 'JSON', content: string) {
  const raw = parseImportContent(format, content)
  const valid: z.infer<typeof paymentSchema>[] = []
  const errors: { linha: number; erros: string[] }[] = []
  for (let index = 0; index < raw.length; index += 1) {
    const source = raw[index] as Record<string, unknown>
    const links = source?.links_cotacao ?? source?.links_de_cotacao ?? source?.cotacoes
    const documents = source?.documentos ?? source?.documentos_relacionados
    const details = source?.subitens ?? source?.detalhes
    const detailText = Array.isArray(details) ? details.map((detail) => {
      if (!detail || typeof detail !== 'object') return String(detail)
      const item = detail as Record<string, unknown>
      return [item.descricao, item.quantidade, item.unidade, item.valor].filter((value) => value !== null && value !== undefined && value !== '').join(' | ')
    }).filter(Boolean).join('\n') : ''
    const normalized = {
      etapa_id: await resolveStage(projectId, source?.etapa_id ?? source?.etapa),
      quantidade: source?.quantidade ?? source?.qtde ?? null,
      unidade: source?.unidade ?? null,
      descricao: source?.descricao ?? source?.item,
      fornecedor: source?.fornecedor ?? null,
      contato_fornecedor: source?.contato_fornecedor ?? source?.contato ?? null,
      nome_contato_fornecedor: source?.nome_contato_fornecedor ?? source?.nome_funcionario ?? null,
      chave_pix: source?.chave_pix ?? source?.pix ?? null,
      valor: source?.valor,
      status: normalizePaymentStatus(source?.status),
      forma_pagamento: String(source?.forma_pagamento ?? source?.forma_de_pagto ?? '').trim().toUpperCase() || null,
      data_pagamento: source?.data_pagamento ?? source?.data ?? null,
      data_agendamento: source?.data_agendamento ?? null,
      data_entrega: source?.data_entrega ?? null,
      observacao: [source?.observacao ?? source?.observacoes, detailText].filter(Boolean).join('\n') || null,
      ordem: source?.ordem ?? index + 1,
      links_cotacao: splitPipe(links),
      documentos: splitPipe(documents),
    }
    const result = paymentSchema.safeParse(normalized)
    if (result.success) valid.push(result.data)
    else errors.push({ linha: index + 2, erros: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) })
  }
  return { registros: valid, erros: errors, total: raw.length }
}

paymentsRouter.post('/importacao/preview', requireProjectPermission('pagamentos.inserir'), validateBody(paymentImportSchema), async (req, res) => {
  res.json(await parsePayments(req.acessoProjeto!.projetoId, req.body.formato, req.body.conteudo))
})

paymentsRouter.post('/importacao/confirmar', requireProjectPermission('pagamentos.inserir'), validateBody(paymentImportSchema.required({ modo: true })), async (req, res) => {
  const parsed = await parsePayments(req.acessoProjeto!.projetoId, req.body.formato, req.body.conteudo)
  if (parsed.erros.length) throw new AppError(422, 'A importação possui erros e não foi aplicada.', 'IMPORTACAO_INVALIDA', parsed.erros)
  await withTransaction(async (client) => {
    if (req.body.modo === 'SUBSTITUIR') await client.query('UPDATE pagamentos SET excluido_em=NOW() WHERE projeto_id=$1 AND excluido_em IS NULL', [req.acessoProjeto!.projetoId])
    for (const row of parsed.registros) {
      const { rows } = await client.query<{ id: number }>(`INSERT INTO pagamentos
        (projeto_id,etapa_id,quantidade,unidade,descricao,fornecedor,contato_fornecedor,nome_contato_fornecedor,chave_pix,valor,status,forma_pagamento,data_pagamento,data_agendamento,data_entrega,observacao,ordem,criado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`, [req.acessoProjeto!.projetoId,row.etapa_id,row.quantidade,row.unidade,row.descricao,row.fornecedor,row.contato_fornecedor,row.nome_contato_fornecedor,row.chave_pix,row.valor,row.status,row.forma_pagamento,row.data_pagamento,row.data_agendamento,row.data_entrega,row.observacao,row.ordem,req.usuarioId])
      const paymentId = rows[0]!.id
      await syncPaymentLinks(client, paymentId, row.links_cotacao ?? [], req.usuarioId!)
      await syncPaymentDocumentLinks(client, paymentId, row.documentos ?? [], req.usuarioId!)
    }
  })
  res.status(201).json({ quantidade: parsed.total })
})

paymentsRouter.get('/:pagamentoId/documentos', requireProjectPermission('documentos.visualizar'), async (req, res) => {
  const { rows } = await query(`SELECT d.id,d.pagamento_id,d.titulo,d.categoria,d.tipo_origem,d.url,d.nome_original,d.tipo_mime,d.criado_em
    FROM documentos_projeto d JOIN pagamentos p ON p.id=d.pagamento_id
    WHERE p.id=$1 AND p.projeto_id=$2 AND d.excluido_em IS NULL ORDER BY d.criado_em DESC`, [Number(req.params.pagamentoId), req.acessoProjeto!.projetoId])
  res.json({ documentos: rows })
})

paymentsRouter.post('/:pagamentoId/documentos', requireProjectPermission('documentos.inserir'), documentUpload.single('arquivo'), async (req, res) => {
  const paymentId = Number(req.params.pagamentoId)
  const input = paymentDocumentSchema.parse(req.body)
  if (!req.file && !input.url) throw new AppError(422, 'Envie um arquivo ou informe um link.', 'FONTE_OBRIGATORIA')
  if (req.file && input.url) throw new AppError(422, 'Escolha arquivo ou link, não ambos.', 'FONTE_DUPLICADA')
  const payment = await query('SELECT 1 FROM pagamentos WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL', [paymentId, req.acessoProjeto!.projetoId])
  if (!payment.rowCount) throw new AppError(404, 'Pagamento não encontrado.', 'PAGAMENTO_NAO_ENCONTRADO')
  await query(`INSERT INTO categorias_documento (projeto_id,nome,criado_por) VALUES ($1,'Pagamentos',$2) ON CONFLICT DO NOTHING`, [req.acessoProjeto!.projetoId, req.usuarioId])
  const stored = req.file ? await saveUploadedFile(req.acessoProjeto!.projetoId, 'pagamentos', req.file) : null
  const url = input.url ? validateHttpUrl(input.url) : null
  const document = await withTransaction(async (client) => {
    const { rows } = await client.query(`INSERT INTO documentos_projeto
    (projeto_id,pagamento_id,titulo,categoria,tipo_origem,url,caminho_arquivo,nome_original,tipo_mime,criado_por)
      VALUES ($1,$2,$3,'Pagamentos',$4,$5,$6,$7,$8,$9) RETURNING *`, [req.acessoProjeto!.projetoId,paymentId,input.titulo,stored?'ARQUIVO':'LINK',url,stored?.relativePath,stored?.originalName,stored?.mimeType,req.usuarioId])
    await assignDocumentCategoryByName(client, rows[0]!.id, req.acessoProjeto!.projetoId, 'Pagamentos')
    return rows[0]!
  })
  res.status(201).json({ documento: document })
})

paymentsRouter.get('/:pagamentoId/documentos/:documentoId/arquivo', requireProjectPermission('documentos.visualizar'), async (req, res) => {
  const { rows } = await query<{ caminho_arquivo: string | null; nome_original: string | null; tipo_mime: string | null }>(`SELECT d.caminho_arquivo,d.nome_original,d.tipo_mime FROM documentos_projeto d
    JOIN pagamentos p ON p.id=d.pagamento_id WHERE d.id=$1 AND p.id=$2 AND p.projeto_id=$3 AND d.excluido_em IS NULL`, [Number(req.params.documentoId),Number(req.params.pagamentoId),req.acessoProjeto!.projetoId])
  const document = rows[0]
  if (!document?.caminho_arquivo || !document.tipo_mime) throw new AppError(404, 'Arquivo não encontrado.', 'ARQUIVO_NAO_ENCONTRADO')
  res.setHeader('Content-Type', document.tipo_mime)
  res.setHeader('Content-Disposition', `inline; filename="${safeDownloadName(document.nome_original || 'documento', document.tipo_mime)}"`)
  res.send(await readStoredFile(document.caminho_arquivo))
})

paymentsRouter.delete('/:pagamentoId/documentos/:documentoId', requireProjectPermission('documentos.excluir'), async (req, res) => {
  const { rowCount } = await query(`UPDATE documentos_projeto d SET excluido_em=NOW() FROM pagamentos p
    WHERE d.id=$1 AND p.id=d.pagamento_id AND p.id=$2 AND p.projeto_id=$3 AND d.excluido_em IS NULL`, [Number(req.params.documentoId),Number(req.params.pagamentoId),req.acessoProjeto!.projetoId])
  if (!rowCount) throw new AppError(404, 'Documento não encontrado.', 'DOCUMENTO_NAO_ENCONTRADO')
  res.status(204).end()
})
