import { Router } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '../../config/database.js'
import { requireAuth } from '../../shared/auth.js'
import { recordAudit } from '../../shared/audit.js'
import { AppError } from '../../shared/errors.js'
import { requireProjectPermission } from '../../shared/projectAccess.js'
import { validateBody } from '../../shared/validation.js'

const taskSchema = z.object({
  descricao: z.string().trim().min(2).max(240),
  observacao: z.string().trim().max(4_000).optional().nullable().transform((value) => value || null),
  status: z.enum(['PARADO','INICIADO','FINALIZADO']),
  prioridade: z.enum(['BAIXA','ALTA']),
})
const taskStatusSchema = z.object({ status: z.enum(['PARADO','INICIADO','FINALIZADO']) })

export const tasksRouter = Router({ mergeParams: true })
tasksRouter.use(requireAuth)

tasksRouter.get('/', requireProjectPermission('tarefas.visualizar'), async (req, res) => {
  const search = String(req.query.busca || '').trim()
  const status = String(req.query.status || '').trim()
  const priority = String(req.query.prioridade || '').trim()
  if (status && !['PARADO','INICIADO','FINALIZADO'].includes(status)) throw new AppError(422, 'Status de tarefa inválido.', 'STATUS_TAREFA_INVALIDO')
  if (priority && !['BAIXA','ALTA'].includes(priority)) throw new AppError(422, 'Prioridade de tarefa inválida.', 'PRIORIDADE_TAREFA_INVALIDA')
  const { rows } = await query(`SELECT id,descricao,observacao,status,prioridade,criado_em,atualizado_em
    FROM tarefas WHERE projeto_id=$1 AND excluido_em IS NULL
      AND ($2='%%' OR descricao ILIKE $2 OR observacao ILIKE $2)
      AND ($3='' OR status=$3)
      AND ($4='' OR prioridade=$4)
    ORDER BY CASE status WHEN 'INICIADO' THEN 1 WHEN 'PARADO' THEN 2 ELSE 3 END,
      CASE prioridade WHEN 'ALTA' THEN 1 ELSE 2 END,id DESC`, [req.acessoProjeto!.projetoId,`%${search}%`,status,priority])
  res.json({ tarefas: rows, total: rows.length })
})

tasksRouter.post('/', requireProjectPermission('tarefas.inserir'), validateBody(taskSchema), async (req, res) => {
  const { rows } = await query(`INSERT INTO tarefas (projeto_id,descricao,observacao,status,prioridade,criado_por)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [req.acessoProjeto!.projetoId,req.body.descricao,req.body.observacao,req.body.status,req.body.prioridade,req.usuarioId])
  res.status(201).json({ tarefa: rows[0] })
})

tasksRouter.put('/:taskId', requireProjectPermission('tarefas.atualizar'), validateBody(taskSchema), async (req, res) => {
  const taskId = Number(req.params.taskId)
  const task = await withTransaction(async (client) => {
    const before = await client.query('SELECT * FROM tarefas WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL FOR UPDATE', [taskId,req.acessoProjeto!.projetoId])
    if (!before.rows[0]) throw new AppError(404, 'Tarefa não encontrada.', 'TAREFA_NAO_ENCONTRADA')
    const { rows } = await client.query(`UPDATE tarefas SET descricao=$3,observacao=$4,status=$5,prioridade=$6
      WHERE id=$1 AND projeto_id=$2 RETURNING *`, [taskId,req.acessoProjeto!.projetoId,req.body.descricao,req.body.observacao,req.body.status,req.body.prioridade])
    await recordAudit(client, { projetoId: req.acessoProjeto!.projetoId, usuarioId: req.usuarioId!, acao: 'TAREFA_ATUALIZADA', entidade: 'tarefas', registroId: taskId, dadosAnteriores: before.rows[0], dadosNovos: rows[0], enderecoIp: req.ip })
    return rows[0]
  })
  res.json({ tarefa: task })
})

tasksRouter.patch('/:taskId/status', requireProjectPermission('tarefas.atualizar'), validateBody(taskStatusSchema), async (req, res) => {
  const taskId = Number(req.params.taskId)
  const task = await withTransaction(async (client) => {
    const before = await client.query<{ status: z.infer<typeof taskStatusSchema>['status'] }>('SELECT status FROM tarefas WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL FOR UPDATE', [taskId,req.acessoProjeto!.projetoId])
    if (!before.rows[0]) throw new AppError(404, 'Tarefa não encontrada.', 'TAREFA_NAO_ENCONTRADA')
    const { rows } = await client.query<{ id: number; status: z.infer<typeof taskStatusSchema>['status'] }>('UPDATE tarefas SET status=$3 WHERE id=$1 AND projeto_id=$2 RETURNING id,status', [taskId,req.acessoProjeto!.projetoId,req.body.status])
    await recordAudit(client, { projetoId: req.acessoProjeto!.projetoId, usuarioId: req.usuarioId!, acao: 'STATUS_TAREFA_ATUALIZADO', entidade: 'tarefas', registroId: taskId, dadosAnteriores: before.rows[0], dadosNovos: rows[0], enderecoIp: req.ip })
    return rows[0]
  })
  res.json({ tarefa: task })
})

tasksRouter.delete('/:taskId', requireProjectPermission('tarefas.excluir'), async (req, res) => {
  const { rowCount } = await query('UPDATE tarefas SET excluido_em=NOW() WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL', [Number(req.params.taskId),req.acessoProjeto!.projetoId])
  if (!rowCount) throw new AppError(404, 'Tarefa não encontrada.', 'TAREFA_NAO_ENCONTRADA')
  res.status(204).end()
})
