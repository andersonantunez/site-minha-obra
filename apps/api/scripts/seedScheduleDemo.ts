import { env } from '../src/config/env.js'
import { pool, withTransaction } from '../src/config/database.js'
import { getSchedule } from '../src/modules/etapas/schedule.service.js'
import { recordAudit } from '../src/shared/audit.js'

const projectId=Number(process.argv[2])
const oldMarker='[CRONOGRAMA_DEMO_V1]'
const marker='[CRONOGRAMA_DEMO_EXISTING_V2]'
const host=new URL(env.databaseUrl).hostname
if(env.nodeEnv==='production'||!['localhost','127.0.0.1','[::1]'].includes(host))throw new Error('Esta massa fictícia só pode ser aplicada na base local de desenvolvimento.')
if(!Number.isSafeInteger(projectId)||projectId<1)throw new Error('Informe o projeto: npx tsx apps/api/scripts/seedScheduleDemo.ts 1')

type Scenario='early'|'onTime'|'late'|'ongoing'|'lateOngoing'|'waiting'
type Stage={id:number;nome:string;cor:string;ordem:number;parent_id:number|null;valor_previsto:string;data_inicio_previsto:Date|string|null;data_fim_previsto:Date|string|null;data_inicio:Date|string|null;data_fim:Date|string|null}
const plans:{name:string;start:number;days:number;scenario:Scenario;items:string[]}[]=[
 {name:'Projetos, licenças e preparação',start:-75,days:30,scenario:'early',items:['Levantamento topográfico','Projeto arquitetônico','Projetos complementares','Aprovação e licenças']},
 {name:'Serviços preliminares e canteiro',start:-35,days:20,scenario:'early',items:['Limpeza do terreno','Instalação do canteiro','Ligações provisórias','Tapumes e segurança']},
 {name:'Terraplenagem',start:-24,days:14,scenario:'onTime',items:['Marcação dos níveis','Corte e retirada de solo','Aterro e compactação','Regularização do terreno']},
 {name:'Fundações',start:-22,days:29,scenario:'ongoing',items:['Locação e escavação','Execução de sapatas','Vigas baldrame','Impermeabilização da fundação']},
 {name:'Estrutura',start:-8,days:36,scenario:'lateOngoing',items:['Armação dos pilares','Concretagem de pilares','Vigas e formas','Laje e cura do concreto']},
 {name:'Alvenaria e vedações',start:-3,days:40,scenario:'waiting',items:['Alvenaria térrea','Vergas e contravergas','Alvenaria superior','Revisão das vedações']},
 {name:'Cobertura',start:25,days:35,scenario:'waiting',items:['Montagem da estrutura','Instalação das telhas','Rufos e calhas','Teste de estanqueidade']},
 {name:'Instalações elétricas e hidráulicas',start:20,days:50,scenario:'waiting',items:['Eletrodutos e caixas','Rede de água fria','Tubulações de esgoto','Cabos, quadros e testes']},
 {name:'Impermeabilização',start:40,days:30,scenario:'waiting',items:['Preparação de áreas molhadas','Impermeabilização de banheiros','Impermeabilização de áreas externas','Teste de estanqueidade']},
 {name:'Revestimentos e acabamentos',start:45,days:50,scenario:'waiting',items:['Chapisco e emboço','Contrapiso','Revestimento cerâmico','Pintura e arremates']},
 {name:'Esquadrias, louças, metais e mobiliário',start:75,days:35,scenario:'waiting',items:['Instalação das janelas','Portas internas','Louças e metais','Mobiliário e vedação']},
 {name:'Área externa, paisagismo, testes e entrega',start:105,days:45,scenario:'waiting',items:['Drenagem e pavimentação','Muros e paisagismo','Vistoria e testes finais','Limpeza e entrega']},
]
const iso=(value:Date|string|null)=>value instanceof Date?value.toISOString().slice(0,10):value?.slice(0,10)||null

try {
 const result=await withTransaction(async client=>{
  const project=(await client.query<{nome:string;proprietario_usuario_id:number}>('SELECT nome,proprietario_usuario_id FROM projetos WHERE id=$1 AND excluido_em IS NULL FOR UPDATE',[projectId])).rows[0]
  if(!project)throw new Error('Projeto não encontrado.')
  const parents=(await client.query<Stage>('SELECT * FROM cronogramas WHERE projeto_id=$1 AND parent_id IS NULL AND excluido_em IS NULL AND (descricao IS NULL OR descricao NOT LIKE $2) ORDER BY ordem,id',[projectId,oldMarker+'%'])).rows
  for(const plan of plans)if(!parents.some(parent=>parent.nome===plan.name))throw new Error('Etapa existente não encontrada: '+plan.name)
  const demos=(await client.query<Stage>('SELECT * FROM cronogramas WHERE projeto_id=$1 AND descricao LIKE $2 AND excluido_em IS NULL FOR UPDATE',[projectId,oldMarker+'%'])).rows
  const demoIds=demos.map(row=>row.id)
  if(demoIds.length){
   const links=await client.query('SELECT id FROM despesas WHERE projeto_id=$1 AND etapa_id=ANY($2::bigint[]) AND excluido_em IS NULL UNION ALL SELECT id FROM pagamentos WHERE projeto_id=$1 AND etapa_id=ANY($2::bigint[]) AND excluido_em IS NULL UNION ALL SELECT id FROM cronogramas WHERE projeto_id=$1 AND parent_id=ANY($2::bigint[]) AND NOT(id=ANY($2::bigint[])) AND excluido_em IS NULL',[projectId,demoIds])
   if(links.rowCount)throw new Error('Os exemplos receberam novos vínculos; remova-os antes de desfazer a massa anterior.')
   await client.query('UPDATE cronogramas SET excluido_em=NOW() WHERE projeto_id=$1 AND id=ANY($2::bigint[])',[projectId,demoIds])
   await recordAudit(client,{projetoId:projectId,usuarioId:project.proprietario_usuario_id,acao:'CRONOGRAMA_DEMO_DESFEITO',entidade:'cronograma',dadosAnteriores:demos,dadosNovos:{removidos:demoIds}})
  }
  const prior=await client.query('SELECT id FROM cronogramas WHERE projeto_id=$1 AND descricao LIKE $2 AND excluido_em IS NULL',[projectId,marker+'%'])
  if(prior.rowCount)return {project:project.nome,removed:demoIds.length,created:0,message:'As etapas existentes já foram preenchidas; nenhum subitem foi duplicado.'}
  const now=new Date(),anchor=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())
  const date=(offset:number)=>new Date(anchor+offset*86_400_000).toISOString().slice(0,10)
  const offset=(value:string)=>(Date.parse(value+'T00:00:00Z')-anchor)/86_400_000
  const actual=(start:number,end:number,scenario:Scenario):[string|null,string|null]=>{
   if(scenario==='waiting'||start>0)return [null,null]
   if(scenario==='early')return [date(start),date(end-3)]
   if(scenario==='onTime')return [date(start),date(end)]
   if(scenario==='late')return [date(start+2),date(Math.min(0,end+5))]
   return [date(scenario==='lateOngoing'?Math.min(-1,start+4):start),null]
  }
  let updated=0,created=0
  for(const plan of plans){
   const stage=parents.find(parent=>parent.nome===plan.name)!
   const plannedStart=iso(stage.data_inicio_previsto)||date(plan.start),plannedEnd=iso(stage.data_fim_previsto)||date(plan.start+plan.days)
   const start=offset(plannedStart),end=offset(plannedEnd),duration=end-start
   if(duration<0)throw new Error('Período previsto inválido na etapa '+stage.nome)
   const generated=actual(start,end,plan.scenario)
   const hadActual=Boolean(stage.data_inicio||stage.data_fim)
   const realStart=hadActual?iso(stage.data_inicio):generated[0],realEnd=hadActual?iso(stage.data_fim):generated[1]
   const after=(await client.query<Stage>('UPDATE cronogramas SET data_inicio_previsto=$3,data_fim_previsto=$4,data_inicio=$5,data_fim=$6 WHERE projeto_id=$1 AND id=$2 RETURNING *',[projectId,stage.id,plannedStart,plannedEnd,realStart,realEnd])).rows[0]!
   await recordAudit(client,{projetoId:projectId,usuarioId:project.proprietario_usuario_id,acao:'CRONOGRAMA_TESTE_PREENCHIDO',entidade:'cronograma',registroId:stage.id,dadosAnteriores:stage,dadosNovos:after})
   updated++
   const children=(await client.query<Stage>('SELECT * FROM cronogramas WHERE projeto_id=$1 AND parent_id=$2 AND excluido_em IS NULL ORDER BY ordem,id',[projectId,stage.id])).rows
   // Fill existing children too, retaining IDs, names, amounts and any recorded dates.
   for(const child of children){
    const childStart=iso(child.data_inicio_previsto)||plannedStart,childEnd=iso(child.data_fim_previsto)||date(Math.min(end,start+Math.ceil(duration/3)))
    const childActual=actual(offset(childStart),offset(childEnd),realEnd?'onTime':plan.scenario)
    const childAfter=(await client.query('UPDATE cronogramas SET data_inicio_previsto=COALESCE(data_inicio_previsto,$3),data_fim_previsto=COALESCE(data_fim_previsto,$4),data_inicio=COALESCE(data_inicio,$5),data_fim=COALESCE(data_fim,$6) WHERE projeto_id=$1 AND id=$2 RETURNING *',[projectId,child.id,childStart,childEnd,childActual[0],childActual[1]])).rows[0]
    await recordAudit(client,{projetoId:projectId,usuarioId:project.proprietario_usuario_id,acao:'CRONOGRAMA_TESTE_PREENCHIDO',entidade:'cronograma',registroId:child.id,dadosAnteriores:child,dadosNovos:childAfter})
    updated++
   }
   const available=Math.max(0,Math.round(Number(stage.valor_previsto)*100)-children.reduce((sum,child)=>sum+Math.round(Number(child.valor_previsto)*100),0))
   const firstOrder=children.length?Math.max(...children.map(child=>child.ordem))+1:1
   for(const [index,name] of plan.items.entries()){
    const childStart=start+Math.floor(index*duration/5),childEnd=Math.min(end,childStart+Math.ceil(duration/3))
    let scenario=plan.scenario
    if(realEnd)scenario=(['onTime','early','late',plan.scenario] as Scenario[])[index]!
    else if(plan.scenario==='ongoing'||plan.scenario==='lateOngoing')scenario=index===3?'waiting':index===2&&childStart<0?'lateOngoing':childEnd<-5?(index===0?'onTime':'late'):childStart<-1?plan.scenario:'waiting'
    let [actualStart,actualEnd]=actual(childStart,childEnd,scenario)
    if(actualStart&&realStart&&actualStart<realStart)actualStart=realStart
    if(actualEnd&&realEnd&&actualEnd>realEnd)actualEnd=realEnd
    if(actualStart&&actualEnd&&actualEnd<actualStart)actualEnd=actualStart
    const value=(Math.floor(available/4)+(index<available%4?1:0))/100
    const inserted=(await client.query('INSERT INTO cronogramas (projeto_id,parent_id,nome,descricao,cor,data_inicio_previsto,data_fim_previsto,data_inicio,data_fim,valor_previsto,valor_executado,ordem,criado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12) RETURNING *',[projectId,stage.id,name,marker+' Subitem fictício para teste do Cronograma e Gantt.',stage.cor,date(childStart),date(childEnd),actualStart,actualEnd,value,firstOrder+index,project.proprietario_usuario_id])).rows[0]
    await recordAudit(client,{projetoId:projectId,usuarioId:project.proprietario_usuario_id,acao:'SUBITEM_CRONOGRAMA_CRIADO',entidade:'cronograma',registroId:inserted.id,dadosNovos:inserted})
    created++
   }
  }
  return {project:project.nome,removed:demoIds.length,updated,created,message:'Etapas existentes preenchidas e subitens incluídos. Nenhuma etapa pai foi criada.'}
 })
 const schedule=await getSchedule(projectId)
 console.log(JSON.stringify({...result,total:schedule.total,totalRegistros:schedule.totalRegistros},null,2))
}finally {await pool.end()}
