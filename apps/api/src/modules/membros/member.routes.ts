import { createHash, randomBytes } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '../../config/database.js'
import { env } from '../../config/env.js'
import { requireAuth } from '../../shared/auth.js'
import { recordAudit } from '../../shared/audit.js'
import { sendInvitationEmail } from '../../shared/email.js'
import { AppError } from '../../shared/errors.js'
import { requireProjectPermission } from '../../shared/projectAccess.js'
import { validateBody } from '../../shared/validation.js'

const inviteSchema = z.object({
  email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
  papel: z.enum(['ENGENHEIRO', 'LEITOR']),
})
const roleSchema = z.object({ papel: z.enum(['ENGENHEIRO', 'LEITOR']) })
const permissionsSchema = z.object({
  permissoes: z.array(z.object({ chave: z.string().min(3).max(120), permitido: z.boolean().nullable() })).max(100),
})

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export const invitationsRouter = Router()
invitationsRouter.post('/:token/aceitar', requireAuth, async (req, res) => {
  const rawToken = String(req.params.token)
  if (!rawToken || rawToken.length < 40) throw new AppError(400, 'Convite inválido.', 'CONVITE_INVALIDO')
  const result = await withTransaction(async (client) => {
    const invitationResult = await client.query<{
      id: number; projeto_id: number; email: string; papel_id: number; expira_em: Date; aceito_em: Date | null; cancelado_em: Date | null
    }>('SELECT * FROM convites_projeto WHERE token_hash=$1 FOR UPDATE', [tokenHash(rawToken)])
    const invitation = invitationResult.rows[0]
    if (!invitation || invitation.cancelado_em) throw new AppError(404, 'Convite inválido ou cancelado.', 'CONVITE_INVALIDO')
    if (invitation.aceito_em) throw new AppError(409, 'Este convite já foi utilizado.', 'CONVITE_UTILIZADO')
    if (invitation.expira_em < new Date()) throw new AppError(410, 'Este convite expirou.', 'CONVITE_EXPIRADO')
    const userResult = await client.query<{ email: string }>('SELECT email FROM usuarios WHERE id=$1 AND ativo', [req.usuarioId])
    if (userResult.rows[0]?.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new AppError(403, 'O convite pertence a outra conta Google.', 'EMAIL_CONVITE_DIFERENTE')
    }
    await client.query(`INSERT INTO membros_projeto (projeto_id,usuario_id,papel_id,convidado_por)
      SELECT $1,$2,$3,criado_por FROM convites_projeto WHERE id=$4
      ON CONFLICT (projeto_id,usuario_id) DO UPDATE SET papel_id=EXCLUDED.papel_id,ativo=TRUE,atualizado_em=NOW()`, [
      invitation.projeto_id, req.usuarioId, invitation.papel_id, invitation.id,
    ])
    await client.query('UPDATE convites_projeto SET aceito_em=NOW() WHERE id=$1', [invitation.id])
    await recordAudit(client, { projetoId: invitation.projeto_id, usuarioId: req.usuarioId!, acao: 'CONVITE_ACEITO', entidade: 'convites_projeto', registroId: invitation.id, enderecoIp: req.ip })
    return { projetoId: invitation.projeto_id }
  })
  res.json(result)
})

export const membersRouter = Router({ mergeParams: true })
membersRouter.use(requireAuth)

membersRouter.get('/', requireProjectPermission('membros.visualizar'), async (req, res) => {
  const [members, permissions] = await Promise.all([
    query(`SELECT mp.id,u.id AS usuario_id,u.nome,u.email,u.foto_url,pa.codigo AS papel,pa.nome AS nome_papel,
      (p.proprietario_usuario_id=u.id) AS proprietario,mp.criado_em,
      (SELECT JSONB_OBJECT_AGG(pe.chave,COALESCE(pm.permitido,ppp.permitido,pp.permissao_id IS NOT NULL))
        FROM permissoes pe LEFT JOIN permissoes_papel pp ON pp.papel_id=mp.papel_id AND pp.permissao_id=pe.id
        LEFT JOIN permissoes_projeto_papel ppp ON ppp.projeto_id=mp.projeto_id AND ppp.papel_id=mp.papel_id AND ppp.permissao_id=pe.id
        LEFT JOIN permissoes_membro pm ON pm.membro_projeto_id=mp.id AND pm.permissao_id=pe.id) AS permissoes
      FROM membros_projeto mp JOIN usuarios u ON u.id=mp.usuario_id JOIN papeis pa ON pa.id=mp.papel_id
      JOIN projetos p ON p.id=mp.projeto_id WHERE mp.projeto_id=$1 AND mp.ativo ORDER BY proprietario DESC,u.nome`, [req.acessoProjeto!.projetoId]),
    query('SELECT id,chave,modulo,acao,descricao FROM permissoes ORDER BY modulo,acao'),
  ])
  res.json({ membros: members.rows, permissoesDisponiveis: permissions.rows })
})

membersRouter.get('/convites', requireProjectPermission('membros.visualizar'), async (req, res) => {
  const { rows } = await query(`SELECT c.id,c.email,pa.codigo AS papel,c.expira_em,c.aceito_em,c.cancelado_em,c.criado_em,
    u.nome AS criado_por_nome FROM convites_projeto c JOIN papeis pa ON pa.id=c.papel_id JOIN usuarios u ON u.id=c.criado_por
    WHERE c.projeto_id=$1 ORDER BY c.criado_em DESC`, [req.acessoProjeto!.projetoId])
  res.json({ convites: rows })
})

membersRouter.post('/convites', requireProjectPermission('membros.convidar'), validateBody(inviteSchema), async (req, res) => {
  const rawToken = randomBytes(32).toString('base64url')
  const data = await withTransaction(async (client) => {
    const existing = await client.query(`SELECT 1 FROM membros_projeto mp JOIN usuarios u ON u.id=mp.usuario_id
      WHERE mp.projeto_id=$1 AND LOWER(u.email)=LOWER($2) AND mp.ativo`, [req.acessoProjeto!.projetoId, req.body.email])
    if (existing.rowCount) throw new AppError(409, 'Este usuário já participa do projeto.', 'MEMBRO_EXISTENTE')
    const { rows } = await client.query<{ id: number; projeto_nome: string; autor_nome: string }>(`INSERT INTO convites_projeto
      (projeto_id,email,papel_id,token_hash,expira_em,criado_por)
      SELECT $1,$2,pa.id,$3,NOW()+INTERVAL '7 days',$4 FROM papeis pa WHERE pa.codigo=$5
      RETURNING id,(SELECT nome FROM projetos WHERE id=$1) AS projeto_nome,(SELECT nome FROM usuarios WHERE id=$4) AS autor_nome`, [
      req.acessoProjeto!.projetoId, req.body.email, tokenHash(rawToken), req.usuarioId, req.body.papel,
    ])
    if (!rows[0]) throw new AppError(422, 'Papel inválido.', 'PAPEL_INVALIDO')
    await recordAudit(client, { projetoId: req.acessoProjeto!.projetoId, usuarioId: req.usuarioId!, acao: 'CONVITE_CRIADO', entidade: 'convites_projeto', registroId: rows[0].id, dadosNovos: { email: req.body.email, papel: req.body.papel }, enderecoIp: req.ip })
    return rows[0]
  })
  const link = `${env.webUrl}/convites/${encodeURIComponent(rawToken)}`
  let emailEnviado = false
  try {
    emailEnviado = await sendInvitationEmail({ to: req.body.email, projectName: data.projeto_nome, inviterName: data.autor_nome, inviteUrl: link })
  } catch (error) {
    console.error('Falha ao enviar convite', { conviteId: data.id, error: error instanceof Error ? error.message : 'erro desconhecido' })
  }
  res.status(201).json({ convite: { id: data.id, email: req.body.email, papel: req.body.papel, link, emailEnviado } })
})

membersRouter.post('/convites/:conviteId/reenviar', requireProjectPermission('membros.convidar'), async (req, res) => {
  const invitationId = Number(req.params.conviteId)
  const rawToken = randomBytes(32).toString('base64url')
  const { rows } = await query(`UPDATE convites_projeto SET token_hash=$3,expira_em=NOW()+INTERVAL '7 days',cancelado_em=NULL
    WHERE id=$1 AND projeto_id=$2 AND aceito_em IS NULL RETURNING id,email`, [invitationId, req.acessoProjeto!.projetoId, tokenHash(rawToken)])
  if (!rows[0]) throw new AppError(404, 'Convite pendente não encontrado.', 'CONVITE_NAO_ENCONTRADO')
  res.json({ convite: { ...rows[0], link: `${env.webUrl}/convites/${encodeURIComponent(rawToken)}` } })
})

membersRouter.delete('/convites/:conviteId', requireProjectPermission('membros.convidar'), async (req, res) => {
  const { rowCount } = await query(`UPDATE convites_projeto SET cancelado_em=NOW() WHERE id=$1 AND projeto_id=$2 AND aceito_em IS NULL AND cancelado_em IS NULL`, [
    Number(req.params.conviteId), req.acessoProjeto!.projetoId,
  ])
  if (!rowCount) throw new AppError(404, 'Convite pendente não encontrado.', 'CONVITE_NAO_ENCONTRADO')
  res.status(204).end()
})

membersRouter.put('/:membroId/papel', requireProjectPermission('membros.atualizar'), validateBody(roleSchema), async (req, res) => {
  const memberId = Number(req.params.membroId)
  const { rows } = await query(`UPDATE membros_projeto mp SET papel_id=pa.id FROM papeis pa,projetos p
    WHERE mp.id=$1 AND mp.projeto_id=$2 AND p.id=mp.projeto_id AND p.proprietario_usuario_id<>mp.usuario_id AND pa.codigo=$3
    RETURNING mp.id`, [memberId, req.acessoProjeto!.projetoId, req.body.papel])
  if (!rows[0]) throw new AppError(404, 'Membro não encontrado ou protegido.', 'MEMBRO_PROTEGIDO')
  res.json({ membroId: memberId, papel: req.body.papel })
})

membersRouter.put('/:membroId/permissoes', requireProjectPermission('membros.atualizar'), validateBody(permissionsSchema), async (req, res) => {
  const memberId = Number(req.params.membroId)
  await withTransaction(async (client) => {
    const member = await client.query<{ proprietario: boolean }>(`SELECT (p.proprietario_usuario_id=mp.usuario_id) AS proprietario
      FROM membros_projeto mp JOIN projetos p ON p.id=mp.projeto_id WHERE mp.id=$1 AND mp.projeto_id=$2 AND mp.ativo FOR UPDATE`, [memberId, req.acessoProjeto!.projetoId])
    if (!member.rows[0]) throw new AppError(404, 'Membro não encontrado.', 'MEMBRO_NAO_ENCONTRADO')
    if (member.rows[0].proprietario) throw new AppError(409, 'As permissões essenciais do proprietário são protegidas.', 'PROPRIETARIO_PROTEGIDO')
    for (const permission of req.body.permissoes) {
      if (permission.permitido === null) {
        await client.query(`DELETE FROM permissoes_membro pm USING permissoes pe
          WHERE pm.membro_projeto_id=$1 AND pm.permissao_id=pe.id AND pe.chave=$2`, [memberId, permission.chave])
      } else {
        await client.query(`INSERT INTO permissoes_membro (membro_projeto_id,permissao_id,permitido,atualizado_por)
          SELECT $1,id,$3,$4 FROM permissoes WHERE chave=$2
          ON CONFLICT (membro_projeto_id,permissao_id) DO UPDATE SET permitido=EXCLUDED.permitido,atualizado_por=EXCLUDED.atualizado_por`, [
          memberId, permission.chave, permission.permitido, req.usuarioId,
        ])
      }
    }
    await recordAudit(client, { projetoId: req.acessoProjeto!.projetoId, usuarioId: req.usuarioId!, acao: 'PERMISSOES_ATUALIZADAS', entidade: 'membros_projeto', registroId: memberId, dadosNovos: req.body.permissoes, enderecoIp: req.ip })
  })
  res.status(204).end()
})

membersRouter.delete('/:membroId', requireProjectPermission('membros.excluir'), async (req, res) => {
  const { rows } = await query(`UPDATE membros_projeto mp SET ativo=FALSE FROM projetos p
    WHERE mp.id=$1 AND mp.projeto_id=$2 AND p.id=mp.projeto_id AND p.proprietario_usuario_id<>mp.usuario_id RETURNING mp.id`, [
    Number(req.params.membroId), req.acessoProjeto!.projetoId,
  ])
  if (!rows[0]) throw new AppError(404, 'Membro não encontrado ou proprietário protegido.', 'MEMBRO_PROTEGIDO')
  res.status(204).end()
})
