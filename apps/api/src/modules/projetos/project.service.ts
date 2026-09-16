import type { PoolClient } from 'pg'
import { query, withTransaction } from '../../config/database.js'
import { recordAudit } from '../../shared/audit.js'
import { AppError } from '../../shared/errors.js'
import type { z } from 'zod'
import type { projectInputSchema } from './project.schemas.js'

type ProjectInput = z.infer<typeof projectInputSchema>

export async function createProject(userId: number, input: ProjectInput, ip?: string) {
  return withTransaction(async (client) => {
    const userResult = await client.query<{ limite_projetos_proprios: number | null }>(`
      SELECT p.limite_projetos_proprios FROM usuarios u JOIN planos p ON p.id=u.plano_id
      WHERE u.id=$1 AND u.ativo FOR UPDATE OF u`, [userId])
    const user = userResult.rows[0]
    if (!user) throw new AppError(401, 'Usuário inválido.', 'NAO_AUTENTICADO')
    if (user.limite_projetos_proprios !== null) {
      const countResult = await client.query<{ total: number }>(
        'SELECT COUNT(*)::int AS total FROM projetos WHERE proprietario_usuario_id=$1 AND excluido_em IS NULL AND arquivado_em IS NULL', [userId],
      )
      if (countResult.rows[0]!.total >= user.limite_projetos_proprios) {
        throw new AppError(409, 'Seu plano permite apenas um projeto próprio ativo.', 'LIMITE_PLANO_FREE')
      }
    }
    const { rows } = await client.query<{ id: number }>(`INSERT INTO projetos
      (proprietario_usuario_id,nome,descricao,endereco,logradouro,numero,cidade,estado,data_inicio,previsao_termino,area_construida)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [
      userId,input.nome,input.descricao,input.endereco,input.logradouro,input.numero,input.cidade,input.estado,
      input.dataInicio,input.previsaoTermino,input.areaConstruida,
    ])
    const projectId = rows[0]!.id
    await client.query(`INSERT INTO membros_projeto (projeto_id,usuario_id,papel_id)
      SELECT $1,$2,id FROM papeis WHERE codigo='PROPRIETARIO'`, [projectId, userId])
    await client.query(`INSERT INTO categorias_documento (projeto_id,nome,criado_por) VALUES
      ($1,'Despesas',$2),($1,'Render',$2),($1,'Planta Executiva',$2),($1,'Planta Hidráulica',$2),
      ($1,'Planta Elétrica',$2),($1,'Planta Estrutural',$2),($1,'Liberação Prefeitura',$2),
      ($1,'Contrato',$2),($1,'Unificação dos Terrenos',$2),($1,'Consórcio',$2),($1,'INSS Obras',$2),
      ($1,'Financiamento Caixa',$2),($1,'Consórcio Sicredi',$2),($1,'Outros',$2)`, [projectId,userId])
    await recordAudit(client, { projetoId: projectId, usuarioId: userId, acao: 'PROJETO_CRIADO', entidade: 'projetos', registroId: projectId, dadosNovos: input, enderecoIp: ip })
    return getProjectById(client, projectId)
  })
}

async function getProjectById(client: PoolClient, projectId: number) {
  const { rows } = await client.query(`SELECT p.id,p.nome,p.descricao,p.endereco,p.cidade,p.estado,
    p.data_inicio,p.previsao_termino,p.area_construida,p.proprietario_usuario_id,p.criado_em,p.atualizado_em
    FROM projetos p WHERE p.id=$1 AND p.excluido_em IS NULL`, [projectId])
  return rows[0]
}

export async function listUserProjects(userId: number, status: 'ATIVOS' | 'ARQUIVADOS' | 'TODOS' = 'ATIVOS') {
  const archiveFilter = status === 'ATIVOS' ? 'AND p.arquivado_em IS NULL' : status === 'ARQUIVADOS' ? 'AND p.arquivado_em IS NOT NULL' : ''
  const { rows } = await query(`SELECT p.id,p.nome,p.descricao,p.cidade,p.estado,p.bairro,
    p.data_inicio,p.previsao_termino,p.arquivado_em,
    p.area_construida,CASE WHEN usuario_eh_administrador_sistema(acesso.id) THEN 'ADMINISTRADOR_SISTEMA' ELSE pa.codigo END AS papel,
    (p.proprietario_usuario_id=$1) AS proprietario,
    presentation.id AS imagem_apresentacao_id,presentation.url AS imagem_apresentacao_url,
    COALESCE((SELECT ROUND(AVG(CASE WHEN e.data_fim IS NOT NULL AND e.data_fim <= CURRENT_DATE THEN 100
      WHEN e.data_inicio IS NOT NULL AND e.data_inicio <= CURRENT_DATE THEN 50 ELSE 0 END)) FROM cronogramas e
      WHERE e.projeto_id=p.id AND e.excluido_em IS NULL),0) AS percentual_andamento
    FROM usuarios acesso
    JOIN projetos p ON p.excluido_em IS NULL
    LEFT JOIN membros_projeto mp ON mp.projeto_id=p.id AND mp.usuario_id=$1 AND mp.ativo
    LEFT JOIN papeis pa ON pa.id=mp.papel_id
    LEFT JOIN LATERAL (SELECT d.id,d.url FROM documentos_projeto d JOIN documentos_projeto_categorias dc ON dc.documento_id=d.id JOIN categorias_documento c ON c.id=dc.categoria_id WHERE d.projeto_id=p.id
      AND lower(c.nome)=lower('Imagem de Apresentação') AND c.excluido_em IS NULL AND d.excluido_em IS NULL ORDER BY d.criado_em DESC,d.id DESC LIMIT 1) presentation ON TRUE
    WHERE acesso.id=$1 AND acesso.ativo AND (usuario_eh_administrador_sistema(acesso.id) OR mp.id IS NOT NULL)
    ${archiveFilter}
    ORDER BY (p.arquivado_em IS NOT NULL),p.atualizado_em DESC`, [userId])
  return rows
}
