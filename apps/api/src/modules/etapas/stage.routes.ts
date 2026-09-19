import { createHash } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '../../config/database.js'
import { requireAuth } from '../../shared/auth.js'
import { recordAudit } from '../../shared/audit.js'
import { AppError } from '../../shared/errors.js'
import { importExample } from '../../shared/import-examples.js'
import { parseBrazilianNumber, parseImportContent } from '../../shared/importParser.js'
import { requireProjectPermission } from '../../shared/projectAccess.js'
import { validateBody } from '../../shared/validation.js'
import { getSchedule } from './schedule.service.js'
import { createSchedulePdf, createScheduleWorkbook, getScheduleReport } from '../relatorios/planning-report.service.js'

const nullableDate = z.union([z.iso.date(), z.literal(''), z.null()]).optional().transform((value) => value || null)
const scheduleSchema = z.object({
  parent_id: z.coerce.number().int().positive().optional().nullable(),
  nome: z.string().trim().min(2).max(180),
  descricao: z.string().trim().max(4_000).optional().nullable().transform((value) => value || null),
  data_inicio_previsto: nullableDate,
  data_fim_previsto: nullableDate,
  data_inicio: nullableDate,
  data_fim: nullableDate,
  valor_previsto: z.preprocess(parseBrazilianNumber, z.coerce.number().min(0).max(999_999_999_999.99)).default(0),
  ordem: z.coerce.number().int().min(0).max(999_999).default(0),
  cor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#8d765a'),
}).superRefine((value, context) => {
  if (value.data_inicio_previsto && value.data_fim_previsto && value.data_fim_previsto < value.data_inicio_previsto) context.addIssue({ code: 'custom', path: ['data_fim_previsto'], message: 'O fim previsto deve ser posterior ao início previsto.' })
  if (value.data_inicio && value.data_fim && value.data_fim < value.data_inicio) context.addIssue({ code: 'custom', path: ['data_fim'], message: 'O fim deve ser posterior ao início.' })
})

const importSchema = z.object({ formato: z.enum(['TSV', 'JSON']), conteudo: z.string().min(2), modo: z.enum(['ACRESCENTAR', 'SUBSTITUIR']).optional(), nomeArquivo: z.string().max(255).optional() })
type ImportRow = z.infer<typeof scheduleSchema> & { tipo: 'ETAPA' | 'SUBITEM'; etapa_pai: string | null }

function normalizeDate(value: unknown) {
  if (typeof value !== 'string') return value
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return value
  const [, day, month, year] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return value
  return `${year}-${month}-${day}`
}

export function parseSchedule(format:'TSV'|'JSON',content:string){
  const raw=parseImportContent(format,content)
  const valid:ImportRow[]=[]
  const errors:{linha:number;erros:string[]}[]=[]
  const schema=z.object({...scheduleSchema.shape,tipo:z.enum(['ETAPA','SUBITEM']),etapa_pai:z.string().trim().optional().nullable()}).omit({parent_id:true}).strict()
  raw.forEach((value,index)=>{
    const source=value as Record<string,unknown>
    const result=schema.safeParse({...source,data_inicio_previsto:normalizeDate(source.data_inicio_previsto),data_fim_previsto:normalizeDate(source.data_fim_previsto),data_inicio:normalizeDate(source.data_inicio),data_fim:normalizeDate(source.data_fim)})
    if(!result.success){errors.push({linha:index+2,erros:result.error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`)});return}
    const row=result.data
    const issues:string[]=[]
    if(row.tipo==='SUBITEM'&&!row.etapa_pai)issues.push('etapa_pai: informe exatamente o nome da etapa pai.')
    if(row.tipo==='ETAPA'&&row.etapa_pai)issues.push('etapa_pai: uma etapa não pode ter pai.')
    if(row.data_inicio_previsto&&row.data_fim_previsto&&row.data_fim_previsto<row.data_inicio_previsto)issues.push('data_fim_previsto: anterior ao início previsto.')
    if(row.data_inicio&&row.data_fim&&row.data_fim<row.data_inicio)issues.push('data_fim: anterior ao início real.')
    if(issues.length)errors.push({linha:index+2,erros:issues})
    else valid.push({...row,parent_id:null,etapa_pai:row.etapa_pai||null})
  })
  const names=new Set<string>()
  valid.filter(row=>row.tipo==='ETAPA').forEach(row=>{const key=row.nome.toLowerCase();if(names.has(key))errors.push({linha:2,erros:[`Etapa duplicada no arquivo: ${row.nome}.`]});names.add(key)})
  return {registros:valid,erros:errors,total:raw.length}
}

async function ensureParent(projectId: number, parentId: number | null | undefined) {
  if (!parentId) return
  const result = await query('SELECT 1 FROM cronogramas WHERE id=$1 AND projeto_id=$2 AND parent_id IS NULL AND excluido_em IS NULL', [parentId, projectId])
  if (!result.rowCount) throw new AppError(422, 'A etapa pai não pertence a este projeto.', 'ETAPA_PAI_INVALIDA')
}

async function ensureChildrenBudget(projectId: number, parentId: number | null | undefined, value: number, itemId?: number) {
  if (!parentId) {
    if (!itemId) return
    const { rows } = await query<{ total: string }>('SELECT COALESCE(SUM(valor_previsto),0)::numeric AS total FROM cronogramas WHERE projeto_id=$1 AND parent_id=$2 AND excluido_em IS NULL', [projectId,itemId])
    if (Number(rows[0]?.total || 0) > value) throw new AppError(422, `O valor orçado da etapa pai não pode ser menor que o somatório dos subitens (R$ ${Number(rows[0]?.total || 0).toFixed(2)}).`, 'ORCAMENTO_PAI_MENOR_QUE_FILHOS')
    return
  }
  const { rows } = await query<{ total: string; limit: string }>(`SELECT
    COALESCE((SELECT SUM(valor_previsto) FROM cronogramas WHERE projeto_id=$1 AND parent_id=$2 AND excluido_em IS NULL AND ($3::bigint IS NULL OR id<>$3)),0)::numeric AS total,
    COALESCE((SELECT valor_previsto FROM cronogramas WHERE projeto_id=$1 AND id=$2 AND parent_id IS NULL AND excluido_em IS NULL),0)::numeric AS limit`, [projectId,parentId,itemId ?? null])
  const total = Number(rows[0]?.total || 0) + value
  const limit = Number(rows[0]?.limit || 0)
  if (total > limit) throw new AppError(422, `O valor orçado dos subitens (R$ ${total.toFixed(2)}) ultrapassa o valor orçado da etapa pai (R$ ${limit.toFixed(2)}).`, 'ORCAMENTO_SUBITENS_EXCEDE_PAI')
}

export const stagesRouter = Router({ mergeParams: true })
stagesRouter.use(requireAuth)

stagesRouter.get('/', requireProjectPermission('etapas.visualizar'), async (req, res) => {
  const projectId = req.acessoProjeto!.projetoId
  const data=await getSchedule(projectId)
  res.json(data)
})

stagesRouter.get('/relatorio.pdf', requireProjectPermission('etapas.exportar'), async (req,res)=>{const report=await getScheduleReport(req.acessoProjeto!.projetoId,{planned:req.query.previsto!=='false',sort:String(req.query.ordem||'ordem'),direction:String(req.query.direcao||'asc')});const document=createSchedulePdf(report);res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`inline; filename="cronograma-${req.acessoProjeto!.projetoId}.pdf"`);document.pipe(res);document.end()})
stagesRouter.get('/relatorio.xlsx', requireProjectPermission('etapas.exportar'), async (req,res)=>{const report=await getScheduleReport(req.acessoProjeto!.projetoId,{planned:req.query.previsto!=='false',sort:String(req.query.ordem||'ordem'),direction:String(req.query.direcao||'asc')});const content=await createScheduleWorkbook(report);res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition',`attachment; filename="cronograma-${req.acessoProjeto!.projetoId}.xlsx"`);res.send(Buffer.from(content))})

stagesRouter.post('/', requireProjectPermission('etapas.inserir'), validateBody(scheduleSchema), async (req, res) => {
  await ensureParent(req.acessoProjeto!.projetoId, req.body.parent_id)
  await ensureChildrenBudget(req.acessoProjeto!.projetoId, req.body.parent_id, req.body.valor_previsto)
  const item = await withTransaction(async (client) => {
    const value = req.body
    const { rows } = await client.query(`INSERT INTO cronogramas (projeto_id,parent_id,nome,descricao,data_inicio_previsto,data_fim_previsto,data_inicio,data_fim,valor_previsto,valor_executado,ordem,criado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11) RETURNING *`, [req.acessoProjeto!.projetoId,value.parent_id,value.nome,value.descricao,value.data_inicio_previsto,value.data_fim_previsto,value.data_inicio,value.data_fim,value.valor_previsto,value.ordem,req.usuarioId])
    await recordAudit(client, { projetoId: req.acessoProjeto!.projetoId, usuarioId: req.usuarioId!, acao: value.parent_id ? 'SUBITEM_CRONOGRAMA_CRIADO' : 'ETAPA_CRONOGRAMA_CRIADA', entidade: 'cronograma', registroId: rows[0].id, dadosNovos: rows[0], enderecoIp: req.ip })
    return rows[0]
  })
  res.status(201).json({ item })
})

stagesRouter.put('/:itemId', requireProjectPermission('etapas.atualizar'), validateBody(scheduleSchema), async (req, res) => {
  const id = Number(req.params.itemId)
  await ensureParent(req.acessoProjeto!.projetoId, req.body.parent_id)
  await ensureChildrenBudget(req.acessoProjeto!.projetoId, req.body.parent_id, req.body.valor_previsto, id)
  if (req.body.parent_id === id) throw new AppError(422, 'Um item não pode ser pai de si mesmo.', 'CRONOGRAMA_CICLICO')
  const item = await withTransaction(async (client) => {
    const before = await client.query('SELECT * FROM cronogramas WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL FOR UPDATE', [id, req.acessoProjeto!.projetoId])
    if (!before.rows[0]) throw new AppError(404, 'Item do cronograma não encontrado.', 'CRONOGRAMA_NAO_ENCONTRADO')
    if (before.rows[0].parent_id === null && req.body.parent_id) {
      const children = await client.query('SELECT 1 FROM cronogramas WHERE parent_id=$1 AND excluido_em IS NULL LIMIT 1', [id])
      if (children.rowCount) throw new AppError(422, 'Uma etapa com subitens não pode ser convertida em subitem.', 'ETAPA_POSSUI_SUBITENS')
    }
    const value = req.body
    const { rows } = await client.query(`UPDATE cronogramas SET parent_id=$3,nome=$4,descricao=$5,data_inicio_previsto=$6,data_fim_previsto=$7,data_inicio=$8,data_fim=$9,
      valor_previsto=$10,ordem=$11 WHERE id=$1 AND projeto_id=$2 RETURNING *`, [id,req.acessoProjeto!.projetoId,value.parent_id,value.nome,value.descricao,value.data_inicio_previsto,value.data_fim_previsto,value.data_inicio,value.data_fim,value.valor_previsto,value.ordem])
    await recordAudit(client, { projetoId: req.acessoProjeto!.projetoId, usuarioId: req.usuarioId!, acao: 'CRONOGRAMA_ATUALIZADO', entidade: 'cronograma', registroId: id, dadosAnteriores: before.rows[0], dadosNovos: rows[0], enderecoIp: req.ip })
    return rows[0]
  })
  res.json({ item })
})

stagesRouter.delete('/:itemId', requireProjectPermission('etapas.excluir'), async (req, res) => {
  const id = Number(req.params.itemId)
  const projectId = req.acessoProjeto!.projetoId
  const { rows: links } = await query<{ pagamentos: number }>(`WITH itens AS (
    SELECT id FROM cronogramas WHERE projeto_id=$1 AND excluido_em IS NULL AND (id=$2 OR parent_id=$2)
  ) SELECT (
    (SELECT COUNT(*) FROM despesas WHERE projeto_id=$1 AND excluido_em IS NULL AND etapa_id IN (SELECT id FROM itens)) +
    (SELECT COUNT(*) FROM pagamentos WHERE projeto_id=$1 AND compra_id IS NULL AND excluido_em IS NULL AND etapa_id IN (SELECT id FROM itens))
  )::int AS pagamentos`, [projectId,id])
  const linked = links[0]
  if (linked?.pagamentos) {
    throw new AppError(422, `Não é possível excluir esta etapa porque há ${linked.pagamentos} pagamento(s) vinculado(s).`, 'ETAPA_COM_MOVIMENTACOES')
  }
  const { rowCount } = await query(`UPDATE cronogramas SET excluido_em=NOW() WHERE projeto_id=$2 AND excluido_em IS NULL AND (id=$1 OR parent_id=$1)`, [id, projectId])
  if (!rowCount) throw new AppError(404, 'Item do cronograma não encontrado.', 'CRONOGRAMA_NAO_ENCONTRADO')
  res.status(204).end()
})

stagesRouter.get('/importacao/modelo', requireProjectPermission('etapas.inserir'), (req,res)=>{const format=z.enum(['TSV','JSON']).parse(req.query.formato||'JSON');res.type(format==='JSON'?'application/json':'text/tab-separated-values').attachment(`cronograma.${format.toLowerCase()}`).send(importExample('cronograma',format))})

stagesRouter.post('/importacao/preview', requireProjectPermission('etapas.inserir'), validateBody(importSchema), async (req, res) => res.json(parseSchedule(req.body.formato, req.body.conteudo)))

stagesRouter.post('/importacao/confirmar', requireProjectPermission('etapas.inserir'), validateBody(importSchema.required({ modo: true })), async (req, res) => {
  const parsed = parseSchedule(req.body.formato, req.body.conteudo)
  if (parsed.erros.length) throw new AppError(422, 'A importação possui erros e não foi aplicada.', 'IMPORTACAO_INVALIDA', parsed.erros)
  const importId = await withTransaction(async (client) => {
    const projectId = req.acessoProjeto!.projetoId
    if(req.body.modo==='SUBSTITUIR'){
      if(!req.acessoProjeto!.permissoes.has('etapas.excluir')&&!req.acessoProjeto!.proprietario&&!req.acessoProjeto!.administradorSistema)throw new AppError(403,'A substituição exige permissão para excluir etapas.','ACESSO_NEGADO')
      const linked=await client.query('SELECT 1 FROM despesas WHERE projeto_id=$1 AND etapa_id IS NOT NULL AND excluido_em IS NULL UNION ALL SELECT 1 FROM pagamentos WHERE projeto_id=$1 AND compra_id IS NULL AND etapa_id IS NOT NULL AND excluido_em IS NULL LIMIT 1',[projectId])
      if(linked.rowCount)throw new AppError(422,'Há despesas vinculadas ao cronograma. Utilize Acrescentar para preservar seus relacionamentos.','CRONOGRAMA_VINCULADO')
    }
    if (req.body.modo === 'SUBSTITUIR') await client.query('UPDATE cronogramas SET excluido_em=NOW() WHERE projeto_id=$1 AND excluido_em IS NULL', [projectId])
    const existing = await client.query<{ id: number; nome: string; ordem: number }>('SELECT id,nome,ordem FROM cronogramas WHERE projeto_id=$1 AND parent_id IS NULL AND excluido_em IS NULL', [projectId])
    const parents = new Map<string, number>()
    existing.rows.forEach((row) => {const name=row.nome.trim().toLowerCase();parents.set(name,parents.has(name)?-1:row.id)})
    for (const row of parsed.registros.filter((item) => item.tipo === 'ETAPA')) {
      const result = await client.query<{ id: number }>(`INSERT INTO cronogramas (projeto_id,parent_id,nome,descricao,data_inicio_previsto,data_fim_previsto,data_inicio,data_fim,valor_previsto,valor_executado,ordem,criado_por,cor)
        VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$11) RETURNING id`, [projectId,row.nome,row.descricao,row.data_inicio_previsto,row.data_fim_previsto,row.data_inicio,row.data_fim,row.valor_previsto,row.ordem,req.usuarioId,row.cor])
      const id = result.rows[0]!.id
      parents.set(row.nome.trim().toLowerCase(), id)
    }
    for (const row of parsed.registros.filter((item) => item.tipo === 'SUBITEM')) {
      const parentId = parents.get(row.etapa_pai!.toLowerCase())
      if (!parentId || parentId < 0) throw new AppError(422, `Etapa pai não encontrada: ${row.etapa_pai}.`, 'ETAPA_PAI_NAO_ENCONTRADA')
      const budget=await client.query<{total:string;limite:string}>(`SELECT COALESCE((SELECT SUM(valor_previsto) FROM cronogramas WHERE parent_id=$1 AND excluido_em IS NULL),0) AS total,(SELECT valor_previsto FROM cronogramas WHERE id=$1) AS limite`,[parentId])
      if(Number(budget.rows[0]!.total)+row.valor_previsto>Number(budget.rows[0]!.limite))throw new AppError(422,`O orçamento dos subitens ultrapassa a etapa ${row.etapa_pai}.`,'ORCAMENTO_SUBITENS_EXCEDE_PAI')
      await client.query(`INSERT INTO cronogramas (projeto_id,parent_id,nome,descricao,data_inicio_previsto,data_fim_previsto,data_inicio,data_fim,valor_previsto,valor_executado,ordem,criado_por,cor)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,$12)`, [projectId,parentId,row.nome,row.descricao,row.data_inicio_previsto,row.data_fim_previsto,row.data_inicio,row.data_fim,row.valor_previsto,row.ordem,req.usuarioId,row.cor])
    }
    const { rows } = await client.query<{ id: number }>(`INSERT INTO importacoes
      (projeto_id,entidade,formato,modo,nome_arquivo,hash_arquivo,quantidade_linhas,status,criado_por,concluido_em)
      VALUES ($1,'CRONOGRAMA',$2,$3,$4,$5,$6,'CONCLUIDA',$7,NOW()) RETURNING id`, [projectId,req.body.formato,req.body.modo,req.body.nomeArquivo || null,createHash('sha256').update(req.body.conteudo).digest('hex'),parsed.total,req.usuarioId])
    await recordAudit(client, { projetoId: projectId, usuarioId: req.usuarioId!, acao: 'CRONOGRAMA_IMPORTADO', entidade: 'importacoes', registroId: rows[0]!.id, dadosNovos: { modo: req.body.modo, quantidade: parsed.total }, enderecoIp: req.ip })
    return rows[0]!.id
  })
  res.status(201).json({ importacaoId: importId, quantidade: parsed.total })
})
