import { Router } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '../../config/database.js'
import { requireAuth } from '../../shared/auth.js'
import { recordAudit } from '../../shared/audit.js'
import { AppError } from '../../shared/errors.js'
import { requireSystemAdmin } from '../../shared/projectAccess.js'
import { validateBody } from '../../shared/validation.js'
import { systemVariableSchema } from './system-variable.schemas.js'

export const adminRouter = Router()
adminRouter.use(requireAuth, requireSystemAdmin)

adminRouter.get('/resumo', async (_req, res) => {
  const [totals, usersByMonth, projectsByMonth] = await Promise.all([
    query(`SELECT (SELECT COUNT(*) FROM usuarios WHERE ativo)::int AS usuarios,
      (SELECT COUNT(*) FROM projetos WHERE excluido_em IS NULL)::int AS projetos,
      (SELECT COUNT(*) FROM convites_projeto WHERE aceito_em IS NULL AND cancelado_em IS NULL AND expira_em>NOW())::int AS convites_pendentes,
      (SELECT COUNT(*) FROM membros_projeto WHERE ativo)::int AS participacoes`),
    query(`SELECT DATE_TRUNC('month',criado_em)::date AS mes,COUNT(*)::int AS total FROM usuarios
      WHERE criado_em>=CURRENT_DATE-INTERVAL '12 months' GROUP BY 1 ORDER BY 1`),
    query(`SELECT DATE_TRUNC('month',criado_em)::date AS mes,COUNT(*)::int AS total FROM projetos
      WHERE criado_em>=CURRENT_DATE-INTERVAL '12 months' AND excluido_em IS NULL GROUP BY 1 ORDER BY 1`),
  ])
  res.json({ totais: totals.rows[0], usuariosPorMes: usersByMonth.rows, projetosPorMes: projectsByMonth.rows })
})

adminRouter.get('/usuarios', async (req, res) => {
  const page = Math.max(1, Number(req.query.pagina) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(req.query.porPagina) || 25))
  const search = String(req.query.busca || '').trim()
  const [items, count] = await Promise.all([
    query(`SELECT u.id,u.nome,u.email,u.foto_url,usuario_eh_administrador_sistema(u.id) AS administrador_sistema,u.ativo,u.ultimo_acesso_em,u.criado_em,
      pl.codigo AS plano,(SELECT COUNT(*)::int FROM projetos p WHERE p.proprietario_usuario_id=u.id AND p.excluido_em IS NULL) AS projetos_proprios,
      (SELECT COUNT(*)::int FROM membros_projeto mp WHERE mp.usuario_id=u.id AND mp.ativo) AS participacoes
      FROM usuarios u JOIN planos pl ON pl.id=u.plano_id WHERE ($1='%%' OR u.nome ILIKE $1 OR u.email ILIKE $1)
      ORDER BY u.criado_em DESC LIMIT $2 OFFSET $3`, [`%${search}%`,pageSize,(page-1)*pageSize]),
    query<{ total: number }>('SELECT COUNT(*)::int AS total FROM usuarios WHERE ($1=\'%%\' OR nome ILIKE $1 OR email ILIKE $1)', [`%${search}%`]),
  ])
  res.json({ usuarios: items.rows, pagina: page, porPagina: pageSize, total: count.rows[0]!.total })
})

adminRouter.get('/projetos', async (req, res) => {
  const page = Math.max(1, Number(req.query.pagina) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(req.query.porPagina) || 25))
  const { rows } = await query(`SELECT p.id,p.nome,p.cidade,p.estado,p.criado_em,u.nome AS proprietario,u.email,
    (SELECT COUNT(*)::int FROM membros_projeto mp WHERE mp.projeto_id=p.id AND mp.ativo) AS membros
    FROM projetos p JOIN usuarios u ON u.id=p.proprietario_usuario_id WHERE p.excluido_em IS NULL
    ORDER BY p.criado_em DESC LIMIT $1 OFFSET $2`, [pageSize,(page-1)*pageSize])
  const count = await query<{ total: number }>('SELECT COUNT(*)::int AS total FROM projetos WHERE excluido_em IS NULL')
  res.json({ projetos: rows, pagina: page, porPagina: pageSize, total: count.rows[0]!.total })
})

adminRouter.get('/auditoria', async (req, res) => {
  const page = Math.max(1, Number(req.query.pagina) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(req.query.porPagina) || 25))
  const { rows } = await query(`SELECT ra.id,ra.acao,ra.entidade,ra.registro_id,ra.criado_em,u.nome AS usuario,p.nome AS projeto
    FROM registros_auditoria ra LEFT JOIN usuarios u ON u.id=ra.usuario_id LEFT JOIN projetos p ON p.id=ra.projeto_id
    ORDER BY ra.criado_em DESC LIMIT $1 OFFSET $2`, [pageSize,(page-1)*pageSize])
  res.json({ registros: rows, pagina: page, porPagina: pageSize })
})

adminRouter.get('/planos', async (_req, res) => {
  const { rows } = await query(`SELECT p.id,p.codigo,p.nome,p.limite_projetos_proprios,p.ativo,
    COUNT(u.id)::int AS usuarios FROM planos p LEFT JOIN usuarios u ON u.plano_id=p.id AND u.ativo
    GROUP BY p.id ORDER BY p.id`)
  res.json({ planos: rows })
})

adminRouter.get('/variaveis', async (_req, res) => {
  const { rows } = await query('SELECT id,chave,valor,descricao,atualizado_em FROM configuracoes_sistema ORDER BY chave')
  res.json({ variaveis: rows })
})

adminRouter.post('/variaveis', validateBody(systemVariableSchema), async (req, res) => {
  try {
    const variable = await withTransaction(async client => {
      const { rows } = await client.query(`INSERT INTO configuracoes_sistema (chave,valor,descricao,atualizado_por)
        VALUES ($1,$2::jsonb,$3,$4) RETURNING id,chave,valor,descricao,atualizado_em`,
      [req.body.chave,JSON.stringify(req.body.valor),req.body.descricao,req.usuarioId])
      await recordAudit(client,{usuarioId:req.usuarioId,acao:'VARIAVEL_SISTEMA_CRIADA',entidade:'configuracoes_sistema',registroId:rows[0]!.id,dadosNovos:rows[0],enderecoIp:req.ip})
      return rows[0]
    })
    res.status(201).json({ variavel: variable })
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new AppError(409, 'Já existe uma variável com essa chave.', 'CHAVE_DUPLICADA')
    throw error
  }
})

adminRouter.put('/variaveis/:variavelId', validateBody(systemVariableSchema), async (req, res) => {
  const variableId = Number(req.params.variavelId)
  if (!Number.isInteger(variableId) || variableId <= 0) throw new AppError(422, 'Variável inválida.', 'VARIAVEL_INVALIDA')
  try {
    const variable = await withTransaction(async client => {
      const previous = await client.query('SELECT id,chave,valor,descricao,atualizado_em FROM configuracoes_sistema WHERE id=$1 FOR UPDATE',[variableId])
      if (!previous.rows[0]) throw new AppError(404, 'Variável não encontrada.', 'VARIAVEL_NAO_ENCONTRADA')
      const { rows } = await client.query(`UPDATE configuracoes_sistema SET chave=$2,valor=$3::jsonb,descricao=$4,atualizado_por=$5
        WHERE id=$1 RETURNING id,chave,valor,descricao,atualizado_em`,
      [variableId,req.body.chave,JSON.stringify(req.body.valor),req.body.descricao,req.usuarioId])
      await recordAudit(client,{usuarioId:req.usuarioId,acao:'VARIAVEL_SISTEMA_ATUALIZADA',entidade:'configuracoes_sistema',registroId:variableId,dadosAnteriores:previous.rows[0],dadosNovos:rows[0],enderecoIp:req.ip})
      return rows[0]
    })
    res.json({ variavel: variable })
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new AppError(409, 'Já existe uma variável com essa chave.', 'CHAVE_DUPLICADA')
    throw error
  }
})

adminRouter.delete('/variaveis/:variavelId', async (req, res) => {
  const variableId = Number(req.params.variavelId)
  if (!Number.isInteger(variableId) || variableId <= 0) throw new AppError(422, 'Variável inválida.', 'VARIAVEL_INVALIDA')
  await withTransaction(async client => {
    const { rows } = await client.query('DELETE FROM configuracoes_sistema WHERE id=$1 RETURNING id,chave,valor,descricao,atualizado_em',[variableId])
    if (!rows[0]) throw new AppError(404, 'Variável não encontrada.', 'VARIAVEL_NAO_ENCONTRADA')
    await recordAudit(client,{usuarioId:req.usuarioId,acao:'VARIAVEL_SISTEMA_EXCLUIDA',entidade:'configuracoes_sistema',registroId:variableId,dadosAnteriores:rows[0],enderecoIp:req.ip})
  })
  res.status(204).send()
})

adminRouter.get('/status', async (_req, res) => {
  const [database, migrations] = await Promise.all([
    query<{ agora: string; versao: string }>('SELECT NOW() AS agora,VERSION() AS versao'),
    query<{ total: number }>('SELECT COUNT(*)::int AS total FROM migrations_controle'),
  ])
  res.json({ api: 'operacional', banco: 'operacional', dataBanco: database.rows[0]!.agora, versaoBanco: database.rows[0]!.versao, migrationsAplicadas: migrations.rows[0]!.total, node: process.version })
})

adminRouter.patch('/usuarios/:usuarioId/administrador', validateBody(z.object({ administrador: z.boolean() })), async (req, res) => {
  const userId = Number(req.params.usuarioId)
  if (!req.body.administrador) {
    const { rows } = await query<{ total: number }>('SELECT COUNT(*)::int AS total FROM usuarios WHERE ativo AND administrador_sistema')
    if (rows[0]!.total <= 1) throw new AppError(409, 'Ao menos um administrador do sistema deve permanecer ativo.', 'ULTIMO_ADMINISTRADOR')
  }
  const { rows } = await query('UPDATE usuarios SET administrador_sistema=$2 WHERE id=$1 AND ativo RETURNING id,nome,email,administrador_sistema', [userId, req.body.administrador])
  if (!rows[0]) throw new AppError(404, 'Usuário não encontrado.', 'USUARIO_NAO_ENCONTRADO')
  res.json({ usuario: rows[0] })
})
