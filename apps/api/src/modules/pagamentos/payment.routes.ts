import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { query, withTransaction } from '../../config/database.js'
import { env } from '../../config/env.js'
import { requireAuth } from '../../shared/auth.js'
import { recordAudit } from '../../shared/audit.js'
import { AppError } from '../../shared/errors.js'
import { importExample } from '../../shared/import-examples.js'
import { parseExpenseImport, applyExpenseImport } from '../despesas/expense-import.service.js'
import { expenseItemTotalSql as itemTotalSql } from '../despesas/expense-financial.js'
import { requireProjectPermission } from '../../shared/projectAccess.js'
import { readStoredFile, removeStoredFile, safeDownloadName, saveUploadedFile } from '../../shared/storage.js'
import { identifyStore, validateHttpUrl } from '../../shared/url.js'
import { validateBody } from '../../shared/validation.js'
import { assignDocumentCategoryByName } from '../arquivos/document-categories.js'
import { getSchedule } from '../etapas/schedule.service.js'
import { createExpensePdf, createExpenseWorkbook, getExpenseCrudData, getExpenseReport } from '../despesas/expense-report.service.js'
import { PAYMENT_STATUS, PAYMENT_STATUS_VALUES, type PaymentStatus } from './payment-status.js'
import { linkSchema, moveItemSchema, moveItemsSchema, paymentSchema, paymentStatusSchema, purchaseItemSchema, purchaseSchema } from './payment.schemas.js'

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

async function syncPaymentLinks(client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }, paymentId: number, links: string[], userId: number) {
  await client.query('DELETE FROM links_cotacao_pagamento WHERE pagamento_id=$1', [paymentId])
  for (const rawUrl of links) {
    const url = validateHttpUrl(rawUrl)
    await client.query('INSERT INTO links_cotacao_pagamento (pagamento_id,url,criado_por) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [paymentId,url,userId])
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
      WHERE p.projeto_id=$1 AND p.compra_id IS NULL AND p.excluido_em IS NULL
        AND ($2='' OR p.status=$2)
        AND ($3='%%' OR p.descricao ILIKE $3 OR p.fornecedor ILIKE $3)
        AND ($4::bigint IS NULL OR p.etapa_id=$4 OR e.parent_id=$4)
      GROUP BY p.id,e.id,e.nome,e.ordem,e.cor,pai.id,pai.nome,pai.ordem,pai.cor ORDER BY p.data_pagamento DESC NULLS FIRST,p.id DESC LIMIT $5 OFFSET $6`, [req.acessoProjeto!.projetoId,status,`%${search}%`,stageId,pageSize,(page-1)*pageSize]),
    query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM pagamentos p LEFT JOIN cronogramas e ON e.id=p.etapa_id WHERE p.projeto_id=$1 AND p.compra_id IS NULL AND p.excluido_em IS NULL
      AND ($2='' OR p.status=$2)
      AND ($3='%%' OR p.descricao ILIKE $3 OR p.fornecedor ILIKE $3)
      AND ($4::bigint IS NULL OR p.etapa_id=$4 OR e.parent_id=$4)`, [req.acessoProjeto!.projetoId,status,`%${search}%`,stageId]),
  ])
  res.json({ pagamentos: payments.rows, pagina: page, porPagina: pageSize, total: count.rows[0]!.total })
})

paymentsRouter.get('/relatorio.pdf', requireProjectPermission('pagamentos.exportar'), async (req, res) => {
  const projectId = req.acessoProjeto!.projetoId
  const document = createExpensePdf(projectId, await getExpenseReport(projectId,{status:String(req.query.status||''),search:String(req.query.busca||''),stageId:req.query.etapaId?z.coerce.number().int().positive().parse(req.query.etapaId):null}))
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="despesas-${projectId}.pdf"`)
  document.pipe(res)
  document.end()
})

paymentsRouter.get('/relatorio.xlsx', requireProjectPermission('pagamentos.exportar'), async (req, res) => {
  const projectId = req.acessoProjeto!.projetoId
  const content = await createExpenseWorkbook(projectId, await getExpenseReport(projectId,{status:String(req.query.status||''),search:String(req.query.busca||''),stageId:req.query.etapaId?z.coerce.number().int().positive().parse(req.query.etapaId):null}))
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="despesas-${projectId}.xlsx"`)
  res.send(Buffer.from(content))
})

paymentsRouter.get('/etapas', requireProjectPermission('pagamentos.visualizar'), async (req, res) => {
  res.json(await getSchedule(req.acessoProjeto!.projetoId))
})

paymentsRouter.get('/fornecedores', requireProjectPermission('pagamentos.visualizar'), async (req, res) => {
  const { rows } = await query(`SELECT fornecedor,MAX(nome_contato_fornecedor) AS nome_contato_fornecedor,
    MAX(contato_fornecedor) AS contato_fornecedor FROM (
      SELECT fornecedor,nome_contato_fornecedor,contato_fornecedor FROM despesas
      WHERE projeto_id=$1 AND excluido_em IS NULL AND fornecedor IS NOT NULL
      UNION ALL
      SELECT fornecedor,nome_contato_fornecedor,contato_fornecedor FROM pagamentos
      WHERE projeto_id=$1 AND excluido_em IS NULL AND fornecedor IS NOT NULL
    ) fornecedores GROUP BY fornecedor ORDER BY fornecedor`, [req.acessoProjeto!.projetoId])
  res.json({ fornecedores: rows })
})

paymentsRouter.get('/despesas', requireProjectPermission('pagamentos.visualizar'), async (req, res) => {
  const status=String(req.query.status||'')
  const search=String(req.query.busca||'').trim()
  const stageId=Number.isSafeInteger(Number(req.query.etapaId))&&Number(req.query.etapaId)>0?Number(req.query.etapaId):null
  res.json(await getExpenseCrudData(req.acessoProjeto!.projetoId,{status,search,stageId}))
})

// Kept temporarily for API consumers migrating from the former raw-query shape.
paymentsRouter.get('/despesas-legado', requireProjectPermission('pagamentos.visualizar'), async (req, res) => {
  const projectId = req.acessoProjeto!.projetoId
  const status = String(req.query.status || '')
  if (status && !PAYMENT_STATUS_VALUES.includes(status as PaymentStatus)) throw new AppError(422, 'Status de compra inválido.', 'STATUS_INVALIDO')
  const search = String(req.query.busca || '').trim()
  const stageId = Number.isSafeInteger(Number(req.query.etapaId)) && Number(req.query.etapaId) > 0 ? Number(req.query.etapaId) : null
  const itemTotal = itemTotalSql('i')
  const [purchases, orphanItems] = await Promise.all([
    query(`SELECT c.id,c.descricao,c.etapa_id,c.status,c.data_pagamento,c.forma_pagamento,c.fornecedor,
      c.nome_contato_fornecedor,c.contato_fornecedor,c.observacao,c.valor_desconto,c.numero_nota_fiscal,c.data_emissao,c.data_agendamento,c.data_entrega,c.ordem,
      CASE WHEN NULLIF(TRIM(c.numero_nota_fiscal),'') IS NULL THEN 'Orçamento' ELSE 'Nota Fiscal' END AS documento,
      CASE WHEN COALESCE(pai.id,e.id) IS NULL THEN NULL ELSE 'ETAPA '||COALESCE(pai.ordem,e.ordem)||' - '||COALESCE(pai.nome,e.nome) END AS etapa,
      COALESCE(pai.ordem,e.ordem) AS etapa_ordem,
      COALESCE(pai.cor,e.cor) AS etapa_cor,
      (COALESCE((SELECT SUM(${itemTotal}) FROM pagamentos i WHERE i.compra_id=c.id AND i.excluido_em IS NULL),0)-COALESCE(c.valor_desconto,0))::numeric(15,2) AS valor_total,
      COALESCE((SELECT JSONB_AGG(item ORDER BY item.ordem,item.id) FROM (
        SELECT i.id,i.descricao,i.quantidade,i.unidade,i.observacao,i.valor_unitario,i.valor_desconto,i.valor_total_manual,${itemTotal}::numeric(15,2) AS valor_total,i.ordem,i.documentos_legados_habilitados,
          COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT('id',lc.id,'url',lc.url,'loja',CASE
            WHEN LOWER(lc.url) LIKE '%amazon.%' THEN 'Amazon' WHEN LOWER(lc.url) LIKE '%shopee.%' THEN 'Shopee'
            WHEN LOWER(lc.url) LIKE '%mercadolivre.%' THEN 'Mercado Livre'
            ELSE REGEXP_REPLACE(SPLIT_PART(REGEXP_REPLACE(lc.url,'^https?://','','i'),'/',1),'^www\\.','','i') END) ORDER BY lc.id)
            FROM links_cotacao_pagamento lc WHERE lc.pagamento_id=i.id),'[]'::jsonb) AS links_cotacao,
          (SELECT COUNT(*)::int FROM documentos_projeto d WHERE d.pagamento_id=i.id AND d.excluido_em IS NULL) AS quantidade_documentos
        FROM pagamentos i WHERE i.compra_id=c.id AND i.excluido_em IS NULL
      ) item),'[]'::jsonb) AS itens,
      (SELECT COUNT(*)::int FROM documentos_projeto d WHERE d.compra_id=c.id AND d.excluido_em IS NULL) AS quantidade_documentos
    FROM despesas c LEFT JOIN cronogramas e ON e.id=c.etapa_id LEFT JOIN cronogramas pai ON pai.id=e.parent_id
    WHERE c.projeto_id=$1 AND c.excluido_em IS NULL AND ($2='' OR c.status=$2)
      AND ($3='%%' OR c.descricao ILIKE $3 OR c.fornecedor ILIKE $3)
      AND ($4::bigint IS NULL OR c.etapa_id=$4 OR e.parent_id=$4)
    ORDER BY CASE c.status WHEN 'PENDENTE' THEN 1 WHEN 'EM_NEGOCIACAO' THEN 2 WHEN 'PAGO_AGUARDANDO_ENTREGA' THEN 3 ELSE 4 END,c.ordem,c.id`,
    [projectId,status,`%${search}%`,stageId]),
    query(`SELECT i.id,i.descricao,i.quantidade,i.unidade,i.observacao,i.valor_unitario,i.valor_desconto,i.valor_total_manual,${itemTotal}::numeric(15,2) AS valor_total,i.ordem,i.documentos_legados_habilitados,
      i.etapa_id,i.fornecedor,i.contato_fornecedor,i.nome_contato_fornecedor,i.chave_pix,i.status,i.forma_pagamento,
      i.data_pagamento,i.data_agendamento,i.data_entrega,
      CASE WHEN COALESCE(pai.id,e.id) IS NULL THEN NULL ELSE 'ETAPA '||COALESCE(pai.ordem,e.ordem)||' - '||COALESCE(pai.nome,e.nome) END AS etapa,
      COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT('id',lc.id,'url',lc.url,'loja',CASE
        WHEN LOWER(lc.url) LIKE '%amazon.%' THEN 'Amazon' WHEN LOWER(lc.url) LIKE '%shopee.%' THEN 'Shopee'
        WHEN LOWER(lc.url) LIKE '%mercadolivre.%' THEN 'Mercado Livre'
        ELSE REGEXP_REPLACE(SPLIT_PART(REGEXP_REPLACE(lc.url,'^https?://','','i'),'/',1),'^www\\.','','i') END) ORDER BY lc.id)
        FROM links_cotacao_pagamento lc WHERE lc.pagamento_id=i.id),'[]'::jsonb) AS links_cotacao,
      (SELECT COUNT(*)::int FROM documentos_projeto d WHERE d.pagamento_id=i.id AND d.excluido_em IS NULL) AS quantidade_documentos
    FROM pagamentos i LEFT JOIN cronogramas e ON e.id=i.etapa_id LEFT JOIN cronogramas pai ON pai.id=e.parent_id
    WHERE i.projeto_id=$1 AND i.compra_id IS NULL AND i.excluido_em IS NULL ORDER BY i.ordem,i.id`, [projectId]),
  ])
  res.json({ despesas: purchases.rows, itens_orfaos: orphanItems.rows, total: purchases.rowCount })
})

paymentsRouter.post('/despesas', requireProjectPermission('pagamentos.inserir'), validateBody(purchaseSchema), async (req, res) => {
  const projectId = req.acessoProjeto!.projetoId
  await ensureStage(projectId, req.body.etapa_id)
  const purchase = await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: number }>(`INSERT INTO despesas
      (projeto_id,descricao,etapa_id,status,data_pagamento,forma_pagamento,fornecedor,nome_contato_fornecedor,
       contato_fornecedor,observacao,valor_desconto,numero_nota_fiscal,data_emissao,data_agendamento,data_entrega,ordem,criado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`, [projectId,req.body.descricao,
      req.body.etapa_id,req.body.status,req.body.data_pagamento,req.body.forma_pagamento,req.body.fornecedor,
      req.body.nome_contato_fornecedor,req.body.contato_fornecedor,req.body.observacao,req.body.valor_desconto,req.body.numero_nota_fiscal,req.body.data_emissao,
      req.body.data_agendamento,req.body.data_entrega,req.body.ordem,req.usuarioId])
    await recordAudit(client,{projetoId:projectId,usuarioId:req.usuarioId!,acao:'COMPRA_CRIADA',entidade:'compras',registroId:rows[0]!.id,dadosNovos:req.body,enderecoIp:req.ip})
    return rows[0]
  })
  res.status(201).json({ despesa: purchase })
})

paymentsRouter.put('/despesas/:compraId', requireProjectPermission('pagamentos.atualizar'), validateBody(purchaseSchema), async (req, res) => {
  const projectId = req.acessoProjeto!.projetoId;const purchaseId=Number(req.params.compraId)
  await ensureStage(projectId, req.body.etapa_id)
  await withTransaction(async (client) => {
    const before=await client.query('SELECT * FROM despesas WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL FOR UPDATE',[purchaseId,projectId])
    if(!before.rows[0])throw new AppError(404,'Compra não encontrada.','COMPRA_NAO_ENCONTRADA')
    await client.query(`UPDATE despesas SET descricao=$3,etapa_id=$4,status=$5,data_pagamento=$6,forma_pagamento=$7,fornecedor=$8,
      nome_contato_fornecedor=$9,contato_fornecedor=$10,observacao=$11,valor_desconto=$12,numero_nota_fiscal=$13,data_emissao=$14,data_agendamento=$15,
      data_entrega=$16,ordem=$17 WHERE id=$1 AND projeto_id=$2`,[purchaseId,projectId,req.body.descricao,req.body.etapa_id,
      req.body.status,req.body.data_pagamento,req.body.forma_pagamento,req.body.fornecedor,req.body.nome_contato_fornecedor,
      req.body.contato_fornecedor,req.body.observacao,req.body.valor_desconto,req.body.numero_nota_fiscal,req.body.data_emissao,req.body.data_agendamento,req.body.data_entrega,req.body.ordem])
    await recordAudit(client,{projetoId:projectId,usuarioId:req.usuarioId!,acao:'COMPRA_ATUALIZADA',entidade:'compras',registroId:purchaseId,dadosAnteriores:before.rows[0],dadosNovos:req.body,enderecoIp:req.ip})
  })
  res.status(204).end()
})

paymentsRouter.patch('/despesas/:compraId/status', requireProjectPermission('pagamentos.atualizar'), validateBody(paymentStatusSchema), async (req,res)=>{
  const projectId=req.acessoProjeto!.projetoId;const purchaseId=Number(req.params.compraId)
  const purchase=await query<{data_pagamento:string|null}>('SELECT data_pagamento FROM despesas WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL',[purchaseId,projectId])
  if(!purchase.rows[0])throw new AppError(404,'Compra não encontrada.','COMPRA_NAO_ENCONTRADA')
  if([PAYMENT_STATUS.PAGO_AGUARDANDO_ENTREGA,PAYMENT_STATUS.CONCLUIDO].includes(req.body.status)&&!purchase.rows[0].data_pagamento)throw new AppError(422,'Informe a data do pagamento antes de alterar para Pago - Aguardando Entrega ou Concluído.','DATA_PAGAMENTO_OBRIGATORIA')
  await query('UPDATE despesas SET status=$3 WHERE id=$1 AND projeto_id=$2',[purchaseId,projectId,req.body.status])
  res.status(204).end()
})

paymentsRouter.delete('/despesas/:compraId', requireProjectPermission('pagamentos.excluir'), async (req,res)=>{
  const projectId=req.acessoProjeto!.projetoId;const purchaseId=Number(req.params.compraId)
  await withTransaction(async(client)=>{const result=await client.query('UPDATE despesas SET excluido_em=NOW() WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL',[purchaseId,projectId]);if(!result.rowCount)throw new AppError(404,'Despesa não encontrada.','DESPESA_NAO_ENCONTRADA');await client.query('UPDATE pagamentos SET compra_id=NULL WHERE compra_id=$1 AND excluido_em IS NULL',[purchaseId]);await recordAudit(client,{projetoId:projectId,usuarioId:req.usuarioId!,acao:'DESPESA_EXCLUIDA',entidade:'despesas',registroId:purchaseId,enderecoIp:req.ip})})
  res.status(204).end()
})

paymentsRouter.post('/despesas/:compraId/itens', requireProjectPermission('pagamentos.inserir'), validateBody(purchaseItemSchema), async(req,res)=>{
  const projectId=req.acessoProjeto!.projetoId;const purchaseId=Number(req.params.compraId)
  const item=await withTransaction(async(client)=>{const parent=await client.query('SELECT 1 FROM despesas WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL FOR UPDATE',[purchaseId,projectId]);if(!parent.rowCount)throw new AppError(404,'Despesa não encontrada.','DESPESA_NAO_ENCONTRADA');const manualTotal=req.body.valor_total!==null;const total=manualTotal?req.body.valor_total:req.body.valor_unitario===null?null:Number((Number(req.body.quantidade||1)*Number(req.body.valor_unitario)-Number(req.body.valor_desconto||0)).toFixed(2));const {rows}=await client.query<{id:number}>(`INSERT INTO pagamentos
    (projeto_id,compra_id,descricao,quantidade,unidade,observacao,valor_unitario,valor_desconto,valor,valor_total_manual,status,ordem,criado_por)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDENTE',$11,$12) RETURNING id`,[projectId,purchaseId,req.body.descricao,req.body.quantidade,req.body.unidade,req.body.observacao,req.body.valor_unitario,req.body.valor_desconto,total,manualTotal,req.body.ordem,req.usuarioId]);await syncPaymentLinks(client,rows[0]!.id,req.body.links_cotacao||[],req.usuarioId!);await recordAudit(client,{projetoId:projectId,usuarioId:req.usuarioId!,acao:'ITEM_COMPRA_CRIADO',entidade:'pagamentos',registroId:rows[0]!.id,dadosNovos:req.body,enderecoIp:req.ip});return rows[0]})
  res.status(201).json({item})
})

paymentsRouter.put('/itens/:itemId', requireProjectPermission('pagamentos.atualizar'), validateBody(purchaseItemSchema), async(req,res)=>{
  const projectId=req.acessoProjeto!.projetoId;const itemId=Number(req.params.itemId)
  await withTransaction(async(client)=>{const before=await client.query('SELECT * FROM pagamentos WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL FOR UPDATE',[itemId,projectId]);if(!before.rows[0])throw new AppError(404,'Item não encontrado.','ITEM_NAO_ENCONTRADO');const manualTotal=req.body.valor_total!==null;const total=manualTotal?req.body.valor_total:req.body.valor_unitario===null?null:Number((Number(req.body.quantidade||1)*Number(req.body.valor_unitario)-Number(req.body.valor_desconto||0)).toFixed(2));await client.query(`UPDATE pagamentos SET descricao=$3,quantidade=$4,unidade=$5,observacao=$6,valor_unitario=$7,valor_desconto=$8,valor=$9,valor_total_manual=$10,ordem=$11 WHERE id=$1 AND projeto_id=$2`,[itemId,projectId,req.body.descricao,req.body.quantidade,req.body.unidade,req.body.observacao,req.body.valor_unitario,req.body.valor_desconto,total,manualTotal,req.body.ordem]);if(req.body.links_cotacao)await syncPaymentLinks(client,itemId,req.body.links_cotacao,req.usuarioId!);await recordAudit(client,{projetoId:projectId,usuarioId:req.usuarioId!,acao:'ITEM_COMPRA_ATUALIZADO',entidade:'pagamentos',registroId:itemId,dadosAnteriores:before.rows[0],dadosNovos:req.body,enderecoIp:req.ip})})
  res.status(204).end()
})

paymentsRouter.delete('/itens/:itemId', requireProjectPermission('pagamentos.excluir'), async(req,res)=>{const {rowCount}=await query('UPDATE pagamentos SET excluido_em=NOW() WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL',[Number(req.params.itemId),req.acessoProjeto!.projetoId]);if(!rowCount)throw new AppError(404,'Item não encontrado.','ITEM_NAO_ENCONTRADO');res.status(204).end()})

paymentsRouter.post('/itens/:itemId/mover', requireProjectPermission('pagamentos.atualizar'), validateBody(moveItemSchema), async(req,res)=>{
  const projectId=req.acessoProjeto!.projetoId;const itemId=Number(req.params.itemId)
  await withTransaction(async(client)=>{
    const parent=await client.query('SELECT 1 FROM despesas WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL FOR UPDATE',[req.body.despesa_id,projectId])
    if(!parent.rowCount)throw new AppError(404,'Compra de destino não encontrada.','COMPRA_NAO_ENCONTRADA')
    const item=await client.query('SELECT compra_id FROM pagamentos WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL FOR UPDATE',[itemId,projectId])
    if(!item.rowCount)throw new AppError(404,'Item não encontrado.','ITEM_NAO_ENCONTRADO')
    await client.query('UPDATE pagamentos SET compra_id=$3 WHERE id=$1 AND projeto_id=$2',[itemId,projectId,req.body.despesa_id])
    await recordAudit(client,{projetoId:projectId,usuarioId:req.usuarioId!,acao:'ITEM_DESPESA_MOVIDO',entidade:'pagamentos',registroId:itemId,dadosAnteriores:{compra_id:item.rows[0]!.compra_id},dadosNovos:{compra_id:req.body.despesa_id},enderecoIp:req.ip})
  })
  res.status(204).end()
})

paymentsRouter.post('/itens/mover', requireProjectPermission('pagamentos.atualizar'), validateBody(moveItemsSchema), async(req,res)=>{
  const projectId=req.acessoProjeto!.projetoId
  const moved=await withTransaction(async(client)=>{const parent=await client.query('SELECT 1 FROM despesas WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL FOR UPDATE',[req.body.despesa_id,projectId]);if(!parent.rowCount)throw new AppError(404,'Despesa de destino não encontrada.','DESPESA_NAO_ENCONTRADA');const result=await client.query(`UPDATE pagamentos SET compra_id=$1 WHERE projeto_id=$2 AND id=ANY($3::bigint[]) AND compra_id IS NULL AND excluido_em IS NULL`,[req.body.despesa_id,projectId,req.body.item_ids]);if(result.rowCount!==req.body.item_ids.length)throw new AppError(409,'Um ou mais itens já foram movidos ou não estão disponíveis.','ITENS_INDISPONIVEIS');return result.rowCount})
  res.json({quantidade:moved})
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
    await recordAudit(client, { projetoId: req.acessoProjeto!.projetoId, usuarioId: req.usuarioId!, acao: 'PAGAMENTO_CRIADO', entidade: 'pagamentos', registroId: id, dadosNovos: req.body, enderecoIp: req.ip })
    return { id }
  })
  res.status(201).json({ pagamento: payment })
})

paymentsRouter.put('/:pagamentoId', requireProjectPermission('pagamentos.atualizar'), validateBody(paymentSchema), async (req, res) => {
  const paymentId = Number(req.params.pagamentoId)
  await ensureStage(req.acessoProjeto!.projetoId, req.body.etapa_id)
  await withTransaction(async (client) => {
    const before = await client.query('SELECT * FROM pagamentos WHERE id=$1 AND projeto_id=$2 AND compra_id IS NULL AND excluido_em IS NULL FOR UPDATE', [paymentId, req.acessoProjeto!.projetoId])
    if (!before.rows[0]) throw new AppError(404, 'Pagamento não encontrado.', 'PAGAMENTO_NAO_ENCONTRADO')
    await client.query(`UPDATE pagamentos SET etapa_id=$3,quantidade=$4,unidade=$5,descricao=$6,fornecedor=$7,contato_fornecedor=$8,nome_contato_fornecedor=$9,chave_pix=$10,
      valor=$11,status=$12,forma_pagamento=$13,data_pagamento=$14,data_agendamento=$15,data_entrega=$16,observacao=$17,ordem=$18
      WHERE id=$1 AND projeto_id=$2 AND compra_id IS NULL`, [paymentId,req.acessoProjeto!.projetoId,req.body.etapa_id,req.body.quantidade,req.body.unidade,req.body.descricao,
      req.body.fornecedor,req.body.contato_fornecedor,req.body.nome_contato_fornecedor,req.body.chave_pix,req.body.valor,req.body.status,req.body.forma_pagamento,req.body.data_pagamento,req.body.data_agendamento,
      req.body.data_entrega,req.body.observacao,req.body.ordem])
    if (req.body.links_cotacao) await syncPaymentLinks(client, paymentId, req.body.links_cotacao, req.usuarioId!)
    await recordAudit(client, { projetoId: req.acessoProjeto!.projetoId, usuarioId: req.usuarioId!, acao: 'PAGAMENTO_ATUALIZADO', entidade: 'pagamentos', registroId: paymentId, dadosAnteriores: before.rows[0], dadosNovos: req.body, enderecoIp: req.ip })
  })
  res.status(204).end()
})

paymentsRouter.patch('/:pagamentoId/status', requireProjectPermission('pagamentos.atualizar'), validateBody(paymentStatusSchema), async (req, res) => {
  const paymentId = Number(req.params.pagamentoId)
  const payment = await withTransaction(async (client) => {
    const before = await client.query<{ status: PaymentStatus; data_pagamento: string | null }>('SELECT status,data_pagamento FROM pagamentos WHERE id=$1 AND projeto_id=$2 AND compra_id IS NULL AND excluido_em IS NULL FOR UPDATE', [paymentId,req.acessoProjeto!.projetoId])
    if (!before.rows[0]) throw new AppError(404, 'Pagamento não encontrado.', 'PAGAMENTO_NAO_ENCONTRADO')
    if (req.body.status === 'PAGO_AGUARDANDO_ENTREGA' && !before.rows[0].data_pagamento) throw new AppError(422, 'Informe a data do pagamento antes de usar o status Pago - Aguardando Entrega.', 'DATA_PAGAMENTO_OBRIGATORIA')
    const { rows } = await client.query<{ id: number; status: PaymentStatus }>('UPDATE pagamentos SET status=$3 WHERE id=$1 AND projeto_id=$2 AND compra_id IS NULL RETURNING id,status', [paymentId,req.acessoProjeto!.projetoId,req.body.status])
    await recordAudit(client, { projetoId: req.acessoProjeto!.projetoId, usuarioId: req.usuarioId!, acao: 'STATUS_PAGAMENTO_ATUALIZADO', entidade: 'pagamentos', registroId: paymentId, dadosAnteriores: before.rows[0], dadosNovos: rows[0], enderecoIp: req.ip })
    return rows[0]
  })
  res.json({ pagamento: payment })
})

paymentsRouter.delete('/:pagamentoId', requireProjectPermission('pagamentos.excluir'), async (req, res) => {
  const paymentId = Number(req.params.pagamentoId)
  await withTransaction(async (client) => {
    const { rowCount } = await client.query('UPDATE pagamentos SET excluido_em=NOW() WHERE id=$1 AND projeto_id=$2 AND compra_id IS NULL AND excluido_em IS NULL', [paymentId, req.acessoProjeto!.projetoId])
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

paymentsRouter.get('/importacao/modelo', requireProjectPermission('pagamentos.inserir'), (req,res)=>{
  const format=z.enum(['TSV','JSON']).parse(req.query.formato||'JSON')
  res.type(format==='JSON'?'application/json':'text/tab-separated-values').attachment(`despesas.${format.toLowerCase()}`).send(importExample('despesas',format))
})

paymentsRouter.post('/importacao/preview', requireProjectPermission('pagamentos.inserir'), validateBody(paymentImportSchema), async(req,res)=>{
  res.json(parseExpenseImport(req.body.formato,req.body.conteudo))
})

paymentsRouter.post('/importacao/confirmar', requireProjectPermission('pagamentos.inserir'), validateBody(paymentImportSchema.required({modo:true})), async(req,res)=>{
  const parsed=parseExpenseImport(req.body.formato,req.body.conteudo)
  if(parsed.erros.length)throw new AppError(422,'Corrija os campos indicados antes de importar.','IMPORTACAO_INVALIDA',parsed.erros)
  if(parsed.registros.some(row=>row.tipo==='DOCUMENTO')&&!req.acessoProjeto!.proprietario&&!req.acessoProjeto!.administradorSistema&&!req.acessoProjeto!.permissoes.has('documentos.inserir'))throw new AppError(403,'Você não possui permissão para importar documentos.','ACESSO_NEGADO')
  if(req.body.modo==='SUBSTITUIR'&&!req.acessoProjeto!.proprietario&&!req.acessoProjeto!.administradorSistema&&(!req.acessoProjeto!.permissoes.has('pagamentos.excluir')||!req.acessoProjeto!.permissoes.has('documentos.excluir')))throw new AppError(403,'A substituição exige permissão para excluir despesas e documentos.','ACESSO_NEGADO')
  const counts=await withTransaction(async client=>{
    const counts=await applyExpenseImport(client,req.acessoProjeto!.projetoId,req.usuarioId!,parsed.registros,req.body.modo)
    await recordAudit(client,{projetoId:req.acessoProjeto!.projetoId,usuarioId:req.usuarioId!,acao:'DESPESAS_IMPORTADAS',entidade:'despesas',dadosNovos:counts,enderecoIp:req.ip})
    return counts
  })
  res.status(201).json({quantidade:parsed.total,...counts})
})

paymentsRouter.get('/despesas/:compraId/documentos', requireProjectPermission('documentos.visualizar'), async(req,res)=>{
  const {rows}=await query(`SELECT d.id,d.compra_id,d.titulo,d.categoria,d.tipo_origem,d.url,d.nome_original,d.tipo_mime,d.criado_em
    FROM documentos_projeto d JOIN despesas c ON c.id=d.compra_id
    WHERE c.id=$1 AND c.projeto_id=$2 AND c.excluido_em IS NULL AND d.excluido_em IS NULL ORDER BY d.criado_em DESC`,[Number(req.params.compraId),req.acessoProjeto!.projetoId])
  res.json({documentos:rows})
})

paymentsRouter.post('/despesas/:compraId/documentos', requireProjectPermission('documentos.inserir'), documentUpload.single('arquivo'), async(req,res)=>{
  const purchaseId=Number(req.params.compraId);const projectId=req.acessoProjeto!.projetoId;const input=paymentDocumentSchema.parse(req.body)
  if(!req.file&&!input.url)throw new AppError(422,'Envie um arquivo ou informe um link.','FONTE_OBRIGATORIA')
  if(req.file&&input.url)throw new AppError(422,'Escolha arquivo ou link, não ambos.','FONTE_DUPLICADA')
  const purchase=await query('SELECT 1 FROM despesas WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL',[purchaseId,projectId])
  if(!purchase.rowCount)throw new AppError(404,'Compra não encontrada.','COMPRA_NAO_ENCONTRADA')
  await query(`INSERT INTO categorias_documento (projeto_id,nome,criado_por) VALUES ($1,'Despesas',$2) ON CONFLICT DO NOTHING`,[projectId,req.usuarioId])
  const stored=req.file?await saveUploadedFile(projectId,'compras',req.file):null;const url=input.url?validateHttpUrl(input.url):null
  try {
    const document=await withTransaction(async(client)=>{const {rows}=await client.query(`INSERT INTO documentos_projeto
      (projeto_id,compra_id,titulo,categoria,tipo_origem,url,caminho_arquivo,nome_original,tipo_mime,criado_por)
      VALUES ($1,$2,$3,'Despesas',$4,$5,$6,$7,$8,$9) RETURNING *`,[projectId,purchaseId,input.titulo,stored?'ARQUIVO':'LINK',url,stored?.relativePath,stored?.originalName,stored?.mimeType,req.usuarioId]);await assignDocumentCategoryByName(client,rows[0]!.id,projectId,'Despesas');return rows[0]!})
    res.status(201).json({documento:document})
  } catch(error) {
    await removeStoredFile(stored?.relativePath||null)
    throw error
  }
})

paymentsRouter.get('/despesas/:compraId/documentos/:documentoId/arquivo', requireProjectPermission('documentos.visualizar'), async(req,res)=>{
  const {rows}=await query<{caminho_arquivo:string|null;nome_original:string|null;tipo_mime:string|null}>(`SELECT d.caminho_arquivo,d.nome_original,d.tipo_mime FROM documentos_projeto d JOIN despesas c ON c.id=d.compra_id
    WHERE d.id=$1 AND c.id=$2 AND c.projeto_id=$3 AND c.excluido_em IS NULL AND d.excluido_em IS NULL`,[Number(req.params.documentoId),Number(req.params.compraId),req.acessoProjeto!.projetoId]);const document=rows[0];if(!document?.caminho_arquivo||!document.tipo_mime)throw new AppError(404,'Arquivo não encontrado.','ARQUIVO_NAO_ENCONTRADO');res.setHeader('Content-Type',document.tipo_mime);res.setHeader('Content-Disposition',`inline; filename="${safeDownloadName(document.nome_original||'documento',document.tipo_mime)}"`);res.send(await readStoredFile(document.caminho_arquivo))
})

paymentsRouter.delete('/despesas/:compraId/documentos/:documentoId', requireProjectPermission('documentos.excluir'), async(req,res)=>{const {rowCount}=await query(`UPDATE documentos_projeto d SET excluido_em=NOW() FROM despesas c WHERE d.id=$1 AND c.id=d.compra_id AND c.id=$2 AND c.projeto_id=$3 AND d.excluido_em IS NULL`,[Number(req.params.documentoId),Number(req.params.compraId),req.acessoProjeto!.projetoId]);if(!rowCount)throw new AppError(404,'Documento não encontrado.','DOCUMENTO_NAO_ENCONTRADO');res.status(204).end()})

paymentsRouter.get('/:pagamentoId/documentos', requireProjectPermission('documentos.visualizar'), async (req, res) => {
  const paymentId=Number(req.params.pagamentoId)
  const [documents,item] = await Promise.all([query(`SELECT d.id,d.pagamento_id,d.titulo,d.categoria,d.tipo_origem,d.url,d.nome_original,d.tipo_mime,d.criado_em
    FROM documentos_projeto d JOIN pagamentos p ON p.id=d.pagamento_id
    WHERE p.id=$1 AND p.projeto_id=$2 AND d.excluido_em IS NULL ORDER BY d.criado_em DESC`, [paymentId, req.acessoProjeto!.projetoId]),
  query<{documentos_legados_habilitados:boolean}>('SELECT documentos_legados_habilitados FROM pagamentos WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL',[paymentId,req.acessoProjeto!.projetoId])])
  res.json({ documentos: documents.rows, documentos_legados_habilitados:item.rows[0]?.documentos_legados_habilitados??false })
})

paymentsRouter.post('/:pagamentoId/documentos', requireProjectPermission('documentos.inserir'), documentUpload.single('arquivo'), async (req, res) => {
  const paymentId = Number(req.params.pagamentoId)
  const input = paymentDocumentSchema.parse(req.body)
  if (!req.file && !input.url) throw new AppError(422, 'Envie um arquivo ou informe um link.', 'FONTE_OBRIGATORIA')
  if (req.file && input.url) throw new AppError(422, 'Escolha arquivo ou link, não ambos.', 'FONTE_DUPLICADA')
  const payment = await query<{ documentos_legados_habilitados: boolean }>('SELECT documentos_legados_habilitados FROM pagamentos WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL', [paymentId, req.acessoProjeto!.projetoId])
  if (!payment.rows[0]) throw new AppError(404, 'Pagamento não encontrado.', 'PAGAMENTO_NAO_ENCONTRADO')
  if (!payment.rows[0].documentos_legados_habilitados) throw new AppError(409, 'Documentos de itens novos devem ser vinculados à Compra.', 'DOCUMENTO_DEVE_PERTENCER_COMPRA')
  await query(`INSERT INTO categorias_documento (projeto_id,nome,criado_por) VALUES ($1,'Despesas',$2) ON CONFLICT DO NOTHING`, [req.acessoProjeto!.projetoId, req.usuarioId])
  const stored = req.file ? await saveUploadedFile(req.acessoProjeto!.projetoId, 'pagamentos', req.file) : null
  const url = input.url ? validateHttpUrl(input.url) : null
  const document = await withTransaction(async (client) => {
    const { rows } = await client.query(`INSERT INTO documentos_projeto
    (projeto_id,pagamento_id,titulo,categoria,tipo_origem,url,caminho_arquivo,nome_original,tipo_mime,criado_por)
      VALUES ($1,$2,$3,'Despesas',$4,$5,$6,$7,$8,$9) RETURNING *`, [req.acessoProjeto!.projetoId,paymentId,input.titulo,stored?'ARQUIVO':'LINK',url,stored?.relativePath,stored?.originalName,stored?.mimeType,req.usuarioId])
    await assignDocumentCategoryByName(client, rows[0]!.id, req.acessoProjeto!.projetoId, 'Despesas')
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
