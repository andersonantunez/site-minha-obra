import { Router } from 'express'
import { getCashFlowReport, createCashFlowPdf } from '../relatorios/planning-report.service.js'
import { query } from '../../config/database.js'
import { requireAuth } from '../../shared/auth.js'
import { AppError } from '../../shared/errors.js'
import { requireProjectPermission } from '../../shared/projectAccess.js'
import { readStoredFile } from '../../shared/storage.js'
import { PAYMENT_STATUS, SETTLED_PAYMENT_STATUSES } from '../pagamentos/payment-status.js'
import { paymentFinancialCte } from '../pagamentos/purchase-financial.query.js'

export const dashboardRouter = Router({ mergeParams: true })
dashboardRouter.use(requireAuth)

dashboardRouter.get('/', requireProjectPermission('visao_geral.visualizar'), async (req, res) => {
  const projectId = req.acessoProjeto!.projetoId
  const [project, metrics, evolution, distribution, suppliers, recentPayments, nextStages, recentDocuments, activity] = await Promise.all([
    query(`SELECT p.id,p.nome,p.descricao,p.data_inicio,p.previsao_termino,
      p.area_construida,p.area_com_laje,p.area_sem_laje,p.cidade,p.estado,p.bairro,p.logradouro,p.numero,p.latitude,p.longitude,
      p.processo_aprovacao,p.pasta_digital,p.planta_numero,p.alvara,p.art,p.cno_obra,p.matricula_terreno,
      presentation.id AS imagem_apresentacao_id,presentation.url AS imagem_apresentacao_url
      FROM projetos p
      LEFT JOIN LATERAL (SELECT d.id,d.url FROM documentos_projeto d JOIN documentos_projeto_categorias dc ON dc.documento_id=d.id JOIN categorias_documento c ON c.id=dc.categoria_id WHERE d.projeto_id=p.id
        AND lower(c.nome)=lower('Imagem de Apresentação') AND c.excluido_em IS NULL AND d.excluido_em IS NULL
        ORDER BY d.criado_em DESC,d.id DESC LIMIT 1) presentation ON TRUE
      WHERE p.id=$1 AND p.excluido_em IS NULL`, [projectId]),
    query(`WITH ${paymentFinancialCte} SELECT
      COALESCE((SELECT SUM(valor) FROM itens_orcamento WHERE projeto_id=$1 AND excluido_em IS NULL AND valor>0 AND competencia<=CURRENT_DATE),0)::numeric(15,2) AS orcamento_atual,
      COALESCE((SELECT SUM(valor) FROM itens_orcamento WHERE projeto_id=$1 AND excluido_em IS NULL AND valor>0),0)::numeric(15,2) AS orcamento_com_provisao,
      COALESCE((SELECT SUM(valor) FROM itens_orcamento WHERE projeto_id=$1 AND excluido_em IS NULL AND valor>0 AND competencia>CURRENT_DATE),0)::numeric(15,2) AS total_provisionado,
      COALESCE((SELECT SUM(valor) FROM itens_orcamento WHERE projeto_id=$1 AND excluido_em IS NULL AND valor>0),0)::numeric(15,2) AS orcamento_total,
      COALESCE((SELECT SUM(valor) FROM pagamentos_financeiros WHERE projeto_id=$1),0)::numeric(15,2) AS comprometido,
      COALESCE((SELECT SUM(valor) FROM pagamentos_financeiros WHERE projeto_id=$1 AND status=ANY($2::varchar[])),0)::numeric(15,2) AS pago,
      COALESCE((SELECT SUM(valor) FROM pagamentos_financeiros WHERE projeto_id=$1 AND status=ANY($2::varchar[])),0)::numeric(15,2) AS total_pagamentos,
      COALESCE((SELECT SUM(valor) FROM pagamentos_financeiros WHERE projeto_id=$1 AND status=$3),0)::numeric(15,2) AS pago_aguardando_entrega,
      COALESCE((SELECT SUM(valor) FROM pagamentos_financeiros WHERE projeto_id=$1 AND status=$4),0)::numeric(15,2) AS concluido,
      COALESCE((SELECT SUM(valor) FROM pagamentos_financeiros WHERE projeto_id=$1 AND status=$5),0)::numeric(15,2) AS em_negociacao,
      COALESCE((SELECT SUM(valor) FROM pagamentos_financeiros WHERE projeto_id=$1 AND status=$6),0)::numeric(15,2) AS pendente,
      (SELECT COUNT(*)::int FROM cronogramas WHERE projeto_id=$1 AND parent_id IS NULL AND excluido_em IS NULL AND data_fim IS NOT NULL AND data_fim<=CURRENT_DATE) AS etapas_concluidas,
      (SELECT COUNT(*)::int FROM cronogramas WHERE projeto_id=$1 AND parent_id IS NULL AND excluido_em IS NULL AND data_inicio<=CURRENT_DATE AND (data_fim IS NULL OR data_fim>CURRENT_DATE)) AS etapas_em_andamento,
      COALESCE((SELECT ROUND(AVG(CASE WHEN data_fim IS NOT NULL AND data_fim<=CURRENT_DATE THEN 100 WHEN data_inicio<=CURRENT_DATE THEN 50 ELSE 0 END)) FROM cronogramas WHERE projeto_id=$1 AND parent_id IS NULL AND excluido_em IS NULL),0) AS percentual_andamento`, [projectId,SETTLED_PAYMENT_STATUSES,PAYMENT_STATUS.PAGO_AGUARDANDO_ENTREGA,PAYMENT_STATUS.CONCLUIDO,PAYMENT_STATUS.EM_NEGOCIACAO,PAYMENT_STATUS.PENDENTE]),
    query(`WITH ${paymentFinancialCte}, meses AS (
      SELECT competencia AS mes,SUM(valor) AS previsto FROM itens_orcamento WHERE projeto_id=$1 AND excluido_em IS NULL GROUP BY competencia
    ), pagos AS (
      SELECT DATE_TRUNC('month',data_pagamento)::date AS mes,SUM(valor) AS realizado FROM pagamentos_financeiros
      WHERE projeto_id=$1 AND status=ANY($2::varchar[]) AND data_pagamento IS NOT NULL GROUP BY 1
    ) SELECT COALESCE(m.mes,pg.mes) AS mes,COALESCE(m.previsto,0)::numeric(15,2) AS previsto,
      COALESCE(pg.realizado,0)::numeric(15,2) AS realizado FROM meses m FULL JOIN pagos pg ON pg.mes=m.mes ORDER BY mes`, [projectId,SETTLED_PAYMENT_STATUSES]),
    query(`WITH ${paymentFinancialCte} SELECT COALESCE('ETAPA ' || COALESCE(pai.ordem,e.ordem)::text || ' - ' || COALESCE(pai.nome,e.nome),'Sem etapa') AS etapa,
      COALESCE(SUM(p.valor),0)::numeric(15,2) AS total FROM pagamentos_financeiros p
      LEFT JOIN cronogramas e ON e.id=p.etapa_id LEFT JOIN cronogramas pai ON pai.id=e.parent_id
      WHERE p.projeto_id=$1 AND p.status=ANY($2::varchar[])
      GROUP BY COALESCE('ETAPA ' || COALESCE(pai.ordem,e.ordem)::text || ' - ' || COALESCE(pai.nome,e.nome),'Sem etapa') ORDER BY total DESC`, [projectId,SETTLED_PAYMENT_STATUSES]),
    query(`WITH ${paymentFinancialCte} SELECT COALESCE(NULLIF(TRIM(p.fornecedor),''),'Não informado') AS fornecedor,
      COALESCE(SUM(p.valor),0)::numeric(15,2) AS total FROM pagamentos_financeiros p
      WHERE p.projeto_id=$1 AND p.status=ANY($2::varchar[])
      GROUP BY COALESCE(NULLIF(TRIM(p.fornecedor),''),'Não informado') ORDER BY total DESC LIMIT 10`, [projectId,SETTLED_PAYMENT_STATUSES]),
    query(`WITH ${paymentFinancialCte} SELECT p.id,p.descricao,p.fornecedor,p.descricao AS item,p.valor,p.forma_pagamento,p.data_pagamento
      FROM pagamentos_financeiros p WHERE p.projeto_id=$1 AND p.status=ANY($2::varchar[])
      ORDER BY p.data_pagamento DESC,p.id DESC LIMIT 6`, [projectId,SETTLED_PAYMENT_STATUSES]),
    query(`SELECT id,nome,data_inicio,data_fim,valor_previsto FROM cronogramas WHERE projeto_id=$1 AND parent_id IS NULL AND excluido_em IS NULL
      AND (data_fim IS NULL OR data_fim>CURRENT_DATE) ORDER BY COALESCE(data_inicio,'9999-12-31'),ordem LIMIT 6`, [projectId]),
    query(`SELECT id,titulo,categoria AS tipo,criado_em FROM documentos_projeto
      WHERE projeto_id=$1 AND excluido_em IS NULL ORDER BY criado_em DESC LIMIT 6`, [projectId]),
    query(`SELECT ra.id,ra.acao,ra.entidade,ra.registro_id,ra.criado_em,u.nome AS usuario
      FROM registros_auditoria ra LEFT JOIN usuarios u ON u.id=ra.usuario_id
      WHERE ra.projeto_id=$1 ORDER BY ra.criado_em DESC LIMIT 8`, [projectId]),
  ])
  if (!project.rows[0]) throw new AppError(404, 'Projeto não encontrado.', 'PROJETO_NAO_ENCONTRADO')
  res.json({ projeto: project.rows[0], indicadores: metrics.rows[0], evolucaoFinanceira: evolution.rows, distribuicaoEtapas: distribution.rows, fornecedores: suppliers.rows, ultimosPagamentos: recentPayments.rows, proximasEtapas: nextStages.rows, documentosRecentes: recentDocuments.rows, atividadesRecentes: activity.rows })
})

dashboardRouter.get('/imagem-apresentacao', requireProjectPermission('visao_geral.visualizar'), async (req, res) => {
  const { rows } = await query<{ caminho_arquivo: string | null; tipo_mime: string | null }>(`SELECT d.caminho_arquivo,d.tipo_mime
    FROM documentos_projeto d JOIN documentos_projeto_categorias dc ON dc.documento_id=d.id JOIN categorias_documento c ON c.id=dc.categoria_id WHERE d.projeto_id=$1 AND lower(c.nome)=lower('Imagem de Apresentação')
      AND c.excluido_em IS NULL AND d.excluido_em IS NULL AND d.caminho_arquivo IS NOT NULL ORDER BY d.criado_em DESC,d.id DESC LIMIT 1`, [req.acessoProjeto!.projetoId])
  const image = rows[0]
  if (!image?.caminho_arquivo || !image.tipo_mime?.startsWith('image/')) throw new AppError(404, 'Imagem de apresentação não encontrada.', 'IMAGEM_APRESENTACAO_NAO_ENCONTRADA')
  res.setHeader('Content-Type', image.tipo_mime)
  res.setHeader('Content-Disposition', 'inline')
  res.setHeader('Cache-Control', 'private, max-age=300')
  res.send(await readStoredFile(image.caminho_arquivo))
})

dashboardRouter.get('/indicadores', requireProjectPermission('pagamentos.visualizar'), async (req, res) => {
  const competence = String(req.query.competencia || '')
  if (!/^\d{4}-\d{2}$/.test(competence)) throw new AppError(422, 'Informe a competência no formato AAAA-MM.', 'COMPETENCIA_INVALIDA')
  const start = `${competence}-01`
  const projectId = req.acessoProjeto!.projetoId
  const [metrics, suppliers, stages, evolution] = await Promise.all([
    query(`WITH ${paymentFinancialCte} SELECT
      COALESCE((SELECT SUM(valor) FROM itens_orcamento WHERE projeto_id=$1 AND competencia=$2::date AND excluido_em IS NULL),0)::numeric(15,2) AS orcamento_previsto,
      COALESCE(SUM(p.valor),0)::numeric(15,2) AS comprometido,
      COALESCE(SUM(p.valor) FILTER (WHERE p.status=ANY($3::varchar[])),0)::numeric(15,2) AS pago,
      COALESCE(SUM(p.valor) FILTER (WHERE p.status=$4),0)::numeric(15,2) AS pago_aguardando_entrega,
      COALESCE(SUM(p.valor) FILTER (WHERE p.status=$5),0)::numeric(15,2) AS concluido,
      COALESCE(SUM(p.valor) FILTER (WHERE p.status=$6),0)::numeric(15,2) AS em_negociacao,
      COALESCE(SUM(p.valor) FILTER (WHERE p.status=$7),0)::numeric(15,2) AS pendente
      FROM pagamentos_financeiros p WHERE p.projeto_id=$1
      AND DATE_TRUNC('month',COALESCE(p.data_pagamento,p.data_agendamento,p.criado_em))=$2::date`, [projectId,start,SETTLED_PAYMENT_STATUSES,PAYMENT_STATUS.PAGO_AGUARDANDO_ENTREGA,PAYMENT_STATUS.CONCLUIDO,PAYMENT_STATUS.EM_NEGOCIACAO,PAYMENT_STATUS.PENDENTE]),
    query(`WITH ${paymentFinancialCte} SELECT COALESCE(p.fornecedor,'Não informado') AS fornecedor,SUM(p.valor)::numeric(15,2) AS total
      FROM pagamentos_financeiros p WHERE p.projeto_id=$1 AND DATE_TRUNC('month',COALESCE(p.data_pagamento,p.data_agendamento,p.criado_em))=$2::date
      GROUP BY p.fornecedor ORDER BY total DESC LIMIT 8`, [projectId,start]),
    query(`WITH ${paymentFinancialCte} SELECT COALESCE(pai.nome,e.nome,'Sem etapa') AS etapa,SUM(p.valor)::numeric(15,2) AS total
      FROM pagamentos_financeiros p LEFT JOIN cronogramas e ON e.id=p.etapa_id LEFT JOIN cronogramas pai ON pai.id=e.parent_id
      WHERE p.projeto_id=$1 AND DATE_TRUNC('month',COALESCE(p.data_pagamento,p.data_agendamento,p.criado_em))=$2::date
      GROUP BY COALESCE(pai.nome,e.nome,'Sem etapa') ORDER BY total DESC LIMIT 8`, [projectId,start]),
    query(`WITH ${paymentFinancialCte} SELECT DATE_TRUNC('month',p.data_pagamento)::date AS mes,SUM(p.valor)::numeric(15,2) AS pago
      FROM pagamentos_financeiros p WHERE p.projeto_id=$1 AND p.status=ANY($2::varchar[]) AND p.data_pagamento IS NOT NULL
      GROUP BY 1 ORDER BY 1`, [projectId,SETTLED_PAYMENT_STATUSES]),
  ])
  const values = metrics.rows[0] as Record<string, string>
  const budget = Number(values.orcamento_previsto)
  const committed = Number(values.comprometido)
  res.json({ indicadores: { ...values, diferenca_orcamento_realizado: (budget - committed).toFixed(2), percentual_executado: budget ? ((committed / budget) * 100).toFixed(2) : '0.00' }, principaisFornecedores: suppliers.rows, principaisEtapas: stages.rows, evolucaoMensal: evolution.rows })
})

dashboardRouter.get('/relatorio.pdf', requireProjectPermission('pagamentos.exportar'), async (req, res) => {
  const projectId = req.acessoProjeto!.projetoId
  const competence = String(req.query.competencia || new Date().toISOString().slice(0, 7))
  if (!/^\d{4}-\d{2}$/.test(competence)) throw new AppError(422, 'Competência inválida.', 'COMPETENCIA_INVALIDA')
  const start = `${competence}-01`
  const end = new Date(Date.UTC(Number(competence.slice(0,4)),Number(competence.slice(5)),0)).toISOString().slice(0,10)
  const report = await getCashFlowReport(projectId,{search:'',start,end,includeFuture:true})
  const document = createCashFlowPdf(report)
  res.setHeader('Content-Type','application/pdf')
  res.setHeader('Content-Disposition',`inline; filename="relatorio-${competence}.pdf"`)
  document.pipe(res)
  document.end()
})
