import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Copy, ExternalLink, FileText, Link2, Paperclip, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { ImportDialog } from '../components/imports/ImportDialog'
import { ExpandedRowDetails } from '../components/ExpandedRowDetails'
import { ExportAction } from '../components/ExportDialog'
import { AddButton, EmptyState, ErrorNotice, PageHeader } from '../components/Ui'
import { api, jsonBody } from '../lib/api'
import { formatDate, formatMoney, formatQuantity } from '../lib/format'
import { PAYMENT_STATUSES, paymentStatusClass, paymentStatusLabel, type PaymentStatus } from '../lib/paymentStatus'
import { compareByOrderedValues, useSortableData } from '../lib/sorting'
import { formatStageOption, formatStageSelectionOption, parentStage, scheduleStageColorClass, type StageOption } from '../lib/stage'
import { useProjectAccess } from '../lib/projectAccess'

type ProductLink={id:number;url:string;loja:string}
type Payment={id:number;descricao:string;fornecedor:string|null;contato_fornecedor:string|null;nome_contato_fornecedor:string|null;observacao:string|null;ordem:number;etapa_id:number|null;etapa:string|null;etapa_cor:string|null;quantidade:string|null;unidade:string|null;chave_pix:string|null;valor:string|null;status:PaymentStatus;forma_pagamento:string|null;data_pagamento:string|null;data_agendamento:string|null;data_entrega:string|null;links_cotacao:ProductLink[];quantidade_documentos:number}
type PaymentList={pagamentos:Payment[];total:number}
type Stage=StageOption
type PaymentDocument={id:number;titulo:string;categoria:string;url:string|null;nome_original:string|null;tipo_origem:'LINK'|'ARQUIVO';criado_em:string}
type PaymentDocumentDraft={id:string;titulo:string;source:'LINK'|'ARQUIVO';url:string|null;file:File|null}
type QuoteLinkDraft={id:string;url:string}
type PaymentSort='data_pagamento'|'etapa'|'descricao'|'fornecedor'|'valor'|'status'

const dateInput=(value:string|null|undefined)=>value?.slice(0,10)||''

const nullableText=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():null
const validQuoteUrl=(value:string)=>{try{const url=new URL(value.trim());return url.protocol==='http:'||url.protocol==='https:'}catch{return false}}
const paymentDocumentForm=(draft:PaymentDocumentDraft)=>{const form=new FormData();form.set('titulo',draft.titulo);form.set('categoria','Pagamentos');if(draft.source==='LINK'&&draft.url)form.set('url',draft.url);if(draft.source==='ARQUIVO'&&draft.file)form.set('arquivo',draft.file);return form}
const uploadPaymentDocument=(projectId:string,paymentId:number,form:FormData)=>api(`/projetos/${projectId}/pagamentos/${paymentId}/documentos`,{method:'POST',body:form})

function PaymentDocuments({projectId,paymentId,editable=false,compact=false,drafts=[],onDraftsChange}:{projectId:string;paymentId?:number;editable?:boolean;compact?:boolean;drafts?:PaymentDocumentDraft[];onDraftsChange?:(drafts:PaymentDocumentDraft[])=>void}){
  const client=useQueryClient()
  const[source,setSource]=useState<'ARQUIVO'|'LINK'>('LINK')
  const[title,setTitle]=useState('');const[url,setUrl]=useState('');const[file,setFile]=useState<File|null>(null);const[formError,setFormError]=useState('')
  const endpoint=`/projetos/${projectId}/pagamentos/${paymentId||0}/documentos`
  const{data,error}=useQuery({queryKey:['documentos-pagamento',projectId,paymentId],queryFn:()=>api<{documentos:PaymentDocument[]}>(endpoint),enabled:Boolean(paymentId)})
  const save=useMutation({mutationFn:(form:FormData)=>uploadPaymentDocument(projectId,paymentId!,form),onSuccess:()=>{void client.invalidateQueries({queryKey:['documentos-pagamento',projectId,paymentId]});void client.invalidateQueries({queryKey:['pagamentos',projectId]})}})
  const remove=useMutation({mutationFn:(id:number)=>api(`${endpoint}/${id}`,{method:'DELETE'}),onSuccess:()=>{void client.invalidateQueries({queryKey:['documentos-pagamento',projectId,paymentId]});void client.invalidateQueries({queryKey:['pagamentos',projectId]})}})
  const reset=()=>{setTitle('');setUrl('');setFile(null);setFormError('')}
  const add=()=>{const normalizedTitle=title.trim();if(!normalizedTitle){setFormError('Informe o título do documento.');return}if(source==='LINK'&&!url.trim()){setFormError('Informe a URL do link.');return}if(source==='ARQUIVO'&&!file){setFormError('Selecione um arquivo.');return}const draft:PaymentDocumentDraft={id:crypto.randomUUID(),titulo:normalizedTitle,source,url:source==='LINK'?url.trim():null,file:source==='ARQUIVO'?file:null};if(paymentId){save.mutate(paymentDocumentForm(draft),{onSuccess:reset});return}onDraftsChange?.([...drafts,draft]);reset()}
  if(compact)return <section className="cash-flow-payment-documents"><strong>Comprovantes e documentos</strong>{error?<small>Não foi possível carregar os documentos.</small>:!data?<small>Carregando documentos…</small>:!data.documentos.length?<small>Nenhum comprovante ou documento vinculado.</small>:<div>{data.documentos.map(document=><a key={document.id} href={document.url||`/api${endpoint}/${document.id}/arquivo`} target="_blank" rel="noopener noreferrer"><FileText/><span>{document.titulo} · {document.categoria} · {formatDate(document.criado_em)}</span><ExternalLink/></a>)}</div>}</section>
  return <section className="payment-resource-panel">
    <header><div><Paperclip/><strong>Documentos relacionados</strong><span>{paymentId?data?.documentos.length||0:drafts.length}</span></div></header>
    {error&&<ErrorNotice message={error.message}/>}<div className="payment-document-list">{paymentId?data?.documentos.map(document=><div key={document.id}><FileText/><p><strong>{document.titulo}</strong><small>{document.categoria} · {formatDate(document.criado_em)}</small></p><a href={document.url||`/api${endpoint}/${document.id}/arquivo`} target="_blank" rel="noopener noreferrer"><ExternalLink/>Abrir</a>{editable&&<button className="danger" type="button" onClick={()=>confirm('Excluir este documento?')&&remove.mutate(document.id)}><Trash2/></button>}</div>):drafts.map(document=><div key={document.id}><FileText/><p><strong>{document.titulo}</strong><small>Pagamentos · {document.source==='LINK'?'Link pendente':'Arquivo pendente'}</small></p><span className="payment-document-draft-source">{document.source==='LINK'?document.url:document.file?.name}</span><button className="danger" type="button" onClick={()=>onDraftsChange?.(drafts.filter(item=>item.id!==document.id))}><Trash2/></button></div>)}</div>
    {editable&&<div className="resource-inline-form"><input value={title} onChange={event=>setTitle(event.target.value)} placeholder="Título do documento"/><select value={source} onChange={event=>{setSource(event.target.value as 'ARQUIVO'|'LINK');setFormError('')}}><option value="LINK">Link</option><option value="ARQUIVO">Arquivo</option></select>{source==='LINK'?<input value={url} type="url" onChange={event=>setUrl(event.target.value)} placeholder="https://…"/>:<input type="file" onChange={event=>setFile(event.target.files?.[0]||null)} accept="application/pdf,image/jpeg,image/png,image/webp"/>}<button type="button" className="app-button" disabled={save.isPending} onClick={add}><Plus/>Adicionar</button></div>}{formError&&<small className="payment-document-form-error">{formError}</small>}
  </section>
}

function PaymentLinks({projectId,payment,editable=false,compact=false,drafts=[],onDraftsChange}:{projectId:string;payment?:Payment;editable?:boolean;compact?:boolean;drafts?:QuoteLinkDraft[];onDraftsChange?:(drafts:QuoteLinkDraft[])=>void}){
  const client=useQueryClient()
  const[draft,setDraft]=useState('');const[formError,setFormError]=useState('')
  const[persistedLinks,setPersistedLinks]=useState<ProductLink[]>(payment?.links_cotacao||[])
  const endpoint=`/projetos/${projectId}/pagamentos/${payment?.id||0}/links`
  const add=useMutation({mutationFn:(url:string)=>api<{link:ProductLink}>(endpoint,{method:'POST',...jsonBody({url})}),onSuccess:result=>{setDraft('');setPersistedLinks(current=>current.some(link=>link.id===result.link.id)?current:[...current,result.link]);void client.invalidateQueries({queryKey:['pagamentos',projectId]})}})
  const remove=useMutation({mutationFn:(id:number)=>api(`${endpoint}/${id}`,{method:'DELETE'}),onSuccess:(_,id)=>{setPersistedLinks(current=>current.filter(link=>link.id!==id));void client.invalidateQueries({queryKey:['pagamentos',projectId]})}})
  const links=payment?persistedLinks:drafts
  const addLink=()=>{const url=draft.trim();if(!validQuoteUrl(url)){setFormError('Informe uma URL válida iniciada por http:// ou https://.');return}if(links.some(link=>link.url===url)){setFormError('Este link já foi adicionado.');return}if(payment)add.mutate(url);else{onDraftsChange?.([...drafts,{id:crypto.randomUUID(),url}]);setDraft('')}setFormError('')}
  const removeLink=(link:ProductLink|QuoteLinkDraft)=>{if(payment)remove.mutate((link as ProductLink).id);else onDraftsChange?.(drafts.filter(item=>item.id!==link.id))}
  if(compact)return <section className="cash-flow-payment-documents"><strong>Links de cotação</strong>{!links.length?<small>Nenhum link de cotação vinculado.</small>:<div>{links.map(link=><a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"><Link2/><span>{payment?(link as ProductLink).loja:'Link de cotação'} · {link.url}</span><ExternalLink/></a>)}</div>}</section>
  return <section className="payment-resource-panel">
    <header><div><Link2/><strong>Links de cotação</strong><span>{links.length}</span></div></header>
    <div className="quote-link-list">{links.map(link=><div key={link.id}><Link2/><strong>{payment?(link as ProductLink).loja:'Link de cotação'}</strong><a className="quote-url" href={link.url} target="_blank" rel="noopener noreferrer">{link.url}</a>{editable&&<button type="button" onClick={()=>void navigator.clipboard.writeText(link.url)}><Copy/></button>}<a href={link.url} target="_blank" rel="noopener noreferrer"><ExternalLink/></a>{editable&&<button className="danger" type="button" onClick={()=>removeLink(link)}><Trash2/></button>}</div>)}</div>
    {editable&&<><div className="resource-inline-form"><input value={draft} onChange={event=>{setDraft(event.target.value);setFormError('')}} type="url" placeholder="https://fornecedor.com/cotacao"/><button type="button" className="app-button" disabled={!validQuoteUrl(draft)||add.isPending} onClick={addLink}><Plus/>Adicionar</button></div>{formError&&<small className="payment-document-form-error">{formError}</small>}</>}
  </section>
}

function PaymentExpandedDetails({ projectId, payment }: { projectId: string; payment: Payment }) {
  return <ExpandedRowDetails title="Detalhes do pagamento" columns={[
    [{ label: 'Status', value: paymentStatusLabel(payment.status) }, { label: 'Data de agendamento', value: formatDate(payment.data_agendamento) }, { label: 'Data de entrega', value: formatDate(payment.data_entrega) }],
    [{ label: 'Forma de pagamento', value: payment.forma_pagamento || '\u2014' }, { label: 'Chave Pix', value: payment.chave_pix || '\u2014' }, { label: 'Contato do fornecedor', value: payment.contato_fornecedor || '\u2014' }],
    [{ label: 'Nome do funcion\u00e1rio', value: payment.nome_contato_fornecedor || '\u2014' }],
  ]} details={payment.observacao}><PaymentDocuments projectId={projectId} paymentId={payment.id} compact/><PaymentLinks projectId={projectId} payment={payment} compact/></ExpandedRowDetails>
}
export function PaymentsPage(){
  const{projetoId}=useParams()
  const{can}=useProjectAccess()
  const client=useQueryClient()
  const endpoint=`/projetos/${projetoId}/pagamentos`
  const[status,setStatus]=useState('')
  const[stageFilter,setStageFilter]=useState('')
  const[search,setSearch]=useState('')
  const[editing,setEditing]=useState<Payment|'new'|null>(null)
  const[documentDrafts,setDocumentDrafts]=useState<PaymentDocumentDraft[]>([])
  const[quoteLinkDrafts,setQuoteLinkDrafts]=useState<QuoteLinkDraft[]>([])
  const[documentUploadError,setDocumentUploadError]=useState('')
  const[expanded,setExpanded]=useState<number|null>(null)
  const[importing,setImporting]=useState(false)
  const paymentsKey=['pagamentos',projetoId,status,stageFilter,search] as const
  const{data,error}=useQuery({queryKey:paymentsKey,queryFn:()=>api<PaymentList>(`${endpoint}?porPagina=100&status=${status}&etapaId=${stageFilter}&busca=${encodeURIComponent(search)}`)})
  const{data:stages}=useQuery({queryKey:['etapas-pagamentos',projetoId],queryFn:()=>api<{etapas:Stage[]}>(`${endpoint}/etapas`)})
  const parentStages=[...(stages?.etapas||[])].filter(stage=>stage.parent_id===null).sort((left,right)=>left.ordem-right.ordem||left.id-right.id)
  const parentStagePositions=new Map(parentStages.map((stage,index)=>[stage.id,index]))
  const paymentStageColorClass=(payment:Payment)=>{
    const stage=stages?.etapas.find(item=>item.id===payment.etapa_id)
    if(!stage||!stages)return ''
    const position=parentStagePositions.get(parentStage(stage,stages.etapas).id)
    return position===undefined?'':scheduleStageColorClass(position)
  }
  const paymentSort=useSortableData(data?.pagamentos||[],'status','asc','last',(left,right)=>{
    const statusOrder:Record<PaymentStatus,number>={PENDENTE:1,EM_NEGOCIACAO:2,PAGO_AGUARDANDO_ENTREGA:3,CONCLUIDO:4}
    const grouped=compareByOrderedValues(left,right,{status:statusOrder})
    if(grouped)return grouped
    return String(right.data_pagamento||'').localeCompare(String(left.data_pagamento||''),'pt-BR')||right.id-left.id
  })
  const save=useMutation({mutationFn:({id,payload}:{id?:number;payload:Record<string,unknown>})=>api(`${endpoint}${id?`/${id}`:''}`,{method:id?'PUT':'POST',...jsonBody(payload)}),onSuccess:()=>{void client.invalidateQueries({queryKey:['pagamentos',projetoId]});void client.invalidateQueries({queryKey:['dashboard',projetoId]})}})
  const remove=useMutation({mutationFn:(id:number)=>api(`${endpoint}/${id}`,{method:'DELETE'}),onSuccess:()=>{setEditing(null);void client.invalidateQueries({queryKey:['pagamentos',projetoId]})}})
  const[statusFeedback,setStatusFeedback]=useState('')
  const statusUpdate=useMutation({
    mutationFn:({id,status}:{id:number;status:PaymentStatus})=>api<{pagamento:{id:number;status:PaymentStatus}}>(`${endpoint}/${id}/status`,{method:'PATCH',...jsonBody({status})}),
    onMutate:async({id,status:nextStatus})=>{setStatusFeedback('');await client.cancelQueries({queryKey:paymentsKey});const previous=client.getQueryData<PaymentList>(paymentsKey);client.setQueryData<PaymentList>(paymentsKey,current=>current?{...current,pagamentos:current.pagamentos.map(payment=>payment.id===id?{...payment,status:nextStatus}:payment)}:current);return{previous}},
    onError:(_error,_variables,context)=>{if(context?.previous)client.setQueryData(paymentsKey,context.previous)},
    onSuccess:(_result,{id})=>setStatusFeedback(`Status do pagamento #${id} atualizado.`),
    onSettled:()=>{void client.invalidateQueries({queryKey:['pagamentos',projetoId]});void client.invalidateQueries({queryKey:['dashboard',projetoId]});void client.invalidateQueries({queryKey:['recursos-atuais',projetoId]});void client.invalidateQueries({queryKey:['etapas',projetoId]})},
  })
  const closeEditor=()=>{setEditing(null);setDocumentDrafts([]);setQuoteLinkDrafts([]);setDocumentUploadError('')}
  const openNewPayment=()=>{setDocumentDrafts([]);setQuoteLinkDrafts([]);setDocumentUploadError('');setEditing('new')}
  const paymentFromPayload=(id:number,payload:Record<string,unknown>):Payment=>({id,descricao:String(payload.descricao||''),fornecedor:nullableText(payload.fornecedor),contato_fornecedor:nullableText(payload.contato_fornecedor),nome_contato_fornecedor:nullableText(payload.nome_contato_fornecedor),observacao:nullableText(payload.observacao),ordem:Number(payload.ordem||0),etapa_id:payload.etapa_id?Number(payload.etapa_id):null,etapa:null,etapa_cor:null,quantidade:nullableText(payload.quantidade),unidade:nullableText(payload.unidade),chave_pix:nullableText(payload.chave_pix),valor:nullableText(payload.valor),status:payload.status as PaymentStatus,forma_pagamento:nullableText(payload.forma_pagamento),data_pagamento:nullableText(payload.data_pagamento),data_agendamento:nullableText(payload.data_agendamento),data_entrega:nullableText(payload.data_entrega),links_cotacao:[],quantidade_documentos:0})
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setDocumentUploadError('');const form=new FormData(event.currentTarget);const resources=editing==='new'?{links_cotacao:quoteLinkDrafts.map(link=>link.url)}:{};const payload={etapa_id:form.get('etapa_id')||null,quantidade:form.get('quantidade')||null,unidade:form.get('unidade')||null,descricao:form.get('descricao'),fornecedor:form.get('fornecedor')||null,contato_fornecedor:form.get('contato_fornecedor')||null,nome_contato_fornecedor:form.get('nome_contato_fornecedor')||null,chave_pix:form.get('chave_pix')||null,valor:form.get('valor')||null,status:form.get('status'),forma_pagamento:form.get('forma_pagamento')||null,data_pagamento:form.get('data_pagamento')||null,data_agendamento:form.get('data_agendamento')||null,data_entrega:form.get('data_entrega')||null,observacao:form.get('observacao')||null,ordem:form.get('ordem')||0,...resources};try{const result=await save.mutateAsync({id:editing==='new'?undefined:editing?.id,payload});if(editing==='new'&&documentDrafts.length){const paymentId=Number((result as {pagamento?:{id?:number}}).pagamento?.id);if(!paymentId||!projetoId)throw new Error('Não foi possível preparar o vínculo dos documentos.');try{for(const document of documentDrafts)await uploadPaymentDocument(projetoId,paymentId,paymentDocumentForm(document))}catch{setDocumentDrafts([]);setDocumentUploadError('O pagamento foi criado, mas um documento não pôde ser enviado. Revise e adicione-o novamente.');setEditing(paymentFromPayload(paymentId,payload));return}}closeEditor()}catch{return}}
  const sortHeader=(label:string,column:PaymentSort,className?:string)=><button className={`payment-grid-sort ${className||''}`} onClick={()=>paymentSort.toggle(column as keyof Payment)}>{label}<span>{paymentSort.sort.key===column?(paymentSort.sort.direction==='asc'?'↑':'↓'):'↕'}</span></button>
  return <div>
    <PageHeader eyebrow="FINANCEIRO" title="Pagamentos" description="Consulta cronológica de pagamentos, cotações e documentos." action={<div className="heading-actions">{can('pagamentos.exportar')&&<ExportAction title="Pagamentos" pdfUrl={`/api${endpoint}/relatorio.pdf`} xlsxUrl={`/api${endpoint}/relatorio.xlsx`}/>} {can('pagamentos.inserir')&&<><button className="app-button" onClick={()=>setImporting(true)}><Upload/>Importar</button><AddButton onClick={openNewPayment}>Novo pagamento</AddButton></>}</div>}/>
    <section className="table-toolbar payments-toolbar" aria-label="Filtros de pagamentos"><label className="search-field"><span>Pesquisar</span><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Descrição ou fornecedor"/></label><label className="compact-field"><span>Etapa</span><select value={stageFilter} onChange={event=>setStageFilter(event.target.value)}><option value="">Todas</option>{stages?.etapas.filter(stage=>stage.parent_id===null).map(stage=><option value={stage.id} key={stage.id}>{formatStageOption(stage,stages?.etapas||[])}</option>)}</select></label><label className="compact-field"><span>Status</span><select value={status} onChange={event=>setStatus(event.target.value)}><option value="">Todos</option>{PAYMENT_STATUSES.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</select></label></section>
    {error&&<ErrorNotice message={error.message}/>} {statusUpdate.error&&<ErrorNotice message={statusUpdate.error.message}/>} {statusFeedback&&<div className="inline-success">{statusFeedback}</div>} {!data?.pagamentos.length?<EmptyState title="Nenhum pagamento encontrado" description="Cadastre manualmente ou importe um arquivo TSV/JSON."/>:<section className="crud-table-frame payment-grid"><div className="payment-grid-summary"><strong>{data.total}</strong> pagamentos</div><div className="payment-grid-header"><span/>{sortHeader('Data pagamento','data_pagamento')}{sortHeader('Etapa','etapa')}{sortHeader('Descrição','descricao')}{sortHeader('Fornecedor','fornecedor')}{sortHeader('Valor','valor','money-column')}{sortHeader('Status','status','status-column')}<span>Ações</span></div>{paymentSort.sorted.map(payment=>{const stageColorClass=paymentStageColorClass(payment);return <article key={payment.id} className={`payment-row status-colored-row ${paymentStatusClass(payment.status)}${expanded===payment.id?' expanded':''}`}>
      <div className="payment-grid-row" onClick={()=>setExpanded(expanded===payment.id?null:payment.id)}><button className="expand-button">{expanded===payment.id?<ChevronDown/>:<ChevronRight/>}</button><span>{formatDate(payment.data_pagamento)}</span><span>{payment.etapa?<span className={`payment-stage-badge ${stageColorClass}`}>{payment.etapa}</span>:'—'}</span><div><strong>{payment.descricao}</strong>{payment.observacao&&<small className="payment-row-observation">{payment.observacao}</small>}<small>{payment.quantidade?`${formatQuantity(payment.quantidade)} ${payment.unidade||''}`:''}</small></div><span>{payment.fornecedor||'—'}</span><strong className="money-column">{payment.valor===null?'—':formatMoney(payment.valor)}</strong><select className={`payment-status-select ${paymentStatusClass(payment.status)}`} value={payment.status} disabled={!can('pagamentos.atualizar')||(statusUpdate.isPending&&statusUpdate.variables?.id===payment.id)} aria-label={`Alterar status de ${payment.descricao}`} onClick={event=>event.stopPropagation()} onChange={event=>statusUpdate.mutate({id:payment.id,status:event.target.value as PaymentStatus})}>{PAYMENT_STATUSES.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</select><div className="row-actions">{can('pagamentos.atualizar')&&<button title="Editar pagamento" onClick={event=>{event.stopPropagation();setDocumentDrafts([]);setQuoteLinkDrafts([]);setDocumentUploadError('');setEditing(payment)}}><Pencil/></button>}{can('pagamentos.excluir')&&<button className="danger" title="Excluir pagamento" onClick={event=>{event.stopPropagation();if(confirm(`Excluir o pagamento ${payment.descricao}?`) )remove.mutate(payment.id)}}><Trash2/></button>}</div></div>
      {expanded===payment.id&&projetoId&&<PaymentExpandedDetails projectId={projetoId} payment={payment}/>}
    </article>})}</section>}
    {editing&&<div className="dialog-backdrop"><section className="dialog large payment-dialog"><header><div><small>PAGAMENTO</small><h2>{editing==='new'?'Novo pagamento':'Editar pagamento'}</h2></div><button onClick={closeEditor}><X/></button></header><form onSubmit={submit}>
      {save.error&&<ErrorNotice message={save.error.message}/>} {documentUploadError&&<ErrorNotice message={documentUploadError}/>}
      <label className="field span-2"><span>Descrição</span><input name="descricao" required defaultValue={editing==='new'?'':editing.descricao}/></label>
      <label className="field"><span>Quantidade (opcional)</span><input name="quantidade" type="number" min="0" step="0.001" defaultValue={editing==='new'?'':editing.quantidade||''}/></label>
      <label className="field"><span>Unidade (opcional)</span><input name="unidade" defaultValue={editing==='new'?'':editing.unidade||''}/></label>
      <label className="field"><span>Etapa</span><select name="etapa_id" defaultValue={editing==='new'?'':editing.etapa_id||''}><option value="">Sem etapa</option>{stages?.etapas.map(stage=><option value={stage.id} key={stage.id}>{formatStageSelectionOption(stage,stages?.etapas||[])}</option>)}</select></label>
      <label className="field"><span>Data pagamento</span><input name="data_pagamento" type="date" defaultValue={editing==='new'?'':dateInput(editing.data_pagamento)}/></label>
      <label className="field span-2"><span>Observações e detalhamento</span><textarea name="observacao" rows={6} defaultValue={editing==='new'?'':editing.observacao||''}/></label>
      <label className="field"><span>Fornecedor (opcional)</span><input name="fornecedor" defaultValue={editing==='new'?'':editing.fornecedor||''}/></label>
      <label className="field"><span>Contato do fornecedor (opcional)</span><input name="contato_fornecedor" inputMode="tel" placeholder="+55 (00) 00000-0000" title="Formato: +55 (00) 00000-0000" defaultValue={editing==='new'?'' : editing.contato_fornecedor||''}/></label>
      <label className="field"><span>Nome do funcionário (opcional)</span><input name="nome_contato_fornecedor" placeholder="Nome do funcionário" defaultValue={editing==='new'?'' : editing.nome_contato_fornecedor||''}/></label>
      <label className="field"><span>Chave Pix (opcional)</span><input name="chave_pix" defaultValue={editing==='new'?'':editing.chave_pix||''}/></label>
      <label className="field"><span>Valor (opcional)</span><input name="valor" type="number" min="0" step="0.01" defaultValue={editing==='new'?'':editing.valor||''}/></label>
      <label className="field"><span>Status</span><select name="status" defaultValue={editing==='new'?'PENDENTE':editing.status}>{PAYMENT_STATUSES.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
      <label className="field"><span>Data agendamento</span><input name="data_agendamento" type="date" defaultValue={editing==='new'?'':dateInput(editing.data_agendamento)}/></label>
      <label className="field"><span>Data entrega</span><input name="data_entrega" type="date" defaultValue={editing==='new'?'':dateInput(editing.data_entrega)}/></label>
      <label className="field"><span>Forma de pagamento</span><select name="forma_pagamento" defaultValue={editing==='new'?'':editing.forma_pagamento||''}><option value="">Não definida</option><option value="PIX">PIX</option><option value="CARTAO">Cartão</option><option value="DINHEIRO">Dinheiro</option><option value="BOLETO">Boleto</option><option value="TRANSFERENCIA">Transferência</option><option value="OUTRO">Outro</option></select></label>
      <label className="field compact"><span>Ordem</span><input name="ordem" type="number" min="0" defaultValue={editing==='new'?0:editing.ordem}/></label>
      <div className="span-2">{projetoId&&<PaymentDocuments projectId={projetoId} paymentId={editing==='new'?undefined:editing.id} editable drafts={editing==='new'?documentDrafts:undefined} onDraftsChange={editing==='new'?setDocumentDrafts:undefined}/>}</div>
      <div className="span-2">{projetoId&&<PaymentLinks key={editing==='new'?'new':editing.id} projectId={projetoId} payment={editing==='new'?undefined:editing} editable drafts={editing==='new'?quoteLinkDrafts:undefined} onDraftsChange={editing==='new'?setQuoteLinkDrafts:undefined}/>}</div>
      <footer className="form-actions span-2">{editing!=='new'&&<button type="button" className="app-button danger-action" onClick={()=>confirm('Excluir este pagamento?')&&remove.mutate(editing.id)}><Trash2/>Excluir</button>}<button type="button" className="app-button" onClick={closeEditor}>Cancelar</button><button className="app-button primary" disabled={save.isPending}>{save.isPending?'Salvando…':'Salvar pagamento'}</button></footer>
    </form></section></div>}
    {importing&&<ImportDialog endpoint={endpoint} entityName="pagamentos" onClose={()=>setImporting(false)} onComplete={()=>{setImporting(false);void client.invalidateQueries({queryKey:['pagamentos',projetoId]})}}/>}
  </div>
}
