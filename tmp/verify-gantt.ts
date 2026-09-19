import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import {pool,query} from '../apps/api/src/config/database.js'
import {getSchedule} from '../apps/api/src/modules/etapas/schedule.service.js'
import {getScheduleReport,createScheduleWorkbook} from '../apps/api/src/modules/relatorios/planning-report.service.js'
import {activityState,dateDay,localToday} from '../apps/web/src/lib/gantt.js'
try {
 const schedule=await getSchedule(1),report=await getScheduleReport(1,{planned:true})
 assert.deepEqual(report.rows,schedule.arvore.flatMap(({subitens,...parent})=>[parent,...subitens]))
 const response=JSON.parse(JSON.stringify(schedule)) as typeof schedule
 assert.equal(response.total,12)
 assert.equal(response.totalRegistros,61)
 assert.deepEqual(response.arvore.map(row=>row.id),[1,2,3,4,5,6,7,10,11,12,13,14])
 assert.ok(response.etapas.every(row=>!row.descricao?.startsWith('[CRONOGRAMA_DEMO_V1]')))
 assert.ok(response.arvore.every(row=>!row.nome.includes('Homologação')))
 const newChildren=response.etapas.filter(row=>row.descricao?.startsWith('[CRONOGRAMA_DEMO_EXISTING_V2]'))
 assert.equal(newChildren.length,48)
 for(const stage of response.arvore){
  assert.ok(stage.subitens.length>=4)
  assert.ok(stage.data_inicio_previsto&&stage.data_fim_previsto)
  assert.equal(stage.subitens.filter(row=>row.descricao?.startsWith('[CRONOGRAMA_DEMO_EXISTING_V2]')).length,4)
  for(const child of stage.subitens.filter(row=>row.descricao?.startsWith('[CRONOGRAMA_DEMO_EXISTING_V2]'))){
   assert.equal(child.cor,stage.cor)
   if(child.data_inicio&&stage.data_inicio)assert.ok(dateDay(child.data_inicio)!>=dateDay(stage.data_inicio)!)
  }
 }
 assert.ok(response.etapas.find(row=>row.id===15)?.data_inicio_previsto)
 const states=response.etapas.map(row=>activityState(row,dateDay(localToday())!))
 assert.ok(states.every(state=>!state.invalid))
 for(const label of ['Concluída no prazo','Concluída antes do prazo','Concluída com atraso','Em andamento','Em andamento com atraso','Não iniciada','Não iniciada com atraso'])assert.ok(states.some(state=>state.label===label),label)
 const stored=(await query('SELECT id,valor_previsto FROM cronogramas WHERE projeto_id=1 AND parent_id IS NULL AND excluido_em IS NULL ORDER BY ordem,id')).rows
 assert.equal(stored[0].valor_previsto,'8000.00')
 assert.equal(stored[1].valor_previsto,'32000.00')
 assert.ok(stored.slice(2).every(row=>row.valor_previsto==='0.00'))
 const invalidLinks=(await query('SELECT d.id FROM despesas d JOIN cronogramas c ON c.id=d.etapa_id WHERE d.projeto_id=1 AND d.excluido_em IS NULL AND c.excluido_em IS NOT NULL')).rows
 assert.equal(invalidLinks.length,0)
 const book=new ExcelJS.Workbook();await book.xlsx.load(await createScheduleWorkbook(report))
 const sheet=book.worksheets[0]!
 assert.equal(sheet.rowCount,report.rows.length+3)
 report.rows.forEach((row,index)=>{
  const parent=row.parent_id===null?row:report.rows.find(candidate=>candidate.id===row.parent_id)!
  assert.equal(sheet.getRow(index+2).getCell(2).border.left?.color?.argb,'FF'+parent.cor.slice(1).toUpperCase())
 })
 console.log(JSON.stringify({etapasOriginais:12,subitensNovos:48,subitemAnteriorPreservado:true,total:61,homologacaoDuplicadaRemovida:true,vinculosPreservados:true,orcamentosDosPaisPreservados:true,situacoes:[...new Set(states.map(state=>state.label))],relatorios:'hierarquia, ordem e cores conferidas'},null,2))
}finally{await pool.end()}
