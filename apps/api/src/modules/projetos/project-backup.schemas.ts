import { z } from 'zod'
import { AppError } from '../../shared/errors.js'
import { PAYMENT_STATUS_VALUES } from '../pagamentos/payment-status.js'

export const PROJECT_BACKUP_VERSION='2.0' as const
const id=z.coerce.number().int().positive()
const numeric=z.union([z.number(),z.string()]).refine(value=>value!==''&&Number.isFinite(Number(value)),'Informe um número válido.')
const nullableNumeric=numeric.nullable()
const nonnegative=numeric.refine(v=>Number(v)>=0&&Number(v)<=999_999_999_999.99,'Informe um valor não negativo dentro do limite permitido.').nullable()
const text=z.string().nullable()
const nullableDate=z.preprocess(value=>value instanceof Date?value.toISOString().slice(0,10):value,z.iso.date().nullable())
const date=z.preprocess(value=>value instanceof Date?value.toISOString().slice(0,10):value,z.iso.date())
const role=z.enum(['PROPRIETARIO','ENGENHEIRO','LEITOR'])
const project=z.object({
  nome:z.string().min(3).max(160),descricao:z.string().min(1).max(4000),arquivado:z.boolean(),
  endereco:text,cep:text,logradouro:text,numero:text,complemento:text,bairro:text,cidade:text,estado:text,codigo_ibge_cidade:text,
  latitude:nullableNumeric,longitude:nullableNumeric,data_inicio:nullableDate,previsao_termino:nullableDate,
  area_construida:nullableNumeric,area_com_laje:nullableNumeric,area_sem_laje:nullableNumeric,processo_aprovacao:text,
  pasta_digital:text,planta_numero:text,alvara:text,art:text,cno_obra:text,matricula_terreno:text,
}).strict()
const stage=z.object({old_id:id,parent_old_id:id.nullable(),nome:z.string().min(1).max(180),descricao:text,cor:z.string().regex(/^#[0-9a-fA-F]{6}$/),
  data_inicio_previsto:nullableDate,data_fim_previsto:nullableDate,data_inicio:nullableDate,data_fim:nullableDate,valor_previsto:numeric,valor_executado:numeric,ordem:z.number().int()}).strict()
const task=z.object({old_id:id,descricao:z.string().min(2).max(240),observacao:text,status:z.enum(['PARADO','INICIADO','FINALIZADO']),prioridade:z.enum(['BAIXA','ALTA'])}).strict()
const cash=z.object({old_id:id,data:date,descricao:z.string().min(2).max(240),detalhes:text,valor:numeric}).strict()
const expense=z.object({excluida:z.boolean().optional(),old_id:id,stage_old_id:id.nullable(),descricao:z.string().min(2).max(240),status:z.enum(PAYMENT_STATUS_VALUES),data_pagamento:nullableDate,forma_pagamento:text,
  fornecedor:text,nome_contato_fornecedor:text,contato_fornecedor:text,observacao:text,valor_desconto:nonnegative,numero_nota_fiscal:text,
  data_emissao:nullableDate,data_agendamento:nullableDate,data_entrega:nullableDate,ordem:z.number().int()}).strict()
const item=z.object({old_id:id,despesa_old_id:id.nullable(),descricao:z.string().min(2).max(240),quantidade:nonnegative,unidade:text,observacao:text,
  valor_unitario:nonnegative,valor_desconto:nonnegative,valor_total:nonnegative,valor_total_manual:z.boolean(),ordem:z.number().int()}).strict()
const category=z.object({old_id:id,nome:z.string().min(2).max(80)}).strict()
const attachment=z.object({nome_original:z.string().max(255),tipo_mime:z.string().max(100),base64:z.string().min(1).max(84_000_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,'Conteúdo Base64 inválido.')}).strict()
const document=z.object({old_id:id,despesa_old_id:id.nullable(),titulo:z.string().min(1).max(180),descricao:text,tipo_origem:z.enum(['ARQUIVO','LINK']),
  url:z.url().nullable(),nome_original:text,tipo_mime:text,category_old_ids:z.array(id),arquivo:attachment.nullable(),criado_em:z.preprocess(v=>v instanceof Date?v.toISOString():v,z.iso.datetime())}).strict()
export const projectBackupSchema=z.object({backup:z.object({
  version:z.literal(PROJECT_BACKUP_VERSION),exported_at:z.iso.datetime(),source_project_id:id,warnings:z.array(z.string()),project,
  modules:z.object({cronograma:z.array(stage),tarefas:z.array(task),fluxo_caixa:z.array(cash),despesas:z.array(expense),despesa_itens:z.array(item),
    links_cotacao:z.array(z.object({item_old_id:id,url:z.url().refine(v=>/^https?:\/\//i.test(v),'Utilize uma URL HTTP ou HTTPS.')}).strict()),categorias:z.array(category),documentos:z.array(document),
    participantes:z.array(z.object({email:z.email().max(254),papel:role}).strict()),
    permissoes_membros:z.array(z.object({email:z.email().max(254),chave:z.string().min(3).max(120),permitido:z.boolean()}).strict()),
    permissoes_papeis:z.array(z.object({papel:role,chave:z.string().min(3).max(120),permitido:z.boolean()}).strict()),
  }).strict(),
}).strict()}).strict().superRefine((value,context)=>{
  const m=value.backup.modules
  const issue=(path:(string|number)[],message:string)=>context.addIssue({code:'custom',path:['backup','modules',...path],message})
  for(const key of ['cronograma','tarefas','fluxo_caixa','despesas','despesa_itens','categorias','documentos'] as const){
    const ids=m[key].map(row=>row.old_id);if(new Set(ids).size!==ids.length)issue([key],'Existem identificadores duplicados.')
  }
  const stages=new Map(m.cronograma.map(row=>[row.old_id,row]))
  const expenses=new Set(m.despesas.map(row=>row.old_id)),items=new Set(m.despesa_itens.map(row=>row.old_id)),categories=new Set(m.categorias.map(row=>row.old_id))
  m.cronograma.forEach((row,index)=>{if(row.parent_old_id!==null&&(!stages.has(row.parent_old_id)||stages.get(row.parent_old_id)?.parent_old_id!==null))issue(['cronograma',index,'parent_old_id'],'Informe uma etapa pai existente, sem referências circulares.')})
  m.despesas.forEach((row,index)=>{if(row.stage_old_id!==null&&!stages.has(row.stage_old_id))issue(['despesas',index,'stage_old_id'],'A etapa da despesa não existe no backup.')})
  m.despesa_itens.forEach((row,index)=>{if(row.despesa_old_id!==null&&!expenses.has(row.despesa_old_id))issue(['despesa_itens',index,'despesa_old_id'],'A despesa do item não existe no backup.')})
  m.links_cotacao.forEach((row,index)=>{if(!items.has(row.item_old_id))issue(['links_cotacao',index,'item_old_id'],'O item da cotação não existe no backup.')})
  m.documentos.forEach((row,index)=>{
    if(row.despesa_old_id!==null&&!expenses.has(row.despesa_old_id))issue(['documentos',index,'despesa_old_id'],'A despesa do documento não existe no backup.')
    if(new Set(row.category_old_ids).size!==row.category_old_ids.length||row.category_old_ids.some(id=>!categories.has(id)))issue(['documentos',index,'category_old_ids'],'Categorias duplicadas ou ausentes no backup.')
    if(row.tipo_origem==='LINK'&&!row.url)issue(['documentos',index,'url'],'Informe o link do documento.')
    if(row.url&&!/^https?:\/\//i.test(row.url))issue(['documentos',index,'url'],'Utilize HTTP ou HTTPS.')
  })
})
export type ProjectBackup=z.infer<typeof projectBackupSchema>
export function parseProjectBackup(value:unknown):ProjectBackup{
  const version=value&&typeof value==='object'&&'backup' in value&&value.backup&&typeof value.backup==='object'&&'version' in value.backup?String(value.backup.version):''
  if(version&&version!==PROJECT_BACKUP_VERSION)throw new AppError(422,`Versão de backup incompatível: ${version}. Versão aceita: ${PROJECT_BACKUP_VERSION}.`,'BACKUP_VERSAO_INCOMPATIVEL')
  const parsed=projectBackupSchema.safeParse(value)
  if(!parsed.success)throw new AppError(422,'O arquivo não possui uma estrutura de backup válida.','BACKUP_INVALIDO',parsed.error.issues.map(issue=>({campo:issue.path.join('.'),mensagem:issue.message})))
  return parsed.data
}
export function parseProjectBackupJson(content:string):ProjectBackup{
  try{return parseProjectBackup(JSON.parse(content))}catch(error){if(error instanceof AppError)throw error;throw new AppError(422,'O arquivo selecionado não contém um JSON válido.','BACKUP_JSON_INVALIDO')}
}
