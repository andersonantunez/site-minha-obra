import { createHash } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '../../config/database.js'
import { requireAuth } from '../../shared/auth.js'
import { recordAudit } from '../../shared/audit.js'
import { AppError } from '../../shared/errors.js'
import { parseBrazilianNumber, parseImportContent } from '../../shared/importParser.js'
import { requireProjectPermission } from '../../shared/projectAccess.js'
import { validateBody } from '../../shared/validation.js'
import { SETTLED_PAYMENT_STATUSES } from '../pagamentos/payment-status.js'
import { createCashFlowPdf, createCashFlowWorkbook, getCashFlowReport } from '../relatorios/planning-report.service.js'
import { cashFlowCte, cashFlowFilter } from './cash-flow.query.js'

function normalizeDate(value: unknown) {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  const month = trimmed.match(/^(\d{4})-(\d{2})$/)
  if (month) return `${month[1]}-${month[2]}-01`
  const brazilian = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!brazilian) return trimmed
  const [, day, monthNumber, year] = brazilian
  const date = new Date(Date.UTC(Number(year), Number(monthNumber) - 1, Number(day)))
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(monthNumber) - 1 || date.getUTCDate() !== Number(day)) return value
  return `${year}-${monthNumber}-${day}`
}

const cashFlowSchema = z.object({
  data: z.preprocess(normalizeDate, z.iso.date()),
  descricao: z.string().trim().min(2).max(240),
  detalhes: z.string().trim().max(4_000).optional().nullable().transform((value) => value || null),
  valor: z.preprocess(parseBrazilianNumber, z.coerce.number().min(-999_999_999_999.99).max(999_999_999_999.99)),
})

const importSchema = z.object({
  formato: z.enum(['TSV', 'JSON']), conteudo: z.string().min(2), modo: z.enum(['ACRESCENTAR', 'SUBSTITUIR']).optional(), nomeArquivo: z.string().max(255).optional(),
})

async function parseEntries(format: 'TSV' | 'JSON', content: string) {
  const raw = parseImportContent(format, content)
  const valid: z.infer<typeof cashFlowSchema>[] = []
  const errors: { linha: number; erros: string[] }[] = []
  for (let index = 0; index < raw.length; index += 1) {
    const source = raw[index] as Record<string, unknown>
    const result = cashFlowSchema.safeParse({
      data: source?.data ?? source?.data_lancamento ?? source?.competencia,
      descricao: source?.descricao,
      detalhes: source?.detalhes ?? source?.observacao ?? source?.observacoes,
      valor: source?.valor,
    })
    if (result.success) valid.push(result.data)
    else errors.push({ linha: index + 2, erros: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) })
  }
  return { registros: valid, erros: errors, total: raw.length }
}

export const budgetRouter = Router({ mergeParams: true })
budgetRouter.use(requireAuth)

budgetRouter.get('/', requireProjectPermission('orcamento.visualizar'), async (req, res) => {
  const page = Math.max(1, Number(req.query.pagina) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(req.query.porPagina) || 25))
  const search = String(req.query.busca || '').trim()
  const start = req.query.dataInicio ? z.iso.date().parse(String(req.query.dataInicio)) : null
  const end = req.query.dataFim ? z.iso.date().parse(String(req.query.dataFim)) : null
  const includeFuture = String(req.query.incluirFuturos || 'false') === 'true'
  if (start && end && end < start) throw new AppError(422, 'A data final não pode ser anterior à data inicial.', 'PERIODO_INVALIDO')
  const params = [req.acessoProjeto!.projetoId,SETTLED_PAYMENT_STATUSES,`%${search}%`,start,end,includeFuture]
  const [items, totals] = await Promise.all([
      query(`${cashFlowCte} SELECT id,origem,payment_record_type,origem_id,data,descricao,detalhes,quantidade,unidade,fornecedor,payment_status,data_agendamento,data_entrega,forma_pagamento,chave_pix,contato_fornecedor,nome_contato_fornecedor,payment_etapa,payment_observacao,valor,editavel,(data>CURRENT_DATE) AS provisionado
      FROM fluxo ${cashFlowFilter} ORDER BY data DESC,origem_id DESC LIMIT $7 OFFSET $8`, [...params,pageSize,(page-1)*pageSize]),
    query<{ total: number; total_entrada: string; total_saida: string; saldo_atual: string; saldo_com_provisao: string }>(`${cashFlowCte}
      SELECT COUNT(*)::int AS total,
        COALESCE(SUM(valor) FILTER (WHERE valor>0),0)::numeric(15,2) AS total_entrada,
        COALESCE(ABS(SUM(valor) FILTER (WHERE valor<0)),0)::numeric(15,2) AS total_saida,
        COALESCE(SUM(valor) FILTER (WHERE data<=CURRENT_DATE),0)::numeric(15,2) AS saldo_atual,
        COALESCE(SUM(valor),0)::numeric(15,2) AS saldo_com_provisao
      FROM fluxo ${cashFlowFilter}`, params),
  ])
  const summary = totals.rows[0]!
  res.json({ itens: items.rows, pagina: page, porPagina: pageSize, total: summary.total, indicadores: summary })
})

budgetRouter.get('/despesas/:despesaId/detalhes', requireProjectPermission('orcamento.visualizar'), async (req, res) => {
  const projetoId = req.acessoProjeto!.projetoId
  const despesaId = z.coerce.number().int().positive().parse(req.params.despesaId)
  const { rows } = await query(`SELECT d.id,d.descricao,d.status,d.forma_pagamento,d.nome_contato_fornecedor,d.contato_fornecedor,
      d.numero_nota_fiscal,d.data_emissao,d.data_agendamento,d.data_entrega,d.observacao,
      CASE WHEN COALESCE(pai.id,e.id) IS NULL THEN NULL ELSE 'ETAPA '||COALESCE(pai.ordem,e.ordem)||' - '||COALESCE(pai.nome,e.nome) END AS etapa
    FROM despesas d
    LEFT JOIN cronogramas e ON e.id=d.etapa_id
    LEFT JOIN cronogramas pai ON pai.id=e.parent_id
    WHERE d.id=$1 AND d.projeto_id=$2 AND d.excluido_em IS NULL`, [despesaId, projetoId])
  const despesa = rows[0]
  if (!despesa) throw new AppError(404, 'Despesa não encontrada.', 'DESPESA_NAO_ENCONTRADA')
  const itemTotal = `CASE WHEN i.valor_total_manual THEN i.valor WHEN i.valor_unitario IS NULL THEN i.valor ELSE ROUND((COALESCE(i.quantidade,1)*i.valor_unitario)-COALESCE(i.valor_desconto,0),2) END`
  const [itens, documentos] = await Promise.all([
    query(`SELECT i.id,i.descricao,i.quantidade,i.unidade,i.observacao,i.valor_unitario,i.valor_desconto,${itemTotal}::numeric(15,2) AS valor_total
      FROM pagamentos i WHERE i.compra_id=$1 AND i.projeto_id=$2 AND i.excluido_em IS NULL ORDER BY i.ordem,i.id`, [despesaId, projetoId]),
    query(`SELECT id,titulo,tipo_origem,url,nome_original,tipo_mime FROM documentos_projeto
      WHERE compra_id=$1 AND projeto_id=$2 AND excluido_em IS NULL ORDER BY criado_em DESC`, [despesaId, projetoId]),
  ])
  res.json({ despesa: { ...despesa, itens: itens.rows, documentos: documentos.rows } })
})

function reportFilters(req: { query: Record<string,unknown> }) {
  return { search:String(req.query.busca||'').trim(),start:req.query.dataInicio?String(req.query.dataInicio):null,end:req.query.dataFim?String(req.query.dataFim):null,includeFuture:String(req.query.incluirFuturos||'false')==='true' }
}

budgetRouter.get('/relatorio.pdf', requireProjectPermission('orcamento.exportar'), async (req,res)=>{const report=await getCashFlowReport(req.acessoProjeto!.projetoId,reportFilters(req));const document=createCashFlowPdf(report);res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`inline; filename="fluxo-caixa-${req.acessoProjeto!.projetoId}.pdf"`);document.pipe(res);document.end()})
budgetRouter.get('/relatorio.xlsx', requireProjectPermission('orcamento.exportar'), async (req,res)=>{const report=await getCashFlowReport(req.acessoProjeto!.projetoId,reportFilters(req));const content=await createCashFlowWorkbook(report);res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition',`attachment; filename="fluxo-caixa-${req.acessoProjeto!.projetoId}.xlsx"`);res.send(Buffer.from(content))})

budgetRouter.post('/', requireProjectPermission('orcamento.inserir'), validateBody(cashFlowSchema), async (req, res) => {
  const { rows } = await query(`INSERT INTO itens_orcamento (projeto_id,competencia,ordem,descricao,observacao,valor,criado_por)
    VALUES ($1,$2,0,$3,$4,$5,$6) RETURNING *`, [req.acessoProjeto!.projetoId,req.body.data,req.body.descricao,req.body.detalhes,req.body.valor,req.usuarioId])
  res.status(201).json({ item: rows[0] })
})

budgetRouter.put('/:itemId', requireProjectPermission('orcamento.atualizar'), validateBody(cashFlowSchema), async (req, res) => {
  const { rows } = await query(`UPDATE itens_orcamento SET competencia=$3,descricao=$4,observacao=$5,valor=$6
    WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL RETURNING *`, [Number(req.params.itemId),req.acessoProjeto!.projetoId,req.body.data,req.body.descricao,req.body.detalhes,req.body.valor])
  if (!rows[0]) throw new AppError(404, 'Lançamento não encontrado.', 'LANCAMENTO_NAO_ENCONTRADO')
  res.json({ item: rows[0] })
})

budgetRouter.delete('/:itemId', requireProjectPermission('orcamento.excluir'), async (req, res) => {
  const { rowCount } = await query('UPDATE itens_orcamento SET excluido_em=NOW() WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL', [Number(req.params.itemId),req.acessoProjeto!.projetoId])
  if (!rowCount) throw new AppError(404, 'Lançamento não encontrado.', 'LANCAMENTO_NAO_ENCONTRADO')
  res.status(204).end()
})

budgetRouter.post('/importacao/preview', requireProjectPermission('orcamento.inserir'), validateBody(importSchema), async (req, res) => {
  res.json(await parseEntries(req.body.formato, req.body.conteudo))
})

budgetRouter.post('/importacao/confirmar', requireProjectPermission('orcamento.inserir'), validateBody(importSchema.required({ modo: true })), async (req, res) => {
  const parsed = await parseEntries(req.body.formato, req.body.conteudo)
  if (parsed.erros.length) throw new AppError(422, 'A importação possui erros e não foi aplicada.', 'IMPORTACAO_INVALIDA', parsed.erros)
  const id = await withTransaction(async (client) => {
    if (req.body.modo === 'SUBSTITUIR') await client.query('UPDATE itens_orcamento SET excluido_em=NOW() WHERE projeto_id=$1 AND excluido_em IS NULL', [req.acessoProjeto!.projetoId])
    for (const row of parsed.registros) await client.query(`INSERT INTO itens_orcamento
      (projeto_id,competencia,ordem,descricao,observacao,valor,criado_por) VALUES ($1,$2,0,$3,$4,$5,$6)`, [req.acessoProjeto!.projetoId,row.data,row.descricao,row.detalhes,row.valor,req.usuarioId])
    const { rows } = await client.query<{ id: number }>(`INSERT INTO importacoes
      (projeto_id,entidade,formato,modo,nome_arquivo,hash_arquivo,quantidade_linhas,status,criado_por,concluido_em)
      VALUES ($1,'FLUXO_CAIXA',$2,$3,$4,$5,$6,'CONCLUIDA',$7,NOW()) RETURNING id`, [req.acessoProjeto!.projetoId,req.body.formato,req.body.modo,req.body.nomeArquivo || null,createHash('sha256').update(req.body.conteudo).digest('hex'),parsed.total,req.usuarioId])
    await recordAudit(client, { projetoId: req.acessoProjeto!.projetoId, usuarioId: req.usuarioId!, acao: 'FLUXO_CAIXA_IMPORTADO', entidade: 'importacoes', registroId: rows[0]!.id, dadosNovos: { modo: req.body.modo, quantidade: parsed.total }, enderecoIp: req.ip })
    return rows[0]!.id
  })
  res.status(201).json({ importacaoId: id, quantidade: parsed.total })
})
