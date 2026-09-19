import ExcelJS from 'exceljs'
import { reportPdf, pdfTable, pdfReportIndicators, pdfReportTotal, finishReportPdf, reportContrastColor, reportTintColor, type ReportColumn } from '../../shared/report-pdf.js'
import { query } from '../../config/database.js'
import { AppError } from '../../shared/errors.js'
import { getCashFlowData, type CashFlowFilters } from '../orcamento/cash-flow.service.js'
import { getSchedule, type ScheduleRow } from '../etapas/schedule.service.js'
import { reportMoney as formatMoney, reportDate as formatDate, spreadsheetDate as excelDate, styleReportSheet } from '../../shared/report.js'

type Project = { nome: string; endereco?:string|null; cep?:string|null; logradouro?:string|null; numero?:string|null; complemento?:string|null; bairro?:string|null; cidade: string | null; estado: string | null; latitude?:string|null; longitude?:string|null }
type CashFlowReportRow = { origem_id:number; fornecedor:string|null; data:string; descricao:string; detalhes:string|null; valor:string; provisionado:boolean; origem:string }

async function getProject(projectId: number) {
  const result = await query<Project>('SELECT nome,endereco,cep,logradouro,numero,complemento,bairro,cidade,estado,latitude,longitude FROM projetos WHERE id=$1 AND excluido_em IS NULL',[projectId])
  if (!result.rows[0]) throw new AppError(404,'Projeto não encontrado.','PROJETO_NAO_ENCONTRADO')
  return result.rows[0]
}

export async function getCashFlowReport(projectId: number, filters: CashFlowFilters) {
  const [project,data] = await Promise.all([
    getProject(projectId),
    getCashFlowData(projectId,filters),
  ])
  const rows:CashFlowReportRow[]=data.itens.map(({origem_id,fornecedor,data,descricao,detalhes,valor,provisionado,origem})=>({origem_id,fornecedor,data,descricao,detalhes,valor,provisionado,origem}))
  return { projectId, project, rows }
}

export async function getScheduleReport(projectId: number, options:{planned?:boolean;sort?:string;direction?:string}={}) {
  const [project,stages] = await Promise.all([
    getProject(projectId),
    getSchedule(projectId),
  ])
  const key=(['ordem','nome','data_inicio_previsto','data_fim_previsto','valor_previsto','data_inicio','data_fim','valor_pago'].includes(options.sort||'')?options.sort:'ordem') as keyof ScheduleRow
  const parents=[...stages.arvore].sort((a,b)=>{
   const av=a[key],bv=b[key],am=av===null||av==='',bm=bv===null||bv===''
   if(am!==bm)return am?1:-1
   const numberA=Number(av),numberB=Number(bv)
   const delta=av!==''&&bv!==''&&Number.isFinite(numberA)&&Number.isFinite(numberB)?numberA-numberB:String(av??'').toLocaleLowerCase('pt-BR').localeCompare(String(bv??'').toLocaleLowerCase('pt-BR'),'pt-BR',{numeric:true})
   return options.direction==='desc'?-delta:delta
  })
  return { project, planned:options.planned??true, rows:parents.flatMap(({subitens,...parent})=>[parent,...subitens]) }
}

export function createCashFlowPdf(report: Awaited<ReturnType<typeof getCashFlowReport>>) {
 const pdf=reportPdf('Fluxo de Caixa',report.project)
 const entries=report.rows.reduce((total,row)=>total+Math.max(0,Number(row.valor)),0)
 const exits=report.rows.reduce((total,row)=>total+Math.abs(Math.min(0,Number(row.valor))),0)
 pdfReportIndicators(pdf,[
  {label:'Entrada',value:formatMoney(entries),color:'#176e9b'},
  {label:'Saída',value:formatMoney(exits),color:'#b54444'},
  {label:'Saldo',value:formatMoney(entries-exits),color:'#303732'},
 ])
 pdfTable(pdf,report.rows,[
 {label:'Data',width:75,value:r=>formatDate(r.data),align:'center',verticalAlign:'middle'},
 {label:'Descrição',width:310,value:r=>r.descricao},
 {label:'Fornecedor',width:170,value:r=>r.fornecedor||'—'},
 {label:'Valor',width:120,value:r=>formatMoney(r.valor),align:'right'},
 {label:'Provisionado',width:95,value:r=>r.provisionado?'Sim':'Não',align:'center'}])
 pdfReportTotal(pdf,'Total do Fluxo de Caixa',formatMoney(report.rows.reduce((total,row)=>total+Number(row.valor),0)))
 return finishReportPdf(pdf)
}
function scheduleReportColors(rows:ScheduleRow[]){
 const parentColors=new Map(rows.filter(row=>row.parent_id===null).map(row=>[row.id,row.cor]))
 return new Map(rows.map(row=>[row.id,row.parent_id===null?row.cor:parentColors.get(row.parent_id)||row.cor]))
}
export function createSchedulePdf(report: Awaited<ReturnType<typeof getScheduleReport>>) {
  const colors=scheduleReportColors(report.rows)
  const plannedTextColor=(row:ScheduleRow)=>reportContrastColor(row.parent_id===null?colors.get(row.id)||'':reportTintColor(colors.get(row.id)||''))==='#ffffff'?'#ffd1cc':'#a33330'
  const columns:ReportColumn<ScheduleRow>[]=[
    {label:'Ordem',width:42,value:r=>String(r.ordem)}, {label:'Etapa',width:210,value:r=>r.parent_id===null?`ETAPA ${r.ordem} - ${r.nome}`:`    ${r.nome}`,secondary:r=>r.parent_id===null?r.descricao||'':''},
    {label:'Início previsto',width:75,value:r=>formatDate(r.data_inicio_previsto)}, {label:'Fim previsto',width:75,value:r=>formatDate(r.data_fim_previsto)},
    {label:'Valor orçado',width:85,value:r=>formatMoney(r.valor_previsto),align:'right'}, {label:'Início Real',width:70,value:r=>formatDate(r.data_inicio)},
    {label:'Fim Real',width:70,value:r=>formatDate(r.data_fim)}, {label:'Valor pago',width:85,value:r=>formatMoney(r.valor_pago),align:'right'},
  ]
  columns.splice(0,columns.length,
    {label:'Ordem',width:42,value:r=>String(r.ordem)},
    {label:'Etapa',width:180,value:r=>r.parent_id===null?`ETAPA ${r.ordem} - ${r.nome}`:`    ${r.nome}`,secondary:r=>r.parent_id===null?(r.descricao||''):''},
    {label:'Início Previsto',width:85,value:r=>formatDate(r.data_inicio_previsto),align:'center',verticalAlign:'middle',headerTextColor:'#ffd1cc',textColor:plannedTextColor},
    {label:'Fim Previsto',width:85,value:r=>formatDate(r.data_fim_previsto),align:'center',verticalAlign:'middle',headerTextColor:'#ffd1cc',textColor:plannedTextColor},
    {label:'Valor Orçado',width:105,value:r=>formatMoney(r.valor_previsto),align:'right',verticalAlign:'middle',headerTextColor:'#ffd1cc',textColor:plannedTextColor},
    {label:'Início Real',width:80,value:r=>formatDate(r.data_inicio),align:'center',verticalAlign:'middle'},
    {label:'Fim Real',width:80,value:r=>formatDate(r.data_fim),align:'center',verticalAlign:'middle'},
    {label:'Valor Pago',width:113,value:r=>formatMoney(r.valor_pago),align:'right',verticalAlign:'middle'},
  )
  const visible=columns.filter(column=>report.planned||!['Início previsto','Fim previsto','Valor orçado'].includes(column.label))
  const totalWidth=visible.reduce((n,c)=>n+c.width,0)
  const pdf=reportPdf('Cronograma',report.project)
  const rowColor=(row:ScheduleRow)=>row.parent_id===null?colors.get(row.id):reportTintColor(colors.get(row.id)||'')
  pdfTable(pdf,report.rows,visible.map(column=>({...column,width:column.width*770/totalWidth})),{parent:row=>row.parent_id===null,keepNext:row=>row.parent_id===null,rowBackground:rowColor,rowTextColor:row=>reportContrastColor(rowColor(row)||'')})
  report.planned=true
  const parents=report.rows.filter(row=>row.parent_id===null)
  if(report.planned)pdfReportTotal(pdf,'Total Valor Orçado',formatMoney(parents.reduce((total,row)=>total+Number(row.valor_previsto),0)))
  pdfReportTotal(pdf,'Total Valor Pago',formatMoney(parents.reduce((total,row)=>total+Number(row.valor_pago),0)))
  return finishReportPdf(pdf)
}

export async function createCashFlowWorkbook(report: Awaited<ReturnType<typeof getCashFlowReport>>) {
  const workbook=new ExcelJS.Workbook();workbook.creator='MinhaObra'
  const sheet=workbook.addWorksheet('Fluxo de Caixa',{views:[{state:'frozen',ySplit:1}]})
  sheet.columns=[{header:'Data',key:'data',width:14},{header:'Descrição',key:'descricao',width:50},{header:'Fornecedor',key:'fornecedor',width:32},{header:'Valor',key:'valor',width:20},{header:'Provisionado',key:'provisionado',width:16}]
  for(const row of report.rows)sheet.addRow({...row,data:excelDate(row.data),valor:Number(row.valor),provisionado:row.provisionado?'Sim':'Não'})
  sheet.getColumn('data').numFmt='dd/mm/yyyy';sheet.getColumn('valor').numFmt='R$ #,##0.00;[Red]-R$ #,##0.00';styleReportSheet(sheet)
  const total=sheet.addRow({descricao:'Total do Fluxo de Caixa',valor:report.rows.reduce((sum,row)=>sum+Number(row.valor),0)})
  total.font={bold:true};total.getCell('valor').numFmt='R$ #,##0.00'
  return workbook.xlsx.writeBuffer()
}

export async function createScheduleWorkbook(report: Awaited<ReturnType<typeof getScheduleReport>>) {
  const colors=scheduleReportColors(report.rows)
  const workbook=new ExcelJS.Workbook();workbook.creator='MinhaObra'
  const sheet=workbook.addWorksheet('Cronograma',{views:[{state:'frozen',ySplit:1}]})
  sheet.columns=[{header:'Ordem',key:'ordem',width:10},{header:'Etapa / Descrição',key:'etapa',width:48},{header:'Início Previsto',key:'data_inicio_previsto',width:20},{header:'Fim Previsto',key:'data_fim_previsto',width:20},{header:'Valor orçado',key:'valor_previsto',width:20},{header:'Início Real',key:'data_inicio',width:20},{header:'Fim Real',key:'data_fim',width:20},{header:'Valor pago',key:'valor_pago',width:20}].filter(column=>report.planned||!['data_inicio_previsto','data_fim_previsto','valor_previsto'].includes(column.key))
  for(const row of report.rows)sheet.addRow({...row,etapa:(row.parent_id===null?`ETAPA ${row.ordem} - ${row.nome}`:`    ${row.nome}`)+(row.parent_id===null&&row.descricao?`\n${row.descricao}`:''),...Object.fromEntries(['data_inicio_previsto','data_fim_previsto','data_inicio','data_fim'].map(key=>[key,excelDate(row[key as 'data_inicio'])])),valor_previsto:Number(row.valor_previsto),valor_pago:Number(row.valor_pago)})
  for(const key of ['data_inicio_previsto','data_fim_previsto','data_inicio','data_fim']){if(report.planned||!key.endsWith('_previsto'))sheet.getColumn(key).numFmt='dd/mm/yyyy'}
  for(const key of ['valor_previsto','valor_pago']){if(report.planned||key!=='valor_previsto')sheet.getColumn(key).numFmt='R$ #,##0.00'}
  styleReportSheet(sheet);report.rows.forEach((row,i)=>{if(row.parent_id===null)sheet.getRow(i+2).eachCell(cell=>{cell.font={bold:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAE6DF'}}})})
  report.rows.forEach((row,index)=>{sheet.getRow(index+2).getCell('etapa').border={left:{style:'medium',color:{argb:`FF${colors.get(row.id)!.slice(1).toUpperCase()}`}}}})
  const parents=report.rows.filter(row=>row.parent_id===null)
  if(report.planned){const totalPlanned=sheet.addRow({etapa:'Total Valor Orçado',valor_previsto:parents.reduce((sum,row)=>sum+Number(row.valor_previsto),0)});totalPlanned.font={bold:true};totalPlanned.getCell('valor_previsto').numFmt='R$ #,##0.00'}
  const totalPaid=sheet.addRow({etapa:'Total Valor Pago',valor_pago:parents.reduce((sum,row)=>sum+Number(row.valor_pago),0)});totalPaid.font={bold:true};totalPaid.getCell('valor_pago').numFmt='R$ #,##0.00'
  return workbook.xlsx.writeBuffer()
}
