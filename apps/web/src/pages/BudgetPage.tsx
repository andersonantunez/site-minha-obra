import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, ExternalLink, FileText, Pencil, Search, Trash2, Upload, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { ImportDialog } from '../components/imports/ImportDialog'
import { ExportAction } from '../components/ExportDialog'
import { AddButton, EmptyState, ErrorNotice, MetricCard, PageHeader } from '../components/Ui'
import { api, jsonBody } from '../lib/api'
import { formatDate, formatMoney, formatQuantity } from '../lib/format'
import { paymentStatusLabel, type PaymentStatus } from '../lib/paymentStatus'
import { SortableHeader } from '../components/Ui'
import { useSortableData } from '../lib/sorting'
import { useProjectAccess } from '../lib/projectAccess'

type CashFlowItem = { id: string; origem: 'MANUAL' | 'PAGAMENTO'; payment_record_type: 'COMPRA' | 'ITEM_ORFAO' | null; origem_id: number; data: string; descricao: string; detalhes: string | null; quantidade: string | null; unidade: string | null; fornecedor: string | null; payment_status: PaymentStatus | null; data_agendamento: string | null; data_entrega: string | null; forma_pagamento: string | null; chave_pix: string | null; contato_fornecedor: string | null; nome_contato_fornecedor: string | null; payment_etapa: string | null; payment_observacao: string | null; valor: string | null; editavel: boolean; provisionado: boolean }
type CashFlowData = { itens: CashFlowItem[]; total: number; indicadores: { total_entrada: string; total_saida: string; saldo_atual: string; saldo_com_provisao: string } }
type PaymentDocument = { id: number; titulo: string; url: string | null }
type ExpenseDetail = { id:number; descricao:string; status:PaymentStatus; forma_pagamento:string|null; nome_contato_fornecedor:string|null; contato_fornecedor:string|null; numero_nota_fiscal:string|null; data_emissao:string|null; data_agendamento:string|null; data_entrega:string|null; observacao:string|null; etapa:string|null; itens:{id:number;descricao:string;quantidade:string|null;unidade:string|null;observacao:string|null;valor_unitario:string|null;valor_desconto:string|null;valor_total:string|null}[]; documentos:(PaymentDocument & {tipo_origem:'LINK'|'ARQUIVO';nome_original:string|null;tipo_mime:string|null})[] }
export function BudgetPage() {
  const { projetoId } = useParams()
  const { can } = useProjectAccess()
  const client = useQueryClient()
  const endpoint = `/projetos/${projetoId}/fluxo-caixa`
  const [editing, setEditing] = useState<CashFlowItem | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [includeFuture,setIncludeFuture]=useState(false)
  const query = new URLSearchParams({ porPagina: '100' })
  if (search) query.set('busca', search)
  if (startDate) query.set('dataInicio', startDate)
  if (endDate) query.set('dataFim', endDate)
  query.set('incluirFuturos',String(includeFuture))
  const { data, error } = useQuery({ queryKey: ['fluxo-caixa', projetoId, search, startDate, endDate,includeFuture], queryFn: () => api<CashFlowData>(`${endpoint}?${query}`) })
  const flowSort = useSortableData(data?.itens || [], 'data', 'desc', 'first')
  const refresh = () => void client.invalidateQueries({ queryKey: ['fluxo-caixa', projetoId] })
  const save = useMutation({ mutationFn: ({ id, payload }: { id?: number; payload: Record<string, unknown> }) => api(`${endpoint}${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', ...jsonBody(payload) }), onSuccess: () => { setEditing(null); refresh() } })
  const remove = useMutation({ mutationFn: (id: number) => api(`${endpoint}/${id}`, { method: 'DELETE' }), onSuccess: refresh })
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); save.mutate({ id: editing === 'new' ? undefined : editing?.origem_id, payload: { data: form.get('data'), descricao: form.get('descricao'), detalhes: form.get('detalhes') || null, valor: form.get('valor') } }) }
  const indicators = data?.indicadores

  return <div>
    <PageHeader eyebrow="FINANCEIRO" title="Fluxo de Caixa" description="Entradas, saídas e pagamentos liquidados em uma única linha do tempo." action={<div className="heading-actions">{can('orcamento.exportar') && <ExportAction title="Fluxo de Caixa" pdfUrl={`/api${endpoint}/relatorio.pdf?${query}`} xlsxUrl={`/api${endpoint}/relatorio.xlsx?${query}`}/>} {can('orcamento.inserir') && <><button className="app-button" onClick={() => setImporting(true)}><Upload />Importar</button><AddButton onClick={() => setEditing('new')}>Novo lançamento</AddButton></>}</div>} />
    <div className="cash-flow-summary-heading"><div><strong>{includeFuture?'Com provisão':'Sem provisão'}</strong><span>{includeFuture?'Inclui valores com data futura.':'Considera somente lançamentos até hoje.'}</span></div><label className="future-toggle" title="Ao ativar, inclui lançamentos com data posterior a hoje: valores previstos para entrar ou sair do caixa da obra."><input type="checkbox" checked={includeFuture} onChange={event=>setIncludeFuture(event.target.checked)}/><span>Mostrar lançamentos futuros?</span></label></div>
    <section className="metrics-row cash-flow-metrics"><MetricCard label="Entrada" value={formatMoney(indicators?.total_entrada)} tone="cash-in" /><MetricCard label="Saída" value={formatMoney(indicators?.total_saida)} tone="cash-out" /><MetricCard label="Saldo" value={formatMoney(includeFuture?indicators?.saldo_com_provisao:indicators?.saldo_atual)} /></section>
    <section className="table-toolbar cash-flow-filters" aria-label="Filtros do fluxo de caixa"><label className="search-field"><span>Pesquisar</span><div><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Descrição ou detalhes" /></div></label><label className="field compact"><span>Data de início</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label className="field compact"><span>Data de fim</span><input type="date" min={startDate || undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></section>
    {error && <ErrorNotice message={error.message} />}
    {!data?.itens.length ? <EmptyState title="Nenhum lançamento encontrado" description="Cadastre uma entrada ou saída manualmente, importe um arquivo ou ajuste os filtros." /> : <section className="data-table-wrap cash-flow-table-wrap"><div className="table-summary"><strong>{data.total}</strong> lançamentos no fluxo de caixa</div><table className="data-table cash-flow-table"><thead><tr><th aria-label="Expandir detalhes"/><SortableHeader<CashFlowItem> label="Data" column="data" activeColumn={flowSort.sort.key} direction={flowSort.sort.direction} onSort={flowSort.toggle}/><SortableHeader<CashFlowItem> label="Descrição" column="descricao" activeColumn={flowSort.sort.key} direction={flowSort.sort.direction} onSort={flowSort.toggle}/><SortableHeader<CashFlowItem> label="Valor" column="valor" className="money-column" activeColumn={flowSort.sort.key} direction={flowSort.sort.direction} onSort={flowSort.toggle}/><SortableHeader<CashFlowItem> label="Provisionado" column="provisionado" activeColumn={flowSort.sort.key} direction={flowSort.sort.direction} onSort={flowSort.toggle}/><th>A&#199;&#213;ES</th></tr></thead><tbody>{flowSort.sorted.map((item) => <CashFlowRow key={item.id} projectId={projetoId} item={item} expanded={expanded === item.id} onExpand={() => setExpanded(expanded === item.id ? null : item.id)} canEdit={can('orcamento.atualizar')} canDelete={can('orcamento.excluir')} onEdit={() => setEditing(item)} onRemove={() => confirm('Excluir este lançamento?') && remove.mutate(item.origem_id)} />)}</tbody></table></section>}
    {editing && <div className="dialog-backdrop"><section className="dialog" role="dialog" aria-modal="true"><header><div><small>FLUXO DE CAIXA</small><h2>{editing === 'new' ? 'Novo lançamento' : 'Editar lançamento'}</h2></div><button onClick={() => setEditing(null)}><X /></button></header><form onSubmit={submit}>{save.error && <ErrorNotice message={save.error.message} />}<label className="field"><span>Data</span><input type="date" name="data" required defaultValue={editing === 'new' ? '' : editing.data.slice(0, 10)} /></label><label className="field"><span>Valor</span><input type="number" name="valor" step="0.01" required placeholder="Use negativo para saída" defaultValue={editing === 'new' ? '' : editing.valor ?? ''} /></label><label className="field span-2"><span>Descrição</span><input name="descricao" required minLength={2} defaultValue={editing === 'new' ? '' : editing.descricao} /></label><label className="field span-2"><span>Detalhes</span><textarea name="detalhes" rows={4} defaultValue={editing === 'new' ? '' : editing.detalhes || ''} /></label><footer className="form-actions span-2"><button type="button" className="app-button" onClick={() => setEditing(null)}>Cancelar</button><button className="app-button primary" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar lançamento'}</button></footer></form></section></div>}
    {importing && <ImportDialog endpoint={endpoint} entityName="Fluxo de Caixa" onClose={() => setImporting(false)} onComplete={() => { setImporting(false); refresh() }} />}
  </div>
}

function CashFlowRow({ projectId, item, expanded, onExpand, canEdit, canDelete, onEdit, onRemove }: { projectId?: string; item: CashFlowItem; expanded: boolean; onExpand: () => void; canEdit: boolean; canDelete: boolean; onEdit: () => void; onRemove: () => void }) {
  const hasValue = item.valor !== null
  const value = Number(item.valor ?? 0)
  const isExpense = item.origem === 'PAGAMENTO' && item.payment_record_type === 'COMPRA'
  return <><tr className="cash-flow-row" onClick={onExpand}><td><button className="expand-button" type="button" title={expanded ? 'Recolher despesa' : 'Expandir despesa'} aria-label={expanded ? 'Recolher despesa' : 'Expandir despesa'} onClick={(event) => { event.stopPropagation(); onExpand() }}>{expanded ? <ChevronDown/> : <ChevronRight/>}</button></td><td>{formatDate(item.data)}</td><td><strong>{item.descricao}</strong></td><td className={`money-column ${hasValue ? (value >= 0 ? 'cash-value-positive' : 'cash-value-negative') : ''}`}>{hasValue ? <>{value > 0 ? '+' : ''}{formatMoney(value)}</> : '—'}</td><td><span className={`provision-badge ${item.provisionado ? 'yes' : 'no'}`}>{item.provisionado ? 'Sim' : 'Não'}</span></td><td className="row-actions">{item.editavel && <>{canEdit && <button title="Editar lançamento" onClick={(event) => { event.stopPropagation(); onEdit() }}><Pencil /></button>}{canDelete && <button className="danger" title="Excluir lançamento" onClick={(event) => { event.stopPropagation(); onRemove() }}><Trash2 /></button>}</>}</td></tr>{expanded && <tr className="cash-flow-details-row"><td colSpan={6}>{isExpense && projectId ? <CashFlowExpenseDetails projectId={projectId} expenseId={item.origem_id}/> : <CashFlowManualDetails details={item.detalhes}/>}</td></tr>}</>
}

function CashFlowManualDetails({ details }: { details: string | null }) {
  return <div className="cash-flow-expense-details"><section className="cash-flow-detail-block observation-block"><p><strong>Observações:</strong> <span className="preserve-lines">{details || '—'}</span></p></section></div>
}

function CashFlowExpenseDetails({ projectId, expenseId }: { projectId: string; expenseId: number }) {
  const endpoint = `/projetos/${projectId}/fluxo-caixa/despesas/${expenseId}/detalhes`
  const { data, error } = useQuery({ queryKey: ['fluxo-caixa-despesa', projectId, expenseId], queryFn: () => api<{despesa:ExpenseDetail}>(endpoint) })
  if (error) return <ErrorNotice message="Não foi possível carregar os detalhes da despesa."/>
  if (!data) return <div className="cash-flow-expense-details"><small>Carregando detalhes…</small></div>
  const expense = data.despesa
  const documentBase = `/api/projetos/${projectId}/despesas/despesas/${expense.id}/documentos`
  return <div className="cash-flow-expense-details">
    <section className="cash-flow-detail-block"><strong>Detalhes da Despesa</strong><div className="payment-detail-columns"><div><p><strong>Etapa:</strong> <span>{expense.etapa || '—'}</span></p></div><div><p><strong>Status:</strong> <span>{paymentStatusLabel(expense.status)}</span></p></div><div><p><strong>Forma de pagamento:</strong> <span>{expense.forma_pagamento || '—'}</span></p></div></div></section>
    <section className="cash-flow-detail-block observation-block"><p><strong>Observações:</strong> <span className="preserve-lines">{expense.observacao || '—'}</span></p></section>
    <section className="cash-flow-detail-block"><strong>Itens da despesa</strong>{expense.itens.length?<table className="purchase-items-table cash-flow-expense-items-table"><thead><tr><th>Descrição</th><th>Quantidade</th><th>Unidade</th><th>Valor unitário</th><th>Valor desconto</th><th>Valor total</th></tr></thead><tbody>{expense.itens.map(item=><tr key={item.id}><td><strong>{item.descricao}</strong></td><td>{item.quantidade === null ? '—' : formatQuantity(item.quantidade)}</td><td>{item.unidade || '—'}</td><td>{item.valor_unitario === null ? '—' : formatMoney(item.valor_unitario)}</td><td className="expense-discount">{item.valor_desconto === null ? '—' : formatMoney(item.valor_desconto)}</td><td><strong>{item.valor_total === null ? '—' : formatMoney(item.valor_total)}</strong></td></tr>)}</tbody></table>:<small>Nenhum item vinculado.</small>}</section>
    <section className="payment-resource-panel cash-flow-expense-documents"><header><div><FileText/><strong>Documentos</strong><span>{expense.documentos.length}</span></div></header><div className="payment-document-list">{expense.documentos.length?expense.documentos.map(document=><div className="payment-document-box" key={document.id}><a className="payment-document-item" href={document.url || `${documentBase}/${document.id}/arquivo`} target="_blank" rel="noopener noreferrer" title={document.titulo}><FileText/><span>{document.titulo}</span><ExternalLink/></a></div>):<small>Nenhum documento vinculado.</small>}</div></section>
  </div>
}
