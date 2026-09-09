import { mkdir, writeFile } from 'node:fs/promises'
import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'
import pg from 'pg'

dotenv.config({ path: '.env' })
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL})
const output='tmp/report-validation'
await mkdir(output,{recursive:true})
try{
  const access=await pool.query(`SELECT mp.usuario_id,mp.projeto_id FROM membros_projeto mp JOIN usuarios u ON u.id=mp.usuario_id JOIN papeis pa ON pa.id=mp.papel_id JOIN projetos p ON p.id=mp.projeto_id WHERE mp.ativo AND u.ativo AND p.excluido_em IS NULL AND pa.codigo='PROPRIETARIO' ORDER BY mp.id LIMIT 1`)
  if(!access.rows[0])throw new Error('Nenhum projeto disponível para validação.')
  const {usuario_id:userId,projeto_id:projectId}=access.rows[0]
  const token=jwt.sign({tipo:'sessao'},process.env.JWT_SECRET,{subject:String(userId),expiresIn:'10m',issuer:'minhaobra-api',audience:'minhaobra-web'})
  const base=`http://127.0.0.1:${process.env.PORT||3001}/api/projetos/${projectId}`
  const headers={Authorization:`Bearer ${token}`}
  const getJson=async(path)=>{const response=await fetch(base+path,{headers});if(!response.ok)throw new Error(`${path}: HTTP ${response.status} ${await response.text()}`);return response.json()}
  const today=new Date().toISOString().slice(0,10)
  const payments=await getJson('/pagamentos?porPagina=100')
  let foundDated=false;let previous=null
  for(const payment of payments.pagamentos){if(!payment.data_pagamento){if(foundDated)throw new Error('Pagamento sem data não está no início da ordenação.')}else{foundDated=true;const current=payment.data_pagamento.slice(0,10);if(previous&&current>previous)throw new Error('Pagamentos não estão em data decrescente.');previous=current}}
  const flowCurrent=await getJson('/fluxo-caixa?porPagina=100&incluirFuturos=false')
  if(flowCurrent.itens.some(item=>item.data.slice(0,10)>today))throw new Error('Fluxo sem provisão retornou lançamento futuro.')
  const flowFuture=await getJson('/fluxo-caixa?porPagina=100&incluirFuturos=true')
  if(flowFuture.total<flowCurrent.total)throw new Error('Fluxo com provisão possui menos registros que o fluxo atual.')
  const schedule=await getJson('/cronograma')
  if(schedule.etapas.some(item=>!Object.hasOwn(item,'data_inicio_previsto')||!Object.hasOwn(item,'data_fim_previsto')))throw new Error('Datas previstas ausentes no Cronograma.')
  const dashboard=await getJson('/dashboard')
  for(const field of ['cidade','estado','bairro','latitude','longitude'])if(!Object.hasOwn(dashboard.projeto,field))throw new Error(`Campo de localização ausente: ${field}`)
  const exports=[['pagamentos','/pagamentos/relatorio'],['fluxo-caixa','/fluxo-caixa/relatorio?incluirFuturos=true'],['cronograma','/cronograma/relatorio']]
  for(const [name,route] of exports){
    for(const extension of ['pdf','xlsx']){
      const url=route.includes('?')?`${route.replace('?',`.${extension}?`)}`:`${route}.${extension}`
      const response=await fetch(base+url,{headers})
      if(!response.ok)throw new Error(`${url}: HTTP ${response.status} ${await response.text()}`)
      const bytes=Buffer.from(await response.arrayBuffer())
      if(bytes.length<1000)throw new Error(`${name}.${extension} parece vazio.`)
      await writeFile(`${output}/${name}.${extension}`,bytes)
    }
  }
  console.log(JSON.stringify({projectId,pagamentos:payments.total,ordenacaoPagamentos:'ok',fluxoSemProvisao:flowCurrent.total,fluxoComProvisao:flowFuture.total,cronograma:schedule.totalRegistros,localizacao:'ok',relatorios:'6 arquivos gerados'}))
}finally{await pool.end()}
