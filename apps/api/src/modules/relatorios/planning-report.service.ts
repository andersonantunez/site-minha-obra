import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { query } from '../../config/database.js'
import { AppError } from '../../shared/errors.js'
import { cashFlowCte, cashFlowFilter } from '../orcamento/cash-flow.query.js'
import { SETTLED_PAYMENT_STATUSES } from '../pagamentos/payment-status.js'
import { paymentFinancialCte } from '../pagamentos/purchase-financial.query.js'

type Project = { nome: string; cidade: string | null; estado: string | null }
type CashFlowRow = { data: string; descricao: string; detalhes: string | null; quantidade: string | null; unidade: string | null; valor: string; provisionado: boolean; origem: string }
type ScheduleRow = { ordem: number; etapa: string; tipo: string; data_inicio_previsto: string | null; data_fim_previsto: string | null; valor_previsto: string; data_inicio: string | null; data_fim: string | null; valor_pago: string }
type CashFlowFilters = { search: string; start: string | null; end: string | null; includeFuture: boolean }

const formatDate = (value: string | Date | null) => {
  if (!value) return '-'
  const iso = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
  return iso.split('-').reverse().join('/')
}
const formatMoney = (value: string | number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value))
const excelDate = (value: string | Date | null) => {
  if (!value) return null
  const iso = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
  return new Date(`${iso}T12:00:00Z`)
}

async function getProject(projectId: number) {
  const result = await query<Project>('SELECT nome,cidade,estado FROM projetos WHERE id=$1 AND excluido_em IS NULL',[projectId])
  if (!result.rows[0]) throw new AppError(404,'Projeto não encontrado.','PROJETO_NAO_ENCONTRADO')
  return result.rows[0]
}

export async function getCashFlowReport(projectId: number, filters: CashFlowFilters) {
  const [project,entries] = await Promise.all([
    getProject(projectId),
    query<CashFlowRow>(`${cashFlowCte} SELECT data,descricao,detalhes,quantidade,unidade,valor,(data>CURRENT_DATE) AS provisionado,origem
      FROM fluxo ${cashFlowFilter} ORDER BY data DESC,origem_id DESC`,[projectId,SETTLED_PAYMENT_STATUSES,`%${filters.search}%`,filters.start,filters.end,filters.includeFuture]),
  ])
  return { project, rows: entries.rows }
}

export async function getScheduleReport(projectId: number) {
  const [project,stages] = await Promise.all([
    getProject(projectId),
    query<ScheduleRow>(`WITH ${paymentFinancialCte} SELECT c.ordem,
      CASE WHEN pai.id IS NULL THEN 'ETAPA '||c.ordem||' - '||c.nome ELSE 'ETAPA '||pai.ordem||' - '||pai.nome||' / '||c.nome END AS etapa,
      CASE WHEN pai.id IS NULL THEN 'Etapa' ELSE 'Subitem' END AS tipo,
      c.data_inicio_previsto,c.data_fim_previsto,c.data_inicio,c.data_fim,
      c.valor_previsto::numeric(15,2),
      COALESCE((SELECT SUM(p.valor) FROM pagamentos_financeiros p WHERE p.projeto_id=c.projeto_id AND p.status=ANY($2::varchar[])
        AND (p.etapa_id=c.id OR (c.parent_id IS NULL AND p.etapa_id IN (SELECT f.id FROM cronogramas f WHERE f.parent_id=c.id AND f.excluido_em IS NULL)))),0)::numeric(15,2) AS valor_pago
      FROM cronogramas c LEFT JOIN cronogramas pai ON pai.id=c.parent_id
      WHERE c.projeto_id=$1 AND c.excluido_em IS NULL
      ORDER BY COALESCE(pai.ordem,c.ordem),c.parent_id NULLS FIRST,c.ordem,c.id`,[projectId,SETTLED_PAYMENT_STATUSES]),
  ])
  return { project, rows: stages.rows }
}

type PdfColumn<T> = { label: string; width: number; value: (row:T)=>string; align?: 'left'|'right' }
function createTablePdf<T>(title: string, project: Project, rows: T[], columns: PdfColumn<T>[]) {
  const document = new PDFDocument({size:'A4',layout:'landscape',margins:{top:36,right:36,bottom:38,left:36},bufferPages:true,info:{Title:`${title} - ${project.nome}`}})
  const left=36; const width=770; const pageBottom=520
  const header=()=>{document.fillColor('#202622').font('Helvetica-Bold').fontSize(17).text('MINHAOBRA',left,30);document.fillColor('#8a7257').fontSize(8).text(title.toUpperCase(),left,53,{characterSpacing:1});document.fillColor('#202622').fontSize(14).text(project.nome,left,70);document.fillColor('#737a75').font('Helvetica').fontSize(7.5).text([project.cidade,project.estado].filter(Boolean).join(' - ')||'Localidade não informada',left,90);document.text(`Emitido em ${new Intl.DateTimeFormat('pt-BR').format(new Date())}`,650,90,{width:156,align:'right'});document.y=112}
  const tableHeader=()=>{const y=document.y;document.rect(left,y,width,24).fill('#303732');let x=left;for(const column of columns){document.fillColor('#fff').font('Helvetica-Bold').fontSize(6.5).text(column.label.toUpperCase(),x+5,y+8,{width:column.width-10,align:column.align||'left',height:10,ellipsis:true});x+=column.width}document.y=y+24}
  const newPage=()=>{document.addPage();header();tableHeader()}
  header();tableHeader()
  rows.forEach((row,index)=>{const rowHeight=30;if(document.y+rowHeight>pageBottom)newPage();const y=document.y;if(index%2===1)document.rect(left,y,width,rowHeight).fill('#f7f6f2');let x=left;for(const column of columns){document.fillColor('#303632').font('Helvetica').fontSize(7).text(column.value(row),x+5,y+6,{width:column.width-10,height:20,align:column.align||'left',ellipsis:true});x+=column.width}document.moveTo(left,y+rowHeight).lineTo(left+width,y+rowHeight).strokeColor('#deddd7').stroke();document.y=y+rowHeight})
  if(!rows.length)document.fillColor('#747a76').fontSize(9).text('Nenhum registro encontrado.',left,document.y+18)
  const pages=document.bufferedPageRange();for(let index=0;index<pages.count;index+=1){document.switchToPage(index);document.fillColor('#8a8f8b').font('Helvetica').fontSize(7).text(`MinhaObra - Página ${index+1} de ${pages.count}`,left,545,{width,align:'center',lineBreak:false})}
  return document
}

export function createCashFlowPdf(report: Awaited<ReturnType<typeof getCashFlowReport>>) {
  return createTablePdf('Relatório de Fluxo de Caixa',report.project,report.rows,[
    {label:'Data',width:70,value:r=>formatDate(r.data)},
    {label:'Descrição',width:220,value:r=>r.descricao},
    {label:'Detalhes',width:260,value:r=>[r.quantidade?`${Number(r.quantidade).toLocaleString('pt-BR',{maximumFractionDigits:3})} ${r.unidade||''}`:null,r.detalhes].filter(Boolean).join(' - ')},
    {label:'Origem',width:85,value:r=>r.origem==='PAGAMENTO'?'Pagamento':'Manual'},
    {label:'Valor',width:85,value:r=>formatMoney(r.valor),align:'right'},
    {label:'Provisionado',width:50,value:r=>r.provisionado?'Sim':'Não'},
  ])
}

export function createSchedulePdf(report: Awaited<ReturnType<typeof getScheduleReport>>) {
  return createTablePdf('Relatório do Cronograma',report.project,report.rows,[
    {label:'Ordem',width:42,value:r=>String(r.ordem)}, {label:'Etapa',width:210,value:r=>r.etapa},
    {label:'Início previsto',width:75,value:r=>formatDate(r.data_inicio_previsto)}, {label:'Fim previsto',width:75,value:r=>formatDate(r.data_fim_previsto)},
    {label:'Valor orçado',width:85,value:r=>formatMoney(r.valor_previsto),align:'right'}, {label:'Início',width:70,value:r=>formatDate(r.data_inicio)},
    {label:'Fim',width:70,value:r=>formatDate(r.data_fim)}, {label:'Valor pago',width:85,value:r=>formatMoney(r.valor_pago),align:'right'},
  ])
}

function styleWorksheet(sheet: ExcelJS.Worksheet,lastColumn:string){sheet.getRow(1).height=24;sheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF303732'}};cell.alignment={vertical:'middle',horizontal:'center'}});sheet.autoFilter={from:'A1',to:`${lastColumn}1`};sheet.eachRow((row,index)=>{if(index>1)row.alignment={vertical:'top',wrapText:true}})}

export async function createCashFlowWorkbook(report: Awaited<ReturnType<typeof getCashFlowReport>>) {
  const workbook=new ExcelJS.Workbook();workbook.creator='MinhaObra';const sheet=workbook.addWorksheet('Fluxo de Caixa',{views:[{state:'frozen',ySplit:1}]});sheet.columns=[{header:'Data',key:'data',width:14},{header:'Descrição',key:'descricao',width:42},{header:'Detalhes',key:'detalhes',width:60},{header:'Quantidade',key:'quantidade',width:14},{header:'Unidade',key:'unidade',width:15},{header:'Origem',key:'origem',width:16},{header:'Valor',key:'valor',width:18},{header:'Provisionado',key:'provisionado',width:15}];for(const row of report.rows)sheet.addRow({...row,data:excelDate(row.data),quantidade:row.quantidade===null?null:Number(row.quantidade),valor:Number(row.valor),origem:row.origem==='PAGAMENTO'?'Pagamento':'Manual',provisionado:row.provisionado?'Sim':'Não'});sheet.getColumn('data').numFmt='dd/mm/yyyy';sheet.getColumn('valor').numFmt='R$ #,##0.00;[Red]-R$ #,##0.00';styleWorksheet(sheet,'H');return workbook.xlsx.writeBuffer()
}

export async function createScheduleWorkbook(report: Awaited<ReturnType<typeof getScheduleReport>>) {
  const workbook=new ExcelJS.Workbook();workbook.creator='MinhaObra';const sheet=workbook.addWorksheet('Cronograma',{views:[{state:'frozen',ySplit:1}]});sheet.columns=[{header:'Ordem',key:'ordem',width:10},{header:'Etapa',key:'etapa',width:48},{header:'Data de início Previsto',key:'data_inicio_previsto',width:22},{header:'Data de fim Previsto',key:'data_fim_previsto',width:22},{header:'Valor Orçado',key:'valor_previsto',width:18},{header:'Data de Início',key:'data_inicio',width:18},{header:'Data de Fim',key:'data_fim',width:18},{header:'Valor Pago',key:'valor_pago',width:18}];for(const row of report.rows)sheet.addRow({...row,data_inicio_previsto:excelDate(row.data_inicio_previsto),data_fim_previsto:excelDate(row.data_fim_previsto),data_inicio:excelDate(row.data_inicio),data_fim:excelDate(row.data_fim),valor_previsto:Number(row.valor_previsto),valor_pago:Number(row.valor_pago)});for(const key of ['data_inicio_previsto','data_fim_previsto','data_inicio','data_fim'])sheet.getColumn(key).numFmt='dd/mm/yyyy';for(const key of ['valor_previsto','valor_pago'])sheet.getColumn(key).numFmt='R$ #,##0.00';styleWorksheet(sheet,'H');return workbook.xlsx.writeBuffer()
}
