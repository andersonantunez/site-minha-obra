import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { query } from '../../config/database.js'
import { env } from '../../config/env.js'
import { AppError } from '../../shared/errors.js'
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from './payment-status.js'

type ReportLink = { id: number; url: string; titulo?: string; tipo_origem?: 'ARQUIVO' | 'LINK'; nome_original?: string | null }
type ReportPayment = {
  id: number
  etapa: string | null
  subitem: string | null
  quantidade: string | null
  unidade: string | null
  descricao: string
  fornecedor: string | null
  contato_fornecedor: string | null
  nome_contato_fornecedor: string | null
  chave_pix: string | null
  valor: string
  status: PaymentStatus
  forma_pagamento: string | null
  data_pagamento: string | null
  data_agendamento: string | null
  data_entrega: string | null
  observacao: string | null
  links_cotacao: ReportLink[]
  documentos: ReportLink[]
}

type PaymentReport = {
  projeto: { nome: string; cidade: string | null; estado: string | null }
  pagamentos: ReportPayment[]
}

const formatMoney = (value: string | number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value))
const formatDate = (value: string | Date | null) => {
  if (!value) return '—'
  const iso = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
  return iso.split('-').reverse().join('/')
}
const excelDate = (value: string | Date | null) => {
  if (!value) return null
  const iso = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
  return new Date(`${iso}T12:00:00Z`)
}
const statusLabel = (status: PaymentStatus) => PAYMENT_STATUS_LABELS[status]
const paymentDocumentUrl = (projectId: number, paymentId: number, document: ReportLink) => document.url || `${env.webUrl}/api/projetos/${projectId}/pagamentos/${paymentId}/documentos/${document.id}/arquivo`

export async function getPaymentReport(projectId: number): Promise<PaymentReport> {
  const [project, payments] = await Promise.all([
    query<{ nome: string; cidade: string | null; estado: string | null }>('SELECT nome,cidade,estado FROM projetos WHERE id=$1 AND excluido_em IS NULL', [projectId]),
    query<ReportPayment>(`SELECT p.id,
      CASE WHEN COALESCE(pai.id,e.id) IS NULL THEN NULL ELSE 'ETAPA '||COALESCE(pai.ordem,e.ordem)||' - '||COALESCE(pai.nome,e.nome) END AS etapa,
      CASE WHEN e.parent_id IS NOT NULL THEN e.nome ELSE NULL END AS subitem,
      p.quantidade,p.unidade,p.descricao,p.fornecedor,p.contato_fornecedor,p.nome_contato_fornecedor,p.chave_pix,
      p.valor,p.status,p.forma_pagamento,p.data_pagamento,p.data_agendamento,p.data_entrega,p.observacao,
      COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT('id',lc.id,'url',lc.url) ORDER BY lc.id)
        FROM links_cotacao_pagamento lc WHERE lc.pagamento_id=p.id),'[]'::jsonb) AS links_cotacao,
      COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT('id',d.id,'url',d.url,'titulo',d.titulo,'tipo_origem',d.tipo_origem,'nome_original',d.nome_original) ORDER BY d.criado_em,d.id)
        FROM documentos_projeto d WHERE d.pagamento_id=p.id AND d.excluido_em IS NULL),'[]'::jsonb) AS documentos
      FROM pagamentos p
      LEFT JOIN cronogramas e ON e.id=p.etapa_id
      LEFT JOIN cronogramas pai ON pai.id=e.parent_id
      WHERE p.projeto_id=$1 AND p.excluido_em IS NULL
      ORDER BY p.data_pagamento DESC NULLS FIRST,p.id DESC`, [projectId]),
  ])
  if (!project.rows[0]) throw new AppError(404, 'Projeto não encontrado.', 'PROJETO_NAO_ENCONTRADO')
  return { projeto: project.rows[0], pagamentos: payments.rows }
}

export function createPaymentPdf(projectId: number, report: PaymentReport) {
  const document = new PDFDocument({
    size: 'A4', layout: 'landscape', margins: { top: 40, right: 42, bottom: 44, left: 42 }, bufferPages: true,
    info: { Title: `Pagamentos - ${report.projeto.nome}` },
  })
  const pageBottom = 535
  const contentWidth = 756
  const total = report.pagamentos.reduce((sum, payment) => sum + Number(payment.valor), 0)

  const drawHeader = () => {
    document.fillColor('#202622').font('Helvetica-Bold').fontSize(18).text('MINHAOBRA', 42, 36)
    document.fillColor('#8a7257').fontSize(8).text('RELATÓRIO COMPLETO DE PAGAMENTOS', 42, 62, { characterSpacing: 1.1 })
    document.fillColor('#202622').fontSize(16).text(report.projeto.nome, 42, 82)
    document.fillColor('#202622').font('Helvetica-Bold').fontSize(10).text(`Total: ${formatMoney(total)}`, 600, 82, { width: 198, align: 'right' })
    const location = [report.projeto.cidade, report.projeto.estado].filter(Boolean).join(' - ') || 'Localidade não informada'
    document.fillColor('#737a75').font('Helvetica').fontSize(8).text(location, 42, 104)
    document.text(`Emitido em ${new Intl.DateTimeFormat('pt-BR').format(new Date())}`, 650, 104, { width: 148, align: 'right' })
    document.moveTo(42, 121).lineTo(798, 121).strokeColor('#d8d5ce').stroke()
    document.y = 136
  }

  const ensureSpace = (height: number) => {
    if (document.y + height <= pageBottom) return
    document.addPage()
    drawHeader()
  }

  const writeMetadata = (label: string, value: string, x: number, y: number, width: number) => {
    document.fillColor('#8a7257').font('Helvetica-Bold').fontSize(6.5).text(label.toUpperCase(), x, y, { width })
    document.fillColor('#303632').font('Helvetica').fontSize(8).text(value || '—', x, y + 10, { width, height: 24 })
  }

  drawHeader()
  for (const payment of report.pagamentos) {
    const quoteLinks = payment.links_cotacao
    const documents = payment.documentos
    const observationHeight = payment.observacao ? Math.min(58,document.heightOfString(`Observações: ${payment.observacao}`, { width: 728, lineGap: 2 }) + 8) : 0
    const estimatedHeight = 145 + observationHeight + (quoteLinks.length + documents.length) * 15
    ensureSpace(Math.min(estimatedHeight,pageBottom-136))
    const startY = document.y
    document.rect(42, startY, contentWidth, 27).fill('#f0eee8')
    document.fillColor('#202622').font('Helvetica-Bold').fontSize(10).text(payment.descricao, 52, startY + 8, { width: 590, height: 13, ellipsis: true })
    document.fillColor('#7a6250').fontSize(9).text(formatMoney(payment.valor), 650, startY + 8, { width: 136, align: 'right' })
    const stage = [payment.etapa, payment.subitem ? `Subitem: ${payment.subitem}` : null].filter(Boolean).join(' · ') || 'Sem etapa'
    document.fillColor('#717873').font('Helvetica').fontSize(7.5).text(stage, 52, startY + 34, { width: 734 })
    const metaY = startY + 51
    writeMetadata('Data pagamento', formatDate(payment.data_pagamento), 54, metaY, 120)
    writeMetadata('Status', statusLabel(payment.status), 180, metaY, 210)
    writeMetadata('Quantidade', payment.quantidade ? `${Number(payment.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${payment.unidade || ''}` : '—', 396, metaY, 160)
    writeMetadata('Forma de pagamento', payment.forma_pagamento || '—', 562, metaY, 224)
    const secondMetaY = metaY + 34
    writeMetadata('Fornecedor', payment.fornecedor || '—', 54, secondMetaY, 220)
    writeMetadata('Nome do funcionário', payment.nome_contato_fornecedor || '—', 280, secondMetaY, 190)
    writeMetadata('Contato do fornecedor', payment.contato_fornecedor || '—', 476, secondMetaY, 150)
    writeMetadata('Chave Pix', payment.chave_pix || '—', 632, secondMetaY, 154)
    let cursorY = secondMetaY + 38
    const secondary = [`Agendamento: ${formatDate(payment.data_agendamento)}`, `Entrega: ${formatDate(payment.data_entrega)}`].join('   ·   ')
    document.fillColor('#656c67').font('Helvetica').fontSize(7.5).text(secondary, 54, cursorY, { width: 732 })
    cursorY += 17
    if (payment.observacao) {
      const observation = `Observações: ${payment.observacao}`
      const detailHeight = document.heightOfString(observation, { width: 728, lineGap: 2 }) + 8
      document.y = cursorY
      if (detailHeight < pageBottom - 136) ensureSpace(detailHeight)
      cursorY = document.y
      document.fillColor('#777d78').font('Helvetica-Oblique').fontSize(7.5).text(observation, 54, cursorY, { width: 728, lineGap: 2 })
      cursorY = document.y + 7
    }
    if (quoteLinks.length || documents.length) {
      document.y = cursorY
      ensureSpace(28)
      cursorY = document.y
      document.fillColor('#8a7257').font('Helvetica-Bold').fontSize(6.5).text('LINKS E DOCUMENTOS', 54, cursorY)
      cursorY += 12
      for (const [index, link] of quoteLinks.entries()) {
        document.y = cursorY
        ensureSpace(18)
        cursorY = document.y
        document.fillColor('#526d82').font('Helvetica').fontSize(7).text(`Cotação ${index + 1}: ${link.url}`, 54, cursorY, { width: 728, link: link.url, underline: true, ellipsis: true, height: 12 })
        cursorY += 15
      }
      for (const item of documents) {
        document.y = cursorY
        ensureSpace(18)
        cursorY = document.y
        const url = paymentDocumentUrl(projectId, payment.id, item)
        document.fillColor('#526d82').font('Helvetica').fontSize(7).text(`${item.titulo || item.nome_original || 'Documento'}: ${url}`, 54, cursorY, { width: 728, link: url, underline: true, ellipsis: true, height: 12 })
        cursorY += 15
      }
    }
    document.y = Math.max(cursorY + 7, startY + 145)
    document.moveTo(42, document.y).lineTo(798, document.y).strokeColor('#deddd7').stroke()
    document.y += 10
  }
  if (!report.pagamentos.length) document.fillColor('#747a76').font('Helvetica').fontSize(10).text('Nenhum pagamento cadastrado.', 42, 160)
  const range = document.bufferedPageRange()
  for (let index = 0; index < range.count; index += 1) {
    document.switchToPage(index)
    document.fillColor('#8a8f8b').font('Helvetica').fontSize(7).text(`MinhaObra · Página ${index + 1} de ${range.count}`, 42, 538, { width: 756, align: 'center', lineBreak: false })
  }
  return document
}

export async function createPaymentWorkbook(projectId: number, report: PaymentReport) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MinhaObra'
  workbook.created = new Date()
  const payments = workbook.addWorksheet('Pagamentos', { views: [{ state: 'frozen', ySplit: 1 }] })
  payments.columns = [
    { header: 'ID', key: 'id', width: 9 }, { header: 'Etapa', key: 'etapa', width: 38 }, { header: 'Subitem', key: 'subitem', width: 28 },
    { header: 'Data pagamento', key: 'data_pagamento', width: 17 }, { header: 'Quantidade', key: 'quantidade', width: 13 }, { header: 'Unidade', key: 'unidade', width: 14 },
    { header: 'Descrição', key: 'descricao', width: 42 }, { header: 'Observações', key: 'observacao', width: 48 }, { header: 'Fornecedor', key: 'fornecedor', width: 25 },
    { header: 'Contato fornecedor', key: 'contato', width: 22 }, { header: 'Nome do funcionário', key: 'funcionario', width: 25 }, { header: 'Chave Pix', key: 'pix', width: 30 },
    { header: 'Valor', key: 'valor', width: 16 }, { header: 'Status', key: 'status', width: 30 }, { header: 'Data agendamento', key: 'agendamento', width: 18 },
    { header: 'Data entrega', key: 'entrega', width: 16 }, { header: 'Forma de pagamento', key: 'forma', width: 22 },
    { header: 'Links de cotação', key: 'cotacoes', width: 48 }, { header: 'Documentos', key: 'documentos', width: 48 },
  ]
  for (const payment of report.pagamentos) {
    payments.addRow({
      id: payment.id, etapa: payment.etapa || null, subitem: payment.subitem || null, data_pagamento: excelDate(payment.data_pagamento),
      quantidade: payment.quantidade === null ? null : Number(payment.quantidade), unidade: payment.unidade || null, descricao: payment.descricao,
      observacao: payment.observacao || null, fornecedor: payment.fornecedor || null, contato: payment.contato_fornecedor || null, funcionario: payment.nome_contato_fornecedor || null,
      pix: payment.chave_pix || null, valor: Number(payment.valor), status: statusLabel(payment.status), agendamento: excelDate(payment.data_agendamento),
      entrega: excelDate(payment.data_entrega), forma: payment.forma_pagamento || null, cotacoes: payment.links_cotacao.map((link) => link.url).join('\n') || null,
      documentos: payment.documentos.map((item) => paymentDocumentUrl(projectId, payment.id, item)).join('\n') || null,
    })
  }
  payments.getRow(1).eachCell((cell) => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF303732' } }; cell.alignment = { vertical: 'middle' } })
  payments.autoFilter = { from: 'A1', to: 'S1' }
  payments.getColumn('valor').numFmt = 'R$ #,##0.00'
  for (const key of ['data_pagamento', 'agendamento', 'entrega']) payments.getColumn(key).numFmt = 'dd/mm/yyyy'
  payments.eachRow((row, number) => { if (number > 1) row.alignment = { vertical: 'top', wrapText: true } })

  const resources = workbook.addWorksheet('Links e documentos', { views: [{ state: 'frozen', ySplit: 1 }] })
  resources.columns = [
    { header: 'Pagamento ID', key: 'id', width: 15 }, { header: 'Descrição do pagamento', key: 'descricao', width: 42 },
    { header: 'Tipo', key: 'tipo', width: 18 }, { header: 'Título', key: 'titulo', width: 32 }, { header: 'Link', key: 'link', width: 80 },
  ]
  for (const payment of report.pagamentos) {
    for (const [index, link] of payment.links_cotacao.entries()) {
      const row = resources.addRow({ id: payment.id, descricao: payment.descricao, tipo: 'Cotação', titulo: `Cotação ${index + 1}` })
      row.getCell('link').value = { text: link.url, hyperlink: link.url }
    }
    for (const item of payment.documentos) {
      const url = paymentDocumentUrl(projectId, payment.id, item)
      const row = resources.addRow({ id: payment.id, descricao: payment.descricao, tipo: 'Documento', titulo: item.titulo || item.nome_original || 'Documento' })
      row.getCell('link').value = { text: url, hyperlink: url }
    }
  }
  resources.getRow(1).eachCell((cell) => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF303732' } } })
  resources.autoFilter = { from: 'A1', to: 'E1' }
  resources.getColumn('link').eachCell((cell, number) => { if (number > 1) cell.font = { color: { argb: 'FF366A96' }, underline: true } })
  return workbook.xlsx.writeBuffer()
}
