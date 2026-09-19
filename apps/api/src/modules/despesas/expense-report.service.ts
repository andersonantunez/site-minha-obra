import ExcelJS from 'exceljs'
import { reportPdf, pdfTable, pdfReportIndicators, pdfReportTotal, finishReportPdf, reportContrastColor } from '../../shared/report-pdf.js'
import { withTransaction } from '../../config/database.js'
import { AppError } from '../../shared/errors.js'
import { reportMoney, reportDate, spreadsheetNumber, spreadsheetDate } from '../../shared/report.js'
import { PAYMENT_STATUS_COLORS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_VALUES, SETTLED_PAYMENT_STATUSES, type PaymentStatus } from '../pagamentos/payment-status.js'
import { expenseItemTotalSql, expenseTotalSql } from './expense-financial.js'

export type ExpenseReportItem = {id:number;despesa_id:number|null;descricao:string;quantidade:string|null;unidade:string|null;observacao:string|null;valor_unitario:string|null;valor_desconto:string|null;valor_total:string|null;valor_total_manual:boolean;ordem?:number;links_cotacao:{id:number;url:string}[]}
export type ExpenseReportDocument = {id:number;despesa_id:number|null;titulo:string;tipo_origem:string;url:string|null;nome_original:string|null;categorias:string[];criado_em:string}
export type ExpenseReportEntry = {id:number;descricao:string;etapa_id:number|null;etapa:string|null;etapa_ordem?:number|null;etapa_cor?:string|null;status:PaymentStatus;fornecedor:string|null;nome_contato_fornecedor:string|null;contato_fornecedor:string|null;forma_pagamento:string|null;data_pagamento:string|null;numero_nota_fiscal:string|null;data_emissao:string|null;data_agendamento:string|null;data_entrega:string|null;observacao:string|null;valor_desconto:string|null;valor_total:string;documento:string;ordem?:number;itens:ExpenseReportItem[];documentos:ExpenseReportDocument[]}
export type ExpenseReport = {projeto:{nome:string;endereco?:string|null;cep?:string|null;logradouro?:string|null;numero?:string|null;complemento?:string|null;bairro?:string|null;cidade:string|null;estado:string|null;latitude?:string|null;longitude?:string|null};despesas:ExpenseReportEntry[];itens_sem_despesa:ExpenseReportItem[]}
export type ExpenseReportFilters = {status?:string;search?:string;stageId?:number|null}

export async function getExpenseReport(projectId:number, filters:ExpenseReportFilters={}):Promise<ExpenseReport> {
  if(filters.status&&!PAYMENT_STATUS_VALUES.includes(filters.status as PaymentStatus))throw new AppError(422,'Status de despesa inválido.','STATUS_INVALIDO')
  return withTransaction(async client=>{
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const project=await client.query<ExpenseReport['projeto']>('SELECT nome,endereco,cep,logradouro,numero,complemento,bairro,cidade,estado,latitude,longitude FROM projetos WHERE id=$1 AND excluido_em IS NULL',[projectId])
    if(!project.rows[0])throw new AppError(404,'Projeto não encontrado.','PROJETO_NAO_ENCONTRADO')
    const expenses=await client.query<ExpenseReportEntry>(`SELECT d.*,${expenseTotalSql('d')} AS valor_total,
      CASE WHEN NULLIF(TRIM(d.numero_nota_fiscal),'') IS NULL THEN 'Orçamento' ELSE 'Nota Fiscal' END AS documento,
      CASE WHEN e.id IS NULL THEN NULL ELSE 'ETAPA '||COALESCE(pai.ordem,e.ordem)||' - '||COALESCE(pai.nome,e.nome) END AS etapa,
      COALESCE(pai.ordem,e.ordem) AS etapa_ordem,COALESCE(pai.cor,e.cor) AS etapa_cor
      FROM despesas d LEFT JOIN cronogramas e ON e.id=d.etapa_id LEFT JOIN cronogramas pai ON pai.id=e.parent_id
      WHERE d.projeto_id=$1 AND d.excluido_em IS NULL AND ($2='' OR d.status=$2)
        AND ($3='%%' OR d.descricao ILIKE $3 OR d.fornecedor ILIKE $3)
        AND ($4::bigint IS NULL OR d.etapa_id=$4 OR e.parent_id=$4)
      ORDER BY CASE d.status WHEN 'PENDENTE' THEN 1 WHEN 'EM_NEGOCIACAO' THEN 2 WHEN 'PAGO_AGUARDANDO_ENTREGA' THEN 3 ELSE 4 END,d.ordem,d.id`,
      [projectId,filters.status||'',`%${filters.search||''}%`,filters.stageId||null])
    const items=await client.query<ExpenseReportItem>(`SELECT i.id,i.compra_id AS despesa_id,i.descricao,i.quantidade,i.unidade,i.observacao,i.valor_unitario,i.valor_desconto,i.valor_total_manual,i.ordem,
      (${expenseItemTotalSql('i')})::numeric(15,2) AS valor_total,
      COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT('id',l.id,'url',l.url) ORDER BY l.id) FROM links_cotacao_pagamento l WHERE l.pagamento_id=i.id),'[]'::jsonb) AS links_cotacao
      FROM pagamentos i WHERE i.projeto_id=$1 AND i.excluido_em IS NULL ORDER BY i.ordem,i.id`,[projectId])
    const documents=await client.query<ExpenseReportDocument>(`SELECT d.id,d.compra_id AS despesa_id,d.titulo,d.tipo_origem,d.url,d.nome_original,d.criado_em,
      COALESCE((SELECT ARRAY_AGG(c.nome ORDER BY c.nome) FROM documentos_projeto_categorias dc JOIN categorias_documento c ON c.id=dc.categoria_id AND c.excluido_em IS NULL WHERE dc.documento_id=d.id),'{}') AS categorias
      FROM documentos_projeto d WHERE d.projeto_id=$1 AND d.excluido_em IS NULL AND d.compra_id IS NOT NULL ORDER BY d.criado_em,d.id`,[projectId])
    return {projeto:project.rows[0],despesas:expenses.rows.map(d=>({...d,itens:items.rows.filter(i=>i.despesa_id===d.id),documentos:documents.rows.filter(doc=>doc.despesa_id===d.id)})),itens_sem_despesa:items.rows.filter(i=>i.despesa_id===null)}
  })
}

function quoteStore(url:string) {
  try { return new URL(url).hostname.replace(/^www\./,'') } catch { return 'Link de cotação' }
}

/** Shared CRUD projection. PDF and XLSX read the same report structure. */
export async function getExpenseCrudData(projectId:number, filters:ExpenseReportFilters={}) {
  return expenseCrudProjection(await getExpenseReport(projectId,filters))
}

export function expenseCrudProjection(report:ExpenseReport) {
  const item=(value:ExpenseReportItem)=>({...value,ordem:value.ordem??0,links_cotacao:value.links_cotacao.map(link=>({...link,loja:quoteStore(link.url)})),quantidade_documentos:0,documentos_legados_habilitados:false})
  return {
    despesas:report.despesas.map(({documentos,...expense})=>({...expense,ordem:expense.ordem??0,etapa_ordem:expense.etapa_ordem??null,etapa_cor:expense.etapa_cor??null,itens:expense.itens.map(item),quantidade_documentos:documentos.length})),
    itens_orfaos:report.itens_sem_despesa.map(item),
    total:report.despesas.length,
  }
}


// Both formats consume this same ordered hierarchy, with only CRUD columns.
export function expenseReportBlocks(report:ExpenseReport){
 return report.despesas.map(d=>({
  expense:d,
  parent:[d.descricao,d.etapa||'—',d.documento,PAYMENT_STATUS_LABELS[d.status],d.fornecedor||'—',d.data_pagamento,d.valor_total],
  items:d.itens.map(i=>[i.descricao,i.quantidade,i.unidade,i.valor_unitario,i.valor_desconto,i.valor_total]),
 }))
}
const parentLabels=['Descrição','Etapa','Documento','Status','Fornecedor','Data do pagamento','Valor total']
const itemLabels=['Descrição','Quantidade','Unidade','Valor unitário','Valor desconto','Valor total']
const expensePdfParentColumns=[
 {label:'Descrição',index:0,width:205,align:'left' as const},
 {label:'Etapa',index:1,width:135,align:'center' as const,badge:'stage' as const},
 {label:'Status',index:3,width:135,align:'center' as const,badge:'status' as const},
 {label:'Fornecedor',index:4,width:125,align:'left' as const,verticalAlign:'middle' as const},
 {label:'Data do pagamento',index:5,width:100,align:'left' as const,verticalAlign:'middle' as const},
 {label:'Valor total',index:6,width:70,align:'right' as const,verticalAlign:'middle' as const},
]
export function createExpensePdf(_projectId:number, report:ExpenseReport) {
 const pdf=reportPdf('Despesas',report.projeto)
 const statusTotals=expenseStatusTotals(report)
 pdfReportIndicators(pdf,PAYMENT_STATUS_VALUES.map(status=>({label:PAYMENT_STATUS_LABELS[status],value:reportMoney(statusTotals[status]),color:PAYMENT_STATUS_COLORS[status]})))
 for(const block of expenseReportBlocks(report)){
  if(pdf.y+155>530)pdf.addPage()
  const y=pdf.y;pdf.rect(36,y,770,3).fill('#8d765a');pdf.y=y+12
  pdfTable(pdf,[block],expensePdfParentColumns.map(column=>({
   label:column.label,width:column.width,value:r=>column.index===5?reportDate(r.parent[column.index]??null):column.index===6?reportMoney(r.parent[column.index]??null):String(r.parent[column.index]||'—'),align:column.align,verticalAlign:column.verticalAlign,
   ...(column.badge==='stage'?{badgeColor:r=>r.expense.etapa_cor||undefined,badgeTextColor:r=>reportContrastColor(r.expense.etapa_cor||'')}:{ }),
   ...(column.badge==='status'?{badgeColor:r=>PAYMENT_STATUS_COLORS[r.expense.status],badgeTextColor:r=>reportContrastColor(PAYMENT_STATUS_COLORS[r.expense.status])}:{ }),
  })),{parent:()=>true})
  pdf.font('Helvetica-Bold').fontSize(9).fillColor('#737a75').text('Itens da Despesa',36,pdf.y+12);pdf.y+=8
  pdfTable(pdf,block.items,itemLabels.map((label,i)=>({label,width:[280,80,65,115,115,115][i]!,value:r=>i>=3?reportMoney(r[i]??null,i===3?4:2):i===1&&r[i]!==null?Number(r[i]).toLocaleString('pt-BR'):String(r[i]||'—'),align:i===1?'center' as const:i>=3?'right' as const:'left' as const,verticalAlign:i===1?'middle' as const:undefined})),{secondary:true})
  pdf.y+=18
 }
 if(!report.despesas.length)pdfTable(pdf,[],[{label:'Despesas',width:770,value:()=>''}])
 pdfReportTotal(pdf,'Total geral de despesas',reportMoney(report.despesas.reduce((total,expense)=>total+Number(expense.valor_total),0)))
 return finishReportPdf(pdf)
}

export function expenseStatusTotals(report:ExpenseReport){
 const values=Object.fromEntries(PAYMENT_STATUS_VALUES.map(status=>[status,0])) as Record<PaymentStatus,number>
 for(const expense of report.despesas)values[expense.status]+=Number(expense.valor_total)
 return values
}

export function expenseFinancialSummary(report:ExpenseReport){
 const values={aguardando:0,pago:0}
 for(const expense of report.despesas){
  if(SETTLED_PAYMENT_STATUSES.includes(expense.status))values.pago+=Number(expense.valor_total)
  else values.aguardando+=Number(expense.valor_total)
 }
 return values
}

function appendExpenseFinancialSummary(pdf:PDFKit.PDFDocument,report:ExpenseReport){
 const summary=expenseFinancialSummary(report),left=36,width=770,innerLeft=left+14,innerWidth=width-28,rowHeight=24,headerHeight=22,tableOffset=64,containerHeight=tableOffset+headerHeight+rowHeight*2+14
 if(pdf.y+containerHeight+24>530)pdf.addPage()
 const y=pdf.y+12
 pdf.rect(left,y,width,containerHeight).fill('#eae6df')
 pdf.font('Helvetica-Bold').fontSize(11).fillColor('#303732').text('Resumo financeiro',left+14,y+13)
 pdf.font('Helvetica').fontSize(9).fillColor('#737a75').text('Total Valor Pago',left+14,y+38)
 pdf.font('Helvetica-Bold').fontSize(12).fillColor('#303732').text(reportMoney(summary.pago),left+500,y+35,{width:250,align:'right'})
 const tableY=y+tableOffset
 pdf.rect(innerLeft,tableY,innerWidth,headerHeight).fill('#303732')
 pdf.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff').text('Status',innerLeft+12,tableY+7,{width:360})
 pdf.text('Valor',innerLeft+390,tableY+7,{width:innerWidth-402,align:'right'})
 ;[['Aguardando',summary.aguardando],['Pago',summary.pago]].forEach(([label,value],index)=>{
  const rowY=tableY+headerHeight+index*rowHeight
  pdf.rect(innerLeft,rowY,innerWidth,rowHeight).fill(index?'#ffffff':'#f6f6f3')
  pdf.font('Helvetica').fontSize(8).fillColor('#303732').text(String(label),innerLeft+12,rowY+8,{width:360})
  pdf.font('Helvetica-Bold').text(reportMoney(Number(value)),innerLeft+390,rowY+8,{width:innerWidth-402,align:'right'})
 })
 pdf.y=y+containerHeight
}
export async function createExpenseWorkbook(projectId:number,report:ExpenseReport){
 const book=new ExcelJS.Workbook();book.creator='MinhaObra';appendExpenseWorksheets(book,projectId,report);return book.xlsx.writeBuffer()
}
export function appendExpenseWorksheets(book:ExcelJS.Workbook,_projectId:number,report:ExpenseReport){
 const sheet=book.addWorksheet('Despesas')
 sheet.columns=[{width:48},{width:28},{width:20},{width:28},{width:28},{width:24},{width:22}]
 sheet.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0}
 const heading=(labels:string[],parent=false)=>{
  const row=sheet.addRow(labels);row.height=28
  row.eachCell(c=>{c.font={bold:true,color:{argb:parent?'FFFFFFFF':'FF303732'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:parent?'FF303732':'FFF0EFEA'}};c.alignment={vertical:'middle',wrapText:true}})
 }
 for(const block of expenseReportBlocks(report)){
  const divider=sheet.addRow([]);divider.height=12;for(let i=1;i<=7;i++)divider.getCell(i).border={bottom:{style:'medium',color:{argb:'FF8D765A'}}}
  heading(parentLabels,true)
  const parent=sheet.addRow(block.parent.map((v,i)=>i===5?spreadsheetDate(v):i===6?spreadsheetNumber(v):v));parent.height=36
  parent.eachCell(c=>{c.font={bold:true};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAE6DF'}};c.alignment={vertical:'top',wrapText:true}})
  parent.getCell(6).numFmt='dd/mm/yyyy';parent.getCell(7).numFmt='R$ #,##0.00'
  sheet.addRow(['Itens da Despesa']).font={bold:true,color:{argb:'FF737A75'}}
  heading(itemLabels)
  for(const values of block.items){const row=sheet.addRow(values.map((v,i)=>i===1||i>=3?spreadsheetNumber(v):v));row.alignment={vertical:'top',wrapText:true};for(let i=4;i<=6;i++)row.getCell(i).numFmt=i===4?'R$ #,##0.0000':'R$ #,##0.00'}
  if(!block.items.length)sheet.addRow(['Nenhum item vinculado.'])
 }
 const total=sheet.addRow(['Total das Despesas','','','','','',report.despesas.reduce((sum,expense)=>sum+Number(expense.valor_total),0)])
 total.font={bold:true};total.getCell(7).numFmt='R$ #,##0.00'
}
