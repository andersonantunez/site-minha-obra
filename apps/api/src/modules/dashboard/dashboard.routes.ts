import { Router } from 'express'
import PDFDocument from 'pdfkit'
import { query } from '../../config/database.js'
import { requireAuth } from '../../shared/auth.js'
import { AppError } from '../../shared/errors.js'
import { requireProjectPermission } from '../../shared/projectAccess.js'
import { readStoredFile } from '../../shared/storage.js'
import { PAYMENT_STATUS, SETTLED_PAYMENT_STATUSES } from '../pagamentos/payment-status.js'

export const dashboardRouter = Router({ mergeParams: true })
dashboardRouter.use(requireAuth)

dashboardRouter.get('/', requireProjectPermission('visao_geral.visualizar'), async (req, res) => {
  const projectId = req.acessoProjeto!.projetoId
  const [project, metrics, evolution, distribution, recentPayments, nextStages, recentDocuments, activity] = await Promise.all([
    query(`SELECT p.id,p.nome,p.descricao,p.data_inicio,p.previsao_termino,
      p.area_construida,p.area_com_laje,p.area_sem_laje,p.cidade,p.estado,p.bairro,p.logradouro,p.numero,p.latitude,p.longitude,
      p.processo_aprovacao,p.pasta_digital,p.planta_numero,p.alvara,p.art,p.cno_obra,p.matricula_terreno,
      presentation.id AS imagem_apresentacao_id,presentation.url AS imagem_apresentacao_url
      FROM projetos p
      LEFT JOIN LATERAL (SELECT d.id,d.url FROM documentos_projeto d JOIN documentos_projeto_categorias dc ON dc.documento_id=d.id JOIN categorias_documento c ON c.id=dc.categoria_id WHERE d.projeto_id=p.id
        AND lower(c.nome)=lower('Imagem de Apresentação') AND c.excluido_em IS NULL AND d.excluido_em IS NULL
        ORDER BY d.criado_em DESC,d.id DESC LIMIT 1) presentation ON TRUE
      WHERE p.id=$1 AND p.excluido_em IS NULL`, [projectId]),
    query(`SELECT
      COALESCE((SELECT SUM(valor) FROM itens_orcamento WHERE projeto_id=$1 AND excluido_em IS NULL AND valor>0 AND competencia<=CURRENT_DATE),0)::numeric(15,2) AS orcamento_atual,
      COALESCE((SELECT SUM(valor) FROM itens_orcamento WHERE projeto_id=$1 AND excluido_em IS NULL AND valor>0),0)::numeric(15,2) AS orcamento_com_provisao,
      COALESCE((SELECT SUM(valor) FROM itens_orcamento WHERE projeto_id=$1 AND excluido_em IS NULL AND valor>0 AND competencia>CURRENT_DATE),0)::numeric(15,2) AS total_provisionado,
      COALESCE((SELECT SUM(valor) FROM itens_orcamento WHERE projeto_id=$1 AND excluido_em IS NULL AND valor>0),0)::numeric(15,2) AS orcamento_total,
      COALESCE((SELECT SUM(valor) FROM pagamentos WHERE projeto_id=$1 AND excluido_em IS NULL),0)::numeric(15,2) AS comprometido,
      COALESCE((SELECT SUM(valor) FROM pagamentos WHERE projeto_id=$1 AND excluido_em IS NULL AND status=ANY($2::varchar[])),0)::numeric(15,2) AS pago,
      COALESCE((SELECT SUM(valor) FROM pagamentos WHERE projeto_id=$1 AND excluido_em IS NULL AND status=ANY($2::varchar[])),0)::numeric(15,2) AS total_pagamentos,
      COALESCE((SELECT SUM(valor) FROM pagamentos WHERE projeto_id=$1 AND excluido_em IS NULL AND status=$3),0)::numeric(15,2) AS pago_aguardando_entrega,
      COALESCE((SELECT SUM(valor) FROM pagamentos WHERE projeto_id=$1 AND excluido_em IS NULL AND status=$4),0)::numeric(15,2) AS concluido,
      COALESCE((SELECT SUM(valor) FROM pagamentos WHERE projeto_id=$1 AND excluido_em IS NULL AND status=$5),0)::numeric(15,2) AS em_negociacao,
      COALESCE((SELECT SUM(valor) FROM pagamentos WHERE projeto_id=$1 AND excluido_em IS NULL AND status=$6),0)::numeric(15,2) AS pendente,
      (SELECT COUNT(*)::int FROM cronogramas WHERE projeto_id=$1 AND parent_id IS NULL AND excluido_em IS NULL AND data_fim IS NOT NULL AND data_fim<=CURRENT_DATE) AS etapas_concluidas,
      (SELECT COUNT(*)::int FROM cronogramas WHERE projeto_id=$1 AND parent_id IS NULL AND excluido_em IS NULL AND data_inicio<=CURRENT_DATE AND (data_fim IS NULL OR data_fim>CURRENT_DATE)) AS etapas_em_andamento,
      COALESCE((SELECT ROUND(AVG(CASE WHEN data_fim IS NOT NULL AND data_fim<=CURRENT_DATE THEN 100 WHEN data_inicio<=CURRENT_DATE THEN 50 ELSE 0 END)) FROM cronogramas WHERE projeto_id=$1 AND parent_id IS NULL AND excluido_em IS NULL),0) AS percentual_andamento`, [projectId,SETTLED_PAYMENT_STATUSES,PAYMENT_STATUS.PAGO_AGUARDANDO_ENTREGA,PAYMENT_STATUS.CONCLUIDO,PAYMENT_STATUS.EM_NEGOCIACAO,PAYMENT_STATUS.PENDENTE]),
    query(`WITH meses AS (
      SELECT competencia AS mes,SUM(valor) AS previsto FROM itens_orcamento WHERE projeto_id=$1 AND excluido_em IS NULL GROUP BY competencia
    ), pagos AS (
      SELECT DATE_TRUNC('month',data_pagamento)::date AS mes,SUM(valor) AS realizado FROM pagamentos
      WHERE projeto_id=$1 AND excluido_em IS NULL AND status=ANY($2::varchar[]) AND data_pagamento IS NOT NULL GROUP BY 1
    ) SELECT COALESCE(m.mes,pg.mes) AS mes,COALESCE(m.previsto,0)::numeric(15,2) AS previsto,
      COALESCE(pg.realizado,0)::numeric(15,2) AS realizado FROM meses m FULL JOIN pagos pg ON pg.mes=m.mes ORDER BY mes`, [projectId,SETTLED_PAYMENT_STATUSES]),
    query(`SELECT COALESCE('ETAPA ' || COALESCE(pai.ordem,e.ordem)::text || ' - ' || COALESCE(pai.nome,e.nome),'Sem etapa') AS etapa,
      COALESCE(SUM(p.valor),0)::numeric(15,2) AS total FROM pagamentos p
      LEFT JOIN cronogramas e ON e.id=p.etapa_id LEFT JOIN cronogramas pai ON pai.id=e.parent_id
      WHERE p.projeto_id=$1 AND p.excluido_em IS NULL AND p.status=ANY($2::varchar[])
      GROUP BY COALESCE('ETAPA ' || COALESCE(pai.ordem,e.ordem)::text || ' - ' || COALESCE(pai.nome,e.nome),'Sem etapa') ORDER BY total DESC`, [projectId,SETTLED_PAYMENT_STATUSES]),
    query(`SELECT p.id,p.descricao,p.fornecedor,p.descricao AS item,p.valor,p.forma_pagamento,p.data_pagamento
      FROM pagamentos p WHERE p.projeto_id=$1 AND p.excluido_em IS NULL AND p.status=ANY($2::varchar[])
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
  res.json({ projeto: project.rows[0], indicadores: metrics.rows[0], evolucaoFinanceira: evolution.rows, distribuicaoEtapas: distribution.rows, ultimosPagamentos: recentPayments.rows, proximasEtapas: nextStages.rows, documentosRecentes: recentDocuments.rows, atividadesRecentes: activity.rows })
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
    query(`SELECT
      COALESCE((SELECT SUM(valor) FROM itens_orcamento WHERE projeto_id=$1 AND competencia=$2::date AND excluido_em IS NULL),0)::numeric(15,2) AS orcamento_previsto,
      COALESCE(SUM(p.valor),0)::numeric(15,2) AS comprometido,
      COALESCE(SUM(p.valor) FILTER (WHERE p.status=ANY($3::varchar[])),0)::numeric(15,2) AS pago,
      COALESCE(SUM(p.valor) FILTER (WHERE p.status=$4),0)::numeric(15,2) AS pago_aguardando_entrega,
      COALESCE(SUM(p.valor) FILTER (WHERE p.status=$5),0)::numeric(15,2) AS concluido,
      COALESCE(SUM(p.valor) FILTER (WHERE p.status=$6),0)::numeric(15,2) AS em_negociacao,
      COALESCE(SUM(p.valor) FILTER (WHERE p.status=$7),0)::numeric(15,2) AS pendente
      FROM pagamentos p WHERE p.projeto_id=$1 AND p.excluido_em IS NULL
      AND DATE_TRUNC('month',COALESCE(p.data_pagamento,p.data_agendamento,p.criado_em))=$2::date`, [projectId,start,SETTLED_PAYMENT_STATUSES,PAYMENT_STATUS.PAGO_AGUARDANDO_ENTREGA,PAYMENT_STATUS.CONCLUIDO,PAYMENT_STATUS.EM_NEGOCIACAO,PAYMENT_STATUS.PENDENTE]),
    query(`SELECT COALESCE(p.fornecedor,'Não informado') AS fornecedor,SUM(p.valor)::numeric(15,2) AS total
      FROM pagamentos p WHERE p.projeto_id=$1 AND p.excluido_em IS NULL AND DATE_TRUNC('month',COALESCE(p.data_pagamento,p.data_agendamento,p.criado_em))=$2::date
      GROUP BY p.fornecedor ORDER BY total DESC LIMIT 8`, [projectId,start]),
    query(`SELECT COALESCE(pai.nome,e.nome,'Sem etapa') AS etapa,SUM(p.valor)::numeric(15,2) AS total
      FROM pagamentos p LEFT JOIN cronogramas e ON e.id=p.etapa_id LEFT JOIN cronogramas pai ON pai.id=e.parent_id
      WHERE p.projeto_id=$1 AND p.excluido_em IS NULL AND DATE_TRUNC('month',COALESCE(p.data_pagamento,p.data_agendamento,p.criado_em))=$2::date
      GROUP BY COALESCE(pai.nome,e.nome,'Sem etapa') ORDER BY total DESC LIMIT 8`, [projectId,start]),
    query(`SELECT DATE_TRUNC('month',p.data_pagamento)::date AS mes,SUM(p.valor)::numeric(15,2) AS pago
      FROM pagamentos p WHERE p.projeto_id=$1 AND p.excluido_em IS NULL AND p.status=ANY($2::varchar[]) AND p.data_pagamento IS NOT NULL
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
  const [project, values] = await Promise.all([
    query<{ nome: string; cidade: string | null; estado: string | null }>('SELECT nome,cidade,estado FROM projetos WHERE id=$1 AND excluido_em IS NULL', [projectId]),
    query(`SELECT COALESCE(SUM(io.valor),0)::numeric(15,2) AS previsto,
      COALESCE((SELECT SUM(valor) FROM pagamentos WHERE projeto_id=$1 AND excluido_em IS NULL AND status=ANY($3::varchar[]) AND DATE_TRUNC('month',data_pagamento)=$2::date),0)::numeric(15,2) AS pago
      FROM itens_orcamento io WHERE io.projeto_id=$1 AND io.excluido_em IS NULL AND io.competencia=$2::date`, [projectId,`${competence}-01`,SETTLED_PAYMENT_STATUSES]),
  ])
  if (!project.rows[0]) throw new AppError(404, 'Projeto não encontrado.', 'PROJETO_NAO_ENCONTRADO')
  const document = new PDFDocument({ size: 'A4', margin: 54, info: { Title: `Relatório ${project.rows[0].nome}` } })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="relatorio-${competence}.pdf"`)
  document.pipe(res)
  document.rect(0, 0, 595, 842).fill('#f7f5ef')
  document.fillColor('#1f2421').font('Helvetica-Bold').fontSize(11).text('MINHAOBRA', 54, 50)
  document.fillColor('#8b7358').fontSize(9).text('RELATÓRIO FINANCEIRO MENSAL', 54, 78)
  document.fillColor('#1f2421').font('Helvetica-Bold').fontSize(28).text(project.rows[0].nome, 54, 110)
  document.fillColor('#6b716d').font('Helvetica').fontSize(10).text(`${project.rows[0].cidade || ''}${project.rows[0].estado ? ` · ${project.rows[0].estado}` : ''}  |  Competência ${competence.split('-').reverse().join('/')}  |  Emitido em ${new Intl.DateTimeFormat('pt-BR').format(new Date())}`, 54, 151)
  const metric = values.rows[0] as { previsto: string; pago: string }
  const money = (value: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value))
  document.roundedRect(54, 190, 230, 105, 3).fill('#ffffff').fillColor('#757b77').fontSize(9).text('FLUXO PREVISTO', 72, 213).fillColor('#1f2421').font('Helvetica-Bold').fontSize(20).text(money(metric.previsto), 72, 242)
  document.roundedRect(310, 190, 230, 105, 3).fill('#ffffff').fillColor('#757b77').font('Helvetica').fontSize(9).text('VALOR PAGO', 328, 213).fillColor('#1f2421').font('Helvetica-Bold').fontSize(20).text(money(metric.pago), 328, 242)
  document.fillColor('#1f2421').font('Helvetica-Bold').fontSize(16).text('Resumo', 54, 345)
  document.fillColor('#59605c').font('Helvetica').fontSize(11).text(`No período, os pagamentos confirmados representam ${Number(metric.previsto) ? ((Number(metric.pago)/Number(metric.previsto))*100).toFixed(1) : '0,0'}% do fluxo mensal previsto. Este relatório foi gerado a partir dos registros atuais do projeto.`, 54, 378, { width: 486, lineGap: 6 })
  document.moveTo(54, 470).lineTo(540, 470).strokeColor('#d8d5ce').stroke()
  document.fillColor('#8b7358').fontSize(9).text('Documento gerado pelo MinhaObra', 54, 490)
  document.end()
})
