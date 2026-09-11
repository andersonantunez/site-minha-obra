import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, FileText, Pencil, Search, Trash2, Upload, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { ImportDialog } from '../components/imports/ImportDialog'
import { ExpandedRowDetails } from '../components/ExpandedRowDetails'
import { ExportAction } from '../components/ExportDialog'
import { AddButton, EmptyState, ErrorNotice, MetricCard, PageHeader } from '../components/Ui'
import { api, jsonBody } from '../lib/api'
import { formatDate, formatMoney, formatQuantity } from '../lib/format'
import { paymentStatusLabel, type PaymentStatus } from '../lib/paymentStatus'
import { SortableHeader } from '../components/Ui'
import { useSortableData } from '../lib/sorting'
import { useProjectAccess } from '../lib/projectAccess'

type CashFlowItem = { id: string; origem: 'MANUAL' | 'PAGAMENTO'; origem_id: number; data: string; descricao: string; detalhes: string | null; quantidade: string | null; unidade: string | null; fornecedor: string | null; payment_status: PaymentStatus | null; data_agendamento: string | null; data_entrega: string | null; forma_pagamento: string | null; chave_pix: string | null; contato_fornecedor: string | null; nome_contato_fornecedor: string | null; payment_etapa: string | null; payment_observacao: string | null; valor: string | null; editavel: boolean; provisionado: boolean }
type CashFlowData = { itens: CashFlowItem[]; total: number; indicadores: { total_entrada: string; total_saida: string; saldo_atual: string; saldo_com_provisao: string } }
type PaymentDocument = { id: number; titulo: string; url: string | null }
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
    {!data?.itens.length ? <EmptyState title="Nenhum lançamento encontrado" description="Cadastre uma entrada ou saída manualmente, importe um arquivo ou ajuste os filtros." /> : <section className="data-table-wrap cash-flow-table-wrap"><div className="table-summary"><strong>{data.total}</strong> lançamentos no fluxo de caixa</div><table className="data-table cash-flow-table"><thead><tr><SortableHeader<CashFlowItem> label="Data" column="data" activeColumn={flowSort.sort.key} direction={flowSort.sort.direction} onSort={flowSort.toggle}/><SortableHeader<CashFlowItem> label="Descrição" column="descricao" activeColumn={flowSort.sort.key} direction={flowSort.sort.direction} onSort={flowSort.toggle}/><SortableHeader<CashFlowItem> label="Valor" column="valor" className="money-column" activeColumn={flowSort.sort.key} direction={flowSort.sort.direction} onSort={flowSort.toggle}/><SortableHeader<CashFlowItem> label="Provisionado" column="provisionado" activeColumn={flowSort.sort.key} direction={flowSort.sort.direction} onSort={flowSort.toggle}/><th>A&#199;&#213;ES</th></tr></thead><tbody>{flowSort.sorted.map((item) => <CashFlowRow key={item.id} projectId={projetoId} item={item} expanded={expanded === item.id} onExpand={() => setExpanded(expanded === item.id ? null : item.id)} canEdit={can('orcamento.atualizar')} canDelete={can('orcamento.excluir')} onEdit={() => setEditing(item)} onRemove={() => confirm('Excluir este lançamento?') && remove.mutate(item.origem_id)} />)}</tbody></table></section>}
    {editing && <div className="dialog-backdrop"><section className="dialog" role="dialog" aria-modal="true"><header><div><small>FLUXO DE CAIXA</small><h2>{editing === 'new' ? 'Novo lançamento' : 'Editar lançamento'}</h2></div><button onClick={() => setEditing(null)}><X /></button></header><form onSubmit={submit}>{save.error && <ErrorNotice message={save.error.message} />}<label className="field"><span>Data</span><input type="date" name="data" required defaultValue={editing === 'new' ? '' : editing.data.slice(0, 10)} /></label><label className="field"><span>Valor</span><input type="number" name="valor" step="0.01" required placeholder="Use negativo para saída" defaultValue={editing === 'new' ? '' : editing.valor ?? ''} /></label><label className="field span-2"><span>Descrição</span><input name="descricao" required minLength={2} defaultValue={editing === 'new' ? '' : editing.descricao} /></label><label className="field span-2"><span>Detalhes</span><textarea name="detalhes" rows={4} defaultValue={editing === 'new' ? '' : editing.detalhes || ''} /></label><footer className="form-actions span-2"><button type="button" className="app-button" onClick={() => setEditing(null)}>Cancelar</button><button className="app-button primary" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar lançamento'}</button></footer></form></section></div>}
    {importing && <ImportDialog endpoint={endpoint} entityName="Fluxo de Caixa" onClose={() => setImporting(false)} onComplete={() => { setImporting(false); refresh() }} />}
  </div>
}

function CashFlowRow({ projectId, item, expanded, onExpand, canEdit, canDelete, onEdit, onRemove }: { projectId?: string; item: CashFlowItem; expanded: boolean; onExpand: () => void; canEdit: boolean; canDelete: boolean; onEdit: () => void; onRemove: () => void }) {
  const hasValue = item.valor !== null
  const value = Number(item.valor ?? 0)
  const quantity = item.quantidade ? `${formatQuantity(item.quantidade)} ${item.unidade || ''}`.trim() : ''
  const secondary = [quantity, item.fornecedor].filter(Boolean).join(' - ')
  const placeholder = '—'
  const detailColumns = [
    [{ label: 'Status', value: item.payment_status ? paymentStatusLabel(item.payment_status) : placeholder }, { label: 'Data de agendamento', value: formatDate(item.data_agendamento) }, { label: 'Data de entrega', value: formatDate(item.data_entrega) }],
    [{ label: 'Forma de pagamento', value: item.forma_pagamento || placeholder }, { label: 'Chave Pix', value: item.chave_pix || placeholder }, { label: 'Contato do fornecedor', value: item.contato_fornecedor || placeholder }],
    [{ label: 'Nome do funcionário', value: item.nome_contato_fornecedor || placeholder }, { label: 'Etapa', value: item.payment_etapa || placeholder }],
  ]
  return <><tr className="cash-flow-row" onClick={onExpand}><td>{formatDate(item.data)}</td><td><strong>{item.descricao}</strong>{secondary && <small>{secondary}</small>}</td><td className={`money-column ${hasValue ? (value >= 0 ? 'cash-value-positive' : 'cash-value-negative') : ''}`}>{hasValue ? <>{value > 0 ? '+' : ''}{formatMoney(value)}</> : '—'}</td><td><span className={`provision-badge ${item.provisionado ? 'yes' : 'no'}`}>{item.provisionado ? 'Sim' : 'Não'}</span></td><td className="row-actions">{item.editavel ? <>{canEdit && <button title="Editar lançamento" onClick={event=>{event.stopPropagation();onEdit()}}><Pencil /></button>}{canDelete && <button className="danger" title="Excluir lançamento" onClick={event=>{event.stopPropagation();onRemove()}}><Trash2 /></button>}</> : <small className="locked-source">Automático</small>}</td></tr>{expanded && <tr className="cash-flow-details-row"><td colSpan={5}><ExpandedRowDetails title={item.origem === 'PAGAMENTO' ? 'Detalhes do pagamento' : 'Detalhes do lançamento'} columns={detailColumns} details={item.payment_observacao}>{item.origem === 'PAGAMENTO' && projectId && <CashFlowPaymentDocuments projectId={projectId} paymentId={item.origem_id}/>}</ExpandedRowDetails></td></tr>}</>
}
function CashFlowPaymentDocuments({ projectId, paymentId }: { projectId: string; paymentId: number }) {
  const endpoint = `/projetos/${projectId}/pagamentos/${paymentId}/documentos`
  const { data, error } = useQuery({ queryKey: ['documentos-pagamento-fluxo', projectId, paymentId], queryFn: () => api<{ documentos: PaymentDocument[] }>(endpoint) })
  return <div className="cash-flow-payment-documents"><strong>Comprovantes e documentos</strong>{error ? <small>Não foi possível carregar os documentos.</small> : !data ? <small>Carregando documentos…</small> : !data.documentos.length ? <small>Nenhum comprovante anexado.</small> : <div>{data.documentos.map(document => <a key={document.id} href={document.url || `/api${endpoint}/${document.id}/arquivo`} target="_blank" rel="noopener noreferrer"><FileText /><span>{document.titulo}</span><ExternalLink /></a>)}</div>}</div>
}
