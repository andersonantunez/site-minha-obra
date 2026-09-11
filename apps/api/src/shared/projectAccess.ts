import type { RequestHandler } from 'express'
import { query } from '../config/database.js'
import { AppError } from './errors.js'
import type { ProjectAccess } from './types.js'

type AccessRow = {
  membro_id: number
  usuario_id: number
  projeto_id: number
  papel: string
  proprietario: boolean
  permissao: string | null
  modulo: string | null
  acao: string | null
  permitido: boolean | null
}

export async function getProjectAccess(userId: number, projectId: number): Promise<ProjectAccess> {
  const context = await query<{ administrador_sistema: boolean }>(`SELECT usuario_eh_administrador_sistema(u.id) AS administrador_sistema
    FROM usuarios u CROSS JOIN projetos p
    WHERE u.id=$1 AND u.ativo AND p.id=$2 AND p.excluido_em IS NULL`, [userId, projectId])
  if (!context.rows[0]) throw new AppError(404, 'Projeto não encontrado.', 'PROJETO_NAO_ENCONTRADO')
  if (context.rows[0].administrador_sistema) {
    const permissions = await query<{ chave: string }>('SELECT chave FROM permissoes')
    return {
      projetoId: projectId,
      membroProjetoId: 0,
      usuarioId: userId,
      papel: 'ADMINISTRADOR_SISTEMA',
      proprietario: false,
      administradorSistema: true,
      permissoes: new Set(permissions.rows.map((permission) => permission.chave)),
    }
  }
  const { rows } = await query<AccessRow>(`
    SELECT mp.id AS membro_id, mp.usuario_id, mp.projeto_id, pa.codigo AS papel,
      (p.proprietario_usuario_id=mp.usuario_id) AS proprietario,
      pe.chave AS permissao,pe.modulo,pe.acao,
      COALESCE(pm.permitido, ppp.permitido, pp.permissao_id IS NOT NULL) AS permitido
    FROM membros_projeto mp
    JOIN projetos p ON p.id=mp.projeto_id AND p.excluido_em IS NULL
    JOIN papeis pa ON pa.id=mp.papel_id
    LEFT JOIN permissoes pe ON TRUE
    LEFT JOIN permissoes_papel pp ON pp.papel_id=mp.papel_id AND pp.permissao_id=pe.id
    LEFT JOIN permissoes_projeto_papel ppp ON ppp.projeto_id=mp.projeto_id AND ppp.papel_id=mp.papel_id AND ppp.permissao_id=pe.id
    LEFT JOIN permissoes_membro pm ON pm.membro_projeto_id=mp.id AND pm.permissao_id=pe.id
    WHERE mp.projeto_id=$1 AND mp.usuario_id=$2 AND mp.ativo`, [projectId, userId])
  if (!rows.length) throw new AppError(404, 'Projeto não encontrado.', 'PROJETO_NAO_ENCONTRADO')
  const first = rows[0]!
  const visibleModules = new Set(rows.filter((row) => row.acao === 'visualizar' && row.permitido).map((row) => row.modulo))
  const modulesWithViewPermission = new Set(rows.filter((row) => row.acao === 'visualizar').map((row) => row.modulo))
  return {
    projetoId: first.projeto_id,
    membroProjetoId: first.membro_id,
    usuarioId: first.usuario_id,
    papel: first.papel,
    proprietario: first.proprietario,
    administradorSistema: false,
    permissoes: new Set(rows.filter((row) => row.permissao && row.permitido && (row.acao === 'visualizar' || !modulesWithViewPermission.has(row.modulo) || visibleModules.has(row.modulo))).map((row) => row.permissao!)),
  }
}

export function requireProjectPermission(permission: string): RequestHandler {
  return async (req, _res, next) => {
    if (!req.usuarioId) throw new AppError(401, 'Autenticação necessária.', 'NAO_AUTENTICADO')
    const projectId = Number(req.params.projetoId)
    if (!Number.isSafeInteger(projectId) || projectId <= 0) throw new AppError(400, 'Projeto inválido.', 'PROJETO_INVALIDO')
    const access = await getProjectAccess(req.usuarioId, projectId)
    if (!access.administradorSistema && !access.proprietario && !access.permissoes.has(permission)) {
      throw new AppError(403, 'Você não possui permissão para esta operação.', 'ACESSO_NEGADO')
    }
    req.acessoProjeto = access
    next()
  }
}

export const requireSystemAdmin: RequestHandler = async (req, _res, next) => {
  if (!req.usuarioId) throw new AppError(401, 'Autenticação necessária.', 'NAO_AUTENTICADO')
  if (!await isSystemAdmin(req.usuarioId)) throw new AppError(403, 'Área restrita à administração do sistema.', 'ACESSO_NEGADO')
  next()
}

export async function isSystemAdmin(userId: number) {
  const { rows } = await query<{ administrador_sistema: boolean }>('SELECT usuario_eh_administrador_sistema($1) AS administrador_sistema', [userId])
  return Boolean(rows[0]?.administrador_sistema)
}
