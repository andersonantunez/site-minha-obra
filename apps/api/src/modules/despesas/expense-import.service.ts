import { z } from 'zod'
import type { PoolClient } from 'pg'
import { parseImportContent, type ImportFormat } from '../../shared/importParser.js'
import { AppError } from '../../shared/errors.js'
import { purchaseSchema, purchaseItemSchema } from '../pagamentos/payment.schemas.js'
import { PAYMENT_STATUSES, SETTLED_PAYMENT_STATUSES } from '../pagamentos/payment-status.js'
import { activeScheduleStageWhere } from '../etapas/stage-query.js'
import { assignDocumentCategoryByName } from '../arquivos/document-categories.js'

const reference=z.string().trim().min(1).max(120)
const expenseRow=z.object({...purchaseSchema.shape,tipo:z.literal('DESPESA'),referencia:reference,etapa:z.string().trim().nullable().optional()})
  .omit({etapa_id:true,ordem:true}).strict().superRefine((row,context)=>{
    if(SETTLED_PAYMENT_STATUSES.includes(row.status)&&!row.data_pagamento)context.addIssue({code:'custom',path:['data_pagamento'],message:'Informe a data do pagamento para uma despesa paga ou concluída.'})
  })
const itemRow=z.object({...purchaseItemSchema.shape,tipo:z.literal('ITEM'),referencia:reference,despesa_ref:reference})
  .omit({ordem:true}).strict()
const documentRow=z.object({tipo:z.literal('DOCUMENTO'),despesa_ref:reference,titulo:z.string().trim().min(2).max(180),url:z.url().refine(v=>/^https?:\/\//i.test(v),'Utilize uma URL HTTP ou HTTPS.'),categorias:z.array(z.string().trim().min(2).max(80)).min(1)})
const rowSchema=z.discriminatedUnion('tipo',[expenseRow,itemRow,documentRow])
export type ExpenseImportRow=z.infer<typeof rowSchema>
const httpLinks=z.array(z.url().refine(v=>/^https?:\/\//i.test(v),'Utilize uma URL HTTP ou HTTPS.'))

export function parseExpenseImport(format:ImportFormat,content:string){
  const source=parseImportContent(format,content)
  const rows:ExpenseImportRow[]=[]
  const errors:{linha:number;erros:string[]}[]=[]
  const originalLines:number[]=[]
  source.forEach((value,index)=>{
    const line=index+2
    if(!value||typeof value!=='object'||Array.isArray(value)){errors.push({linha:line,erros:['Informe um objeto com tipo DESPESA, ITEM ou DOCUMENTO.']});return}
    const raw={...value} as Record<string,unknown>
    try{
      for(const key of ['links_cotacao','categorias'])if(typeof raw[key]==='string')raw[key]=JSON.parse(String(raw[key]))
    }catch{errors.push({linha:line,erros:['links_cotacao e categorias devem ser listas JSON válidas.']});return}
    if(raw.status)raw.status=PAYMENT_STATUSES.find(option=>option.label.toLowerCase()===String(raw.status).toLowerCase())?.value||raw.status
    // O TSV utiliza um cabeçalho comum para os três tipos; células vazias não são campos obsoletos.
    for(const [key,value] of Object.entries(raw))if(value===null)delete raw[key]
    const result=rowSchema.safeParse(raw)
    if(!result.success){errors.push({linha:line,erros:result.error.issues.map(issue=>`${issue.path.join('.')||'registro'}: ${issue.message}`)});return}
    if(result.data.tipo==='ITEM'&&!httpLinks.safeParse(result.data.links_cotacao||[]).success){errors.push({linha:line,erros:['links_cotacao: informe URLs HTTP ou HTTPS válidas.']});return}
    rows.push(result.data)
    originalLines.push(line)
  })
  const references=new Set<string>()
  const expenses=new Set(rows.filter(row=>row.tipo==='DESPESA').map(row=>row.referencia))
  rows.forEach((row,index)=>{
    if(row.tipo!=='DOCUMENTO'){
      const key=`${row.tipo}:${row.referencia}`
      if(references.has(key))errors.push({linha:originalLines[index]!,erros:[`referencia repetida: ${row.referencia}.`]})
      references.add(key)
    }
    if(row.tipo!=='DESPESA'&&!expenses.has(row.despesa_ref))errors.push({linha:originalLines[index]!,erros:[`despesa_ref: ${row.despesa_ref} não consta no arquivo.`]})
  })
  return {registros:rows,erros:errors,total:source.length}
}

export async function applyExpenseImport(client:PoolClient,projectId:number,userId:number,rows:ExpenseImportRow[],mode:'ACRESCENTAR'|'SUBSTITUIR'){
  const stages=await client.query<{id:number;nome:string}>(`SELECT id,nome FROM cronogramas c WHERE c.projeto_id=$1 AND c.parent_id IS NULL AND ${activeScheduleStageWhere('c')}`,[projectId])
  const parents=new Map<string,number>()
  // Validação dentro da transação; não resolve por ordem nem por IDs de outro projeto.
  const resolved=new Map<string,number|null>()
  for(const row of rows)if(row.tipo==='DESPESA'){
    const matches=stages.rows.filter(stage=>stage.nome.toLowerCase()===row.etapa?.toLowerCase())
    if(row.etapa&&matches.length!==1)throw new AppError(422,`Etapa inválida ou ambígua: ${row.etapa}. Informe exatamente o nome cadastrado no Cronograma.`,'ETAPA_IMPORTACAO_INVALIDA')
    resolved.set(row.referencia,matches[0]?.id||null)
  }
  if(mode==='SUBSTITUIR'){
    await client.query('UPDATE documentos_projeto SET excluido_em=NOW() WHERE projeto_id=$1 AND compra_id IS NOT NULL AND excluido_em IS NULL',[projectId])
    await client.query('UPDATE pagamentos SET excluido_em=NOW() WHERE projeto_id=$1 AND excluido_em IS NULL',[projectId])
    await client.query('UPDATE despesas SET excluido_em=NOW() WHERE projeto_id=$1 AND excluido_em IS NULL',[projectId])
  }
  for(const row of rows)if(row.tipo==='DESPESA'){
    const result=await client.query<{id:number}>(`INSERT INTO despesas (projeto_id,descricao,etapa_id,status,fornecedor,nome_contato_fornecedor,contato_fornecedor,observacao,valor_desconto,data_pagamento,forma_pagamento,numero_nota_fiscal,data_emissao,data_agendamento,data_entrega,criado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [projectId,row.descricao,resolved.get(row.referencia),row.status,row.fornecedor,row.nome_contato_fornecedor,row.contato_fornecedor,row.observacao,row.valor_desconto,row.data_pagamento,row.forma_pagamento,row.numero_nota_fiscal,row.data_emissao,row.data_agendamento,row.data_entrega,userId])
    parents.set(row.referencia,result.rows[0]!.id)
  }
  let items=0,documents=0
  for(const row of rows)if(row.tipo==='ITEM'){
    const result=await client.query<{id:number}>(`INSERT INTO pagamentos (projeto_id,compra_id,descricao,quantidade,unidade,observacao,valor_unitario,valor_desconto,valor,valor_total_manual,documentos_legados_habilitados,criado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11) RETURNING id`,
      [projectId,parents.get(row.despesa_ref),row.descricao,row.quantidade,row.unidade,row.observacao,row.valor_unitario,row.valor_desconto,row.valor_total,row.valor_total!==null,userId])
    for(const url of new Set(row.links_cotacao||[]))await client.query('INSERT INTO links_cotacao_pagamento (pagamento_id,url,criado_por) VALUES ($1,$2,$3)',[result.rows[0]!.id,url,userId])
    items++
  }else if(row.tipo==='DOCUMENTO'){
    const result=await client.query<{id:number}>(`INSERT INTO documentos_projeto (projeto_id,compra_id,titulo,categoria,tipo_origem,url,criado_por) VALUES ($1,$2,$3,'Despesas','LINK',$4,$5) RETURNING id`,[projectId,parents.get(row.despesa_ref),row.titulo,row.url,userId])
    for(const name of new Set(row.categorias)){
      await client.query('INSERT INTO categorias_documento (projeto_id,nome,criado_por) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[projectId,name,userId])
      await assignDocumentCategoryByName(client,result.rows[0]!.id,projectId,name)
    }
    documents++
  }
  return {despesas:parents.size,itens:items,documentos:documents}
}
