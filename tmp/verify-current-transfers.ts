import assert from 'node:assert/strict'
import {pool} from '../apps/api/src/config/database.js'
import {getExpenseReport} from '../apps/api/src/modules/despesas/expense-report.service.js'
import {getCashFlowReport,getScheduleReport} from '../apps/api/src/modules/relatorios/planning-report.service.js'
import {exportProjectBackup,importProjectBackup} from '../apps/api/src/modules/projetos/project-backup.service.js'
import {parseProjectBackup} from '../apps/api/src/modules/projetos/project-backup.schemas.js'
import {parseExpenseImport,applyExpenseImport} from '../apps/api/src/modules/despesas/expense-import.service.js'
import {importExample} from '../apps/api/src/shared/import-examples.js'
import {expenseTotalSql} from '../apps/api/src/modules/despesas/expense-financial.js'
async function main(){
 const projects=await pool.query('SELECT id,proprietario_usuario_id FROM projetos WHERE excluido_em IS NULL ORDER BY id LIMIT 1')
 const project=projects.rows[0];assert(project,'Nenhum projeto para validar')
 const expense=await getExpenseReport(project.id)
 const schedule=await getScheduleReport(project.id)
 const flow=await getCashFlowReport(project.id,{search:'',start:null,end:null,includeFuture:true})
 const backup=parseProjectBackup(await exportProjectBackup(project.id))
 const admins=await pool.query('SELECT id FROM usuarios WHERE ativo AND usuario_eh_administrador_sistema(id) ORDER BY id LIMIT 1')
 assert(admins.rows[0],'Administrador para teste de restauração')
 const testBackup=structuredClone(backup)
 testBackup.backup.project.nome='VERIFICACAO BACKUP TRANSACIONAL'
 for(const doc of testBackup.backup.modules.documentos)doc.arquivo=null
 const connect=pool.connect.bind(pool)
 for(const forceError of [false,true]){
  const testClient=await connect()
  const originalQuery=testClient.query.bind(testClient)
  const patchedQuery=async(sql:string,values?:unknown[])=>{
   if(forceError&&sql.includes('INSERT INTO pagamentos'))throw new Error('Falha controlada para validar rollback')
   if(sql==='COMMIT'){
    const projectCheck=await originalQuery('SELECT id FROM projetos WHERE nome=$1',[testBackup.backup.project.nome])
    assert.equal(projectCheck.rows.length,1)
    const newId=projectCheck.rows[0].id
    assert.notEqual(newId,project.id)
    const parents=await originalQuery('SELECT count(*)::int n FROM despesas WHERE projeto_id=$1',[newId])
    assert.equal(parents.rows[0].n,testBackup.backup.modules.despesas.length)
    const items=await originalQuery('SELECT count(*)::int n FROM pagamentos WHERE projeto_id=$1',[newId])
    assert.equal(items.rows[0].n,testBackup.backup.modules.despesa_itens.length)
    const docs=await originalQuery('SELECT count(*)::int n FROM documentos_projeto WHERE projeto_id=$1',[newId])
    assert.equal(docs.rows[0].n,testBackup.backup.modules.documentos.filter(d=>d.tipo_origem==='LINK'||d.arquivo).length)
    return originalQuery('ROLLBACK')
   }
   return originalQuery(sql,values)
  }
  testClient.query=patchedQuery as typeof testClient.query
  pool.connect=(async()=>testClient) as typeof pool.connect
  try{
   if(forceError)await assert.rejects(importProjectBackup(admins.rows[0].id,testBackup))
   else await importProjectBackup(admins.rows[0].id,testBackup)
  }finally{pool.connect=connect as typeof pool.connect;testClient.query=originalQuery as typeof testClient.query}
  const residual=await pool.query('SELECT count(*)::int n FROM projetos WHERE nome=$1',[testBackup.backup.project.nome])
  assert.equal(residual.rows[0].n,0)
 }
 console.log('Restauração completa com novos IDs e rollback de falha intermediária: OK')
 console.log(JSON.stringify({despesas:expense.despesas.length,itens:expense.despesas.flatMap(d=>d.itens).length,cronograma:schedule.rows.length,fluxo:flow.rows.length,backup:backup.backup.version}))
 const client=await pool.connect()
 try {
  await client.query('BEGIN')
  const before=await client.query('SELECT count(*)::int n FROM despesas WHERE projeto_id=$1',[project.id])
  for(const format of ['JSON','TSV'] as const){
   const parsed=parseExpenseImport(format,importExample('despesas',format));assert.equal(parsed.erros.length,0)
   const result=await applyExpenseImport(client,project.id,project.proprietario_usuario_id,parsed.registros,'ACRESCENTAR')
   assert.deepEqual(result,{despesas:1,itens:2,documentos:1})
   const total=await client.query('SELECT '+expenseTotalSql('d')+' total FROM despesas d WHERE projeto_id=$1 ORDER BY id DESC LIMIT 1',[project.id])
   assert.equal(Number(total.rows[0].total),5615)
  }
  await client.query('ROLLBACK')
  const after=await client.query('SELECT count(*)::int n FROM despesas WHERE projeto_id=$1',[project.id])
  assert.equal(after.rows[0].n,before.rows[0].n)
  console.log('JSON/TSV, descontos, total manual, categorias, vínculos e rollback: OK')
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
main().finally(()=>pool.end()).catch(error=>{console.error(error.message);process.exitCode=1})
