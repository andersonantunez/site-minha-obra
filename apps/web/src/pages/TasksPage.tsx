import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Search, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { AddButton, EmptyState, ErrorNotice, PageHeader, SortableHeader } from '../components/Ui'
import { api, jsonBody } from '../lib/api'
import { compareByOrderedValues, useSortableData } from '../lib/sorting'
import { useProjectAccess } from '../lib/projectAccess'

type TaskStatus = 'PARADO' | 'INICIADO' | 'FINALIZADO'
type TaskPriority = 'BAIXA' | 'ALTA'
type Task = { id: number; descricao: string; observacao: string | null; status: TaskStatus; prioridade: TaskPriority }
const statusOptions: { value: TaskStatus; label: string }[] = [{ value: 'PARADO', label: 'Parado' },{ value: 'INICIADO', label: 'Iniciado' },{ value: 'FINALIZADO', label: 'Finalizado' }]
const priorityOptions: { value: TaskPriority; label: string }[] = [{ value: 'BAIXA', label: 'Baixa' },{ value: 'ALTA', label: 'Alta' }]
const optionLabel = <T extends string>(options: { value: T; label: string }[], value: T) => options.find((item) => item.value === value)?.label || value

export function TasksPage() {
  const { projetoId } = useParams()
  const { can } = useProjectAccess()
  const client = useQueryClient()
  const endpoint = `/projetos/${projetoId}/tarefas`
  const [editing, setEditing] = useState<Task | 'new' | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [expanded,setExpanded]=useState<number|null>(null)
  const query = new URLSearchParams({ busca: search })
  if (statusFilter) query.set('status', statusFilter)
  if (priorityFilter) query.set('prioridade', priorityFilter)
  const { data, error } = useQuery({ queryKey: ['tarefas', projetoId, search, statusFilter, priorityFilter], queryFn: () => api<{ tarefas: Task[]; total: number }>(`${endpoint}?${query}`) })
  const taskSort = useSortableData(data?.tarefas || [], 'status', 'asc', 'last', (left, right) => {
    const statusOrder: Record<TaskStatus, number> = { INICIADO: 1, PARADO: 2, FINALIZADO: 3 }
    const priorityOrder: Record<TaskPriority, number> = { ALTA: 1, BAIXA: 2 }
    return compareByOrderedValues(left, right, { status: statusOrder, prioridade: priorityOrder })
  })
  const refresh = () => void client.invalidateQueries({ queryKey: ['tarefas', projetoId] })
  const save = useMutation({ mutationFn: ({ id, payload }: { id?: number; payload: Record<string, unknown> }) => api(`${endpoint}${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', ...jsonBody(payload) }), onSuccess: () => { setEditing(null); refresh() } })
  const remove = useMutation({ mutationFn: (id: number) => api(`${endpoint}/${id}`, { method: 'DELETE' }), onSuccess: refresh })
  const [statusFeedback, setStatusFeedback] = useState('')
  const tasksKey = ['tarefas', projetoId, search, statusFilter, priorityFilter] as const
  const statusUpdate = useMutation({
    mutationFn: ({ id, status }: { id: number; status: TaskStatus }) => api<{ tarefa: Pick<Task, 'id' | 'status'> }>(`${endpoint}/${id}/status`, { method: 'PATCH', ...jsonBody({ status }) }),
    onMutate: async ({ id, status: nextStatus }) => { setStatusFeedback(''); await client.cancelQueries({ queryKey: tasksKey }); const previous = client.getQueryData<{ tarefas: Task[]; total: number }>(tasksKey); client.setQueryData<{ tarefas: Task[]; total: number }>(tasksKey, current => current ? { ...current, tarefas: current.tarefas.map(task => task.id === id ? { ...task, status: nextStatus } : task) } : current); return { previous } },
    onError: (_error, _variables, context) => { if (context?.previous) client.setQueryData(tasksKey, context.previous) },
    onSuccess: (_result, { id }) => setStatusFeedback(`Status da tarefa #${id} atualizado.`),
    onSettled: () => { refresh(); void client.invalidateQueries({ queryKey: ['dashboard', projetoId] }) },
  })
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); save.mutate({ id: editing === 'new' ? undefined : editing?.id, payload: { descricao: form.get('descricao'), observacao: form.get('observacao') || null, status: form.get('status'), prioridade: form.get('prioridade') } }) }
  return <div>
    <PageHeader eyebrow="PLANEJAMENTO" title="Tarefas" description="Acompanhe atividades, andamento e prioridades do projeto." action={can('tarefas.inserir') ? <AddButton onClick={() => setEditing('new')}>Nova tarefa</AddButton> : undefined} />
    <section className="table-toolbar tasks-toolbar" aria-label="Filtros de tarefas"><label className="search-field"><span>Pesquisar</span><div><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Descrição ou observações" /></div></label><label className="compact-field"><span>Status</span><select value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option value="">Todos</option>{statusOptions.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</select></label><label className="compact-field"><span>Prioridade</span><select value={priorityFilter} onChange={event=>setPriorityFilter(event.target.value)}><option value="">Todas</option>{priorityOptions.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</select></label></section>
    {error && <ErrorNotice message={error.message} />} {statusUpdate.error && <ErrorNotice message={statusUpdate.error.message} />} {statusFeedback && <div className="inline-success">{statusFeedback}</div>}
    {!data?.tarefas.length ? <EmptyState title="Nenhuma tarefa encontrada" description="Cadastre a primeira tarefa ou ajuste a pesquisa." /> : <section className="crud-table-frame tasks-grid"><div className="table-summary"><strong>{data.total}</strong> tarefas</div><table className="data-table tasks-table"><thead><tr><SortableHeader<Task> label="Descrição" column="descricao" activeColumn={taskSort.sort.key} direction={taskSort.sort.direction} onSort={taskSort.toggle}/><SortableHeader<Task> label="Status" column="status" activeColumn={taskSort.sort.key} direction={taskSort.sort.direction} onSort={taskSort.toggle}/><SortableHeader<Task> label="Prioridade" column="prioridade" activeColumn={taskSort.sort.key} direction={taskSort.sort.direction} onSort={taskSort.toggle}/><th>A&#199;&#213;ES</th></tr></thead><tbody>{taskSort.sorted.map((task) => <TaskRows key={task.id} task={task} expanded={expanded===task.id} onExpand={()=>setExpanded(expanded===task.id?null:task.id)} canUpdate={can('tarefas.atualizar')} canDelete={can('tarefas.excluir')} onStatusChange={status=>statusUpdate.mutate({id:task.id,status})} statusUpdating={statusUpdate.isPending&&statusUpdate.variables?.id===task.id} onEdit={()=>setEditing(task)} onDelete={()=>confirm('Excluir esta tarefa?')&&remove.mutate(task.id)}/>)}</tbody></table></section>}
    {editing && <div className="dialog-backdrop"><section className="dialog" role="dialog" aria-modal="true"><header><div><small>TAREFA</small><h2>{editing === 'new' ? 'Nova tarefa' : 'Editar tarefa'}</h2></div><button onClick={() => setEditing(null)}><X /></button></header><form onSubmit={submit}>{save.error && <ErrorNotice message={save.error.message} />}<label className="field span-2"><span>Descrição</span><input name="descricao" required minLength={2} autoFocus defaultValue={editing === 'new' ? '' : editing.descricao} /></label><label className="field span-2"><span>Observações</span><textarea name="observacao" rows={4} defaultValue={editing === 'new' ? '' : editing.observacao || ''} /></label><label className="field"><span>Status</span><select name="status" defaultValue={editing === 'new' ? 'PARADO' : editing.status}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="field"><span>Prioridade</span><select name="prioridade" defaultValue={editing === 'new' ? 'BAIXA' : editing.prioridade}>{priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><footer className="form-actions span-2"><button type="button" className="app-button" onClick={() => setEditing(null)}>Cancelar</button><button className="app-button primary" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar tarefa'}</button></footer></form></section></div>}
  </div>
}

function TaskRows({task,expanded,onExpand,canUpdate,canDelete,onStatusChange,statusUpdating,onEdit,onDelete}:{task:Task;expanded:boolean;onExpand:()=>void;canUpdate:boolean;canDelete:boolean;onStatusChange:(status:TaskStatus)=>void;statusUpdating:boolean;onEdit:()=>void;onDelete:()=>void}){
  return <><tr className={`task-row status-colored-row status-${task.status.toLowerCase()}`} onClick={onExpand}><td><strong>{task.descricao}</strong></td><td><select className={`task-status-select status-${task.status.toLowerCase()}`} value={task.status} disabled={statusUpdating||!canUpdate} aria-label={`Alterar status de ${task.descricao}`} onClick={event=>event.stopPropagation()} onChange={event=>onStatusChange(event.target.value as TaskStatus)}>{statusOptions.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</select></td><td><span className={`task-priority priority-${task.prioridade.toLowerCase()}`}>{optionLabel(priorityOptions,task.prioridade)}</span></td><td className="row-actions">{canUpdate&&<button title="Editar tarefa" onClick={event=>{event.stopPropagation();onEdit()}}><Pencil /></button>}{canDelete&&<button className="danger" title="Excluir tarefa" onClick={event=>{event.stopPropagation();onDelete()}}><Trash2 /></button>}</td></tr>{expanded&&<tr className="task-details-row"><td colSpan={4}><strong>Detalhes da tarefa</strong><p>{task.observacao||'Nenhum detalhe informado.'}</p></td></tr>}</>
}
