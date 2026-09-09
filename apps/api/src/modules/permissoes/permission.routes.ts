import { Router } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '../../config/database.js'
import { recordAudit } from '../../shared/audit.js'
import { requireAuth } from '../../shared/auth.js'
import { AppError } from '../../shared/errors.js'
import { requireProjectPermission } from '../../shared/projectAccess.js'
import { validateBody } from '../../shared/validation.js'

const permissionMatrixSchema = z.object({
  permissoes: z.array(z.object({ chave: z.string().min(3).max(120), permitido: z.boolean() })).max(200),
})

type PermissionRow = {
  id: number
  chave: string
  modulo: string
  acao: string
  descricao: string
}

export const permissionsRouter = Router({ mergeParams: true })
permissionsRouter.use(requireAuth)

permissionsRouter.get('/', requireProjectPermission('permissoes.visualizar'), async (req, res) => {
  const [roles, permissions, values] = await Promise.all([
    query(`SELECT id,codigo,nome,descricao FROM papeis WHERE codigo<>'PROPRIETARIO' ORDER BY nome`),
    query<PermissionRow>(`SELECT id,chave,modulo,acao,descricao FROM permissoes WHERE configuravel ORDER BY modulo,
      CASE acao WHEN 'visualizar' THEN 1 WHEN 'inserir' THEN 2 WHEN 'atualizar' THEN 3 WHEN 'excluir' THEN 4 WHEN 'exportar' THEN 5 ELSE 6 END,chave`),
    query(`SELECT pa.id AS papel_id,pe.chave,
      COALESCE(ppp.permitido,pp.permissao_id IS NOT NULL) AS permitido,
      (ppp.permissao_id IS NOT NULL) AS configurado_no_projeto
      FROM papeis pa CROSS JOIN permissoes pe
      LEFT JOIN permissoes_papel pp ON pp.papel_id=pa.id AND pp.permissao_id=pe.id
      LEFT JOIN permissoes_projeto_papel ppp ON ppp.projeto_id=$1 AND ppp.papel_id=pa.id AND ppp.permissao_id=pe.id
      WHERE pa.codigo<>'PROPRIETARIO' AND pe.configuravel ORDER BY pa.nome,pe.modulo,pe.acao`, [req.acessoProjeto!.projetoId]),
  ])
  res.json({ papeis: roles.rows, permissoes: permissions.rows, valores: values.rows })
})

permissionsRouter.put('/papeis/:papelId', requireProjectPermission('permissoes.atualizar'), validateBody(permissionMatrixSchema), async (req, res) => {
  const roleId = Number(req.params.papelId)
  if (!Number.isSafeInteger(roleId) || roleId <= 0) throw new AppError(400, 'Papel inválido.', 'PAPEL_INVALIDO')

  await withTransaction(async (client) => {
    const role = await client.query<{ codigo: string; nome: string }>('SELECT codigo,nome FROM papeis WHERE id=$1 FOR UPDATE', [roleId])
    if (!role.rows[0]) throw new AppError(404, 'Papel não encontrado.', 'PAPEL_NAO_ENCONTRADO')
    if (role.rows[0].codigo === 'PROPRIETARIO') throw new AppError(409, 'As permissões do proprietário são protegidas.', 'PAPEL_PROTEGIDO')

    const available = await client.query<PermissionRow>('SELECT id,chave,modulo,acao,descricao FROM permissoes WHERE configuravel ORDER BY id')
    const submitted = new Map<string, boolean>(req.body.permissoes.map((item: { chave: string; permitido: boolean }) => [item.chave, item.permitido]))
    if (submitted.size !== available.rows.length || available.rows.some((permission) => !submitted.has(permission.chave))) {
      throw new AppError(422, 'Envie a matriz completa de permissões configuráveis.', 'MATRIZ_PERMISSOES_INCOMPLETA')
    }

    const normalized = available.rows.map((permission) => {
      let allowed = Boolean(submitted.get(permission.chave))
      if (permission.acao !== 'visualizar') {
        const view = available.rows.find((candidate) => candidate.modulo === permission.modulo && candidate.acao === 'visualizar')
        if (view && !submitted.get(view.chave)) allowed = false
      }
      return { ...permission, permitido: allowed }
    })

    for (const permission of normalized) {
      await client.query(`INSERT INTO permissoes_projeto_papel (projeto_id,papel_id,permissao_id,permitido,atualizado_por)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (projeto_id,papel_id,permissao_id) DO UPDATE
        SET permitido=EXCLUDED.permitido,atualizado_por=EXCLUDED.atualizado_por`, [
        req.acessoProjeto!.projetoId, roleId, permission.id, permission.permitido, req.usuarioId,
      ])
    }
    await recordAudit(client, {
      projetoId: req.acessoProjeto!.projetoId,
      usuarioId: req.usuarioId!,
      acao: 'PERMISSOES_PAPEL_PROJETO_ATUALIZADAS',
      entidade: 'permissoes_projeto_papel',
      registroId: roleId,
      dadosNovos: { papel: role.rows[0].codigo, permissoes: normalized.map(({ chave, permitido }) => ({ chave, permitido })) },
      enderecoIp: req.ip,
    })
  })
  res.status(204).end()
})
