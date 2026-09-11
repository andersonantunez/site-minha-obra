import { Router } from 'express'
import { query, withTransaction } from '../../config/database.js'
import { requireAuth } from '../../shared/auth.js'
import { recordAudit } from '../../shared/audit.js'
import { AppError } from '../../shared/errors.js'
import { requireProjectPermission } from '../../shared/projectAccess.js'
import { validateBody } from '../../shared/validation.js'
import { projectArchiveSchema, projectInputSchema } from './project.schemas.js'
import { createProject, listUserProjects } from './project.service.js'

export const projectsRouter = Router()
projectsRouter.use(requireAuth)

projectsRouter.get('/', async (req, res) => {
  const status = String(req.query.status || 'ATIVOS')
  if (!['ATIVOS', 'ARQUIVADOS', 'TODOS'].includes(status)) throw new AppError(422, 'Status de projeto inválido.', 'STATUS_PROJETO_INVALIDO')
  res.json({ projetos: await listUserProjects(req.usuarioId!, status as 'ATIVOS' | 'ARQUIVADOS' | 'TODOS') })
})

projectsRouter.post('/', validateBody(projectInputSchema), async (req, res) => {
  const project = await createProject(req.usuarioId!, req.body, req.ip)
  res.status(201).json({ projeto: project })
})

projectsRouter.get('/:projetoId', requireProjectPermission('projeto.visualizar'), async (req, res) => {
  const { rows } = await query(`SELECT p.id,p.nome,$2::varchar AS papel
    FROM projetos p WHERE p.id=$1 AND p.excluido_em IS NULL`, [req.acessoProjeto!.projetoId, req.acessoProjeto!.papel])
  res.json({ projeto: rows[0], permissoes: [...req.acessoProjeto!.permissoes], proprietario: req.acessoProjeto!.proprietario, administradorSistema: req.acessoProjeto!.administradorSistema })
})

projectsRouter.get('/:projetoId/configuracoes', requireProjectPermission('configuracoes.visualizar'), async (req, res) => {
  const { rows } = await query(`SELECT p.*,$2::varchar AS papel
    FROM projetos p WHERE p.id=$1 AND p.excluido_em IS NULL`, [req.acessoProjeto!.projetoId, req.acessoProjeto!.papel])
  res.json({ projeto: rows[0], permissoes: [...req.acessoProjeto!.permissoes], proprietario: req.acessoProjeto!.proprietario, administradorSistema: req.acessoProjeto!.administradorSistema })
})

projectsRouter.put('/:projetoId/configuracoes', requireProjectPermission('configuracoes.atualizar'), validateBody(projectInputSchema), async (req, res) => {
  const project = await withTransaction(async (client) => {
    const before = await client.query('SELECT * FROM projetos WHERE id=$1 AND excluido_em IS NULL FOR UPDATE', [req.acessoProjeto!.projetoId])
    if (!before.rows[0]) throw new AppError(404, 'Projeto não encontrado.', 'PROJETO_NAO_ENCONTRADO')
    const input = req.body
    const totalArea = Number(input.areaComLaje || 0) + Number(input.areaSemLaje || 0)
    const { rows } = await client.query(`UPDATE projetos SET nome=$2,descricao=$3,endereco=$4,logradouro=$4,numero=$5,complemento=$6,
      bairro=$7,cep=$8,cidade=$9,estado=$10,codigo_ibge_cidade=$11,latitude=$12,longitude=$13,area_com_laje=$14,
      area_sem_laje=$15,area_construida=$16,processo_aprovacao=$17,pasta_digital=$18,planta_numero=$19,alvara=$20,
      art=$21,cno_obra=$22,matricula_terreno=$23,data_inicio=$24,previsao_termino=$25 WHERE id=$1 RETURNING *`, [
      req.acessoProjeto!.projetoId,input.nome,input.descricao,input.logradouro,input.numero,input.complemento,input.bairro,input.cep,
      input.cidade,input.estado,input.codigoIbgeCidade,input.latitude,input.longitude,input.areaComLaje,input.areaSemLaje,totalArea || null,
      input.processoAprovacao,input.pastaDigital,input.plantaNumero,input.alvara,input.art,input.cnoObra,input.matriculaTerreno,input.dataInicio,input.previsaoTermino,
    ])
    await recordAudit(client, { projetoId: req.acessoProjeto!.projetoId, usuarioId: req.usuarioId!, acao: 'PROJETO_ATUALIZADO', entidade: 'projetos', registroId: req.acessoProjeto!.projetoId, dadosAnteriores: before.rows[0], dadosNovos: rows[0], enderecoIp: req.ip })
    return rows[0]
  })
  res.json({ projeto: project })
})

projectsRouter.put('/:projetoId/arquivamento', requireProjectPermission('configuracoes.atualizar'), validateBody(projectArchiveSchema), async (req, res) => {
  if (!req.acessoProjeto!.proprietario && !req.acessoProjeto!.administradorSistema) throw new AppError(403, 'Somente o proprietário pode alterar o arquivamento do projeto.', 'ACESSO_NEGADO')
  const project = await withTransaction(async (client) => {
    const before = await client.query('SELECT * FROM projetos WHERE id=$1 AND excluido_em IS NULL FOR UPDATE', [req.acessoProjeto!.projetoId])
    if (!before.rows[0]) throw new AppError(404, 'Projeto não encontrado.', 'PROJETO_NAO_ENCONTRADO')
    const { rows } = await client.query(`UPDATE projetos
      SET arquivado_em=CASE WHEN $2 THEN COALESCE(arquivado_em,NOW()) ELSE NULL END
      WHERE id=$1
      RETURNING id,nome,arquivado_em`, [req.acessoProjeto!.projetoId, req.body.arquivado])
    const action = req.body.arquivado ? 'PROJETO_ARQUIVADO' : 'PROJETO_REATIVADO'
    await recordAudit(client, { projetoId: req.acessoProjeto!.projetoId, usuarioId: req.usuarioId!, acao: action, entidade: 'projetos', registroId: req.acessoProjeto!.projetoId, dadosAnteriores: before.rows[0], dadosNovos: rows[0], enderecoIp: req.ip })
    return rows[0]
  })
  res.json({ projeto: project })
})

projectsRouter.delete('/:projetoId', requireProjectPermission('projeto.atualizar'), async (req, res) => {
  if (!req.acessoProjeto!.proprietario && !req.acessoProjeto!.administradorSistema) throw new AppError(403, 'Somente o proprietário pode excluir o projeto.', 'ACESSO_NEGADO')
  await withTransaction(async (client) => {
    const { rows } = await client.query('UPDATE projetos SET excluido_em=NOW() WHERE id=$1 AND excluido_em IS NULL RETURNING *', [req.acessoProjeto!.projetoId])
    if (!rows[0]) throw new AppError(404, 'Projeto não encontrado.', 'PROJETO_NAO_ENCONTRADO')
    await recordAudit(client, { projetoId: req.acessoProjeto!.projetoId, usuarioId: req.usuarioId!, acao: 'PROJETO_EXCLUIDO', entidade: 'projetos', registroId: req.acessoProjeto!.projetoId, dadosAnteriores: rows[0], enderecoIp: req.ip })
  })
  res.status(204).end()
})
