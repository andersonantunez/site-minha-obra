import {mkdir,writeFile} from 'node:fs/promises'
import {finished} from 'node:stream/promises'
import {createWriteStream} from 'node:fs'
import {pool} from '../../apps/api/src/config/database.js'
import {getExpenseReport,createExpensePdf} from '../../apps/api/src/modules/despesas/expense-report.service.js'
import {getCashFlowReport,getScheduleReport,createCashFlowPdf,createSchedulePdf} from '../../apps/api/src/modules/relatorios/planning-report.service.js'
async function main(){
 const r=await pool.query('SELECT id FROM projetos WHERE excluido_em IS NULL ORDER BY id LIMIT 1');const id=r.rows[0].id
 await mkdir('tmp/pdfs',{recursive:true})
 const expenses=await getExpenseReport(id)
 const flow=await getCashFlowReport(id,{search:'',start:null,end:null,includeFuture:true})
 const schedule=await getScheduleReport(id)
 for(const [name,pdf] of [['despesas',createExpensePdf(id,expenses)],['fluxo',createCashFlowPdf(flow)],['cronograma',createSchedulePdf(schedule)]] as const){
  const stream=createWriteStream('tmp/pdfs/current-'+name+'.pdf');pdf.pipe(stream);pdf.end();await finished(stream)
 }
 await writeFile('tmp/pdfs/validation-counts.json',JSON.stringify({despesas:expenses.despesas.length,fluxo:flow.rows.length,cronograma:schedule.rows.length}))
}
main().finally(()=>pool.end()).catch(e=>{console.error(e.message);process.exitCode=1})
