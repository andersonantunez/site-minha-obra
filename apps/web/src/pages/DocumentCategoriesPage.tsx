import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { AddButton, EmptyState, ErrorNotice, PageHeader } from '../components/Ui'
import { api, jsonBody } from '../lib/api'
import { SortableHeader } from '../components/Ui'
import { useSortableData } from '../lib/sorting'
import { useProjectAccess } from '../lib/projectAccess'

type Category = { id: number; nome: string }

export function DocumentCategoriesPage() {
  const { projetoId } = useParams()
  const { can } = useProjectAccess()
  const client = useQueryClient()
  const endpoint = `/projetos/${projetoId}/acervo/categorias`
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const { data, error } = useQuery({ queryKey: ['categorias-documento', projetoId], queryFn: () => api<{ categorias: Category[] }>(endpoint) })
  const categorySort = useSortableData(data?.categorias || [], 'nome')
  const refresh = () => { void client.invalidateQueries({ queryKey: ['categorias-documento', projetoId] }); void client.invalidateQueries({ queryKey: ['documentos', projetoId] }) }
  const save = useMutation({ mutationFn: ({ id, nome }: { id?: number; nome: string }) => api(`${endpoint}${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', ...jsonBody({ nome }) }), onSuccess: () => { setEditing(null); refresh() } })
  const remove = useMutation({ mutationFn: (id: number) => api(`${endpoint}/${id}`, { method: 'DELETE' }), onSuccess: refresh })
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); save.mutate({ id: editing === 'new' ? undefined : editing?.id, nome: String(form.get('nome') || '') }) }
  return <div>
    <PageHeader eyebrow="PROJETO" title="Categorias de documentos" description="Organize os documentos deste projeto por categorias personalizadas." action={can('categorias.inserir') ? <AddButton onClick={() => setEditing('new')}>Nova categoria</AddButton> : undefined} />
    {error && <ErrorNotice message={error.message} />}
    {!data?.categorias.length ? <EmptyState title="Nenhuma categoria cadastrada" description="Crie uma categoria para organizar os documentos do projeto." action={can('categorias.inserir') ? <AddButton onClick={() => setEditing('new')}>Nova categoria</AddButton> : undefined} /> : <section className="data-table-wrap"><div className="table-summary"><strong>{data.categorias.length}</strong> categorias cadastradas</div><table className="data-table document-categories-table"><thead><tr><SortableHeader<Category> label="Categoria" column="nome" activeColumn={categorySort.sort.key} direction={categorySort.sort.direction} onSort={categorySort.toggle}/><th>A&#199;&#213;ES</th></tr></thead><tbody>{categorySort.sorted.map((item) => <tr key={item.id}><td><strong>{item.nome}</strong>{item.nome === 'Despesas' && <small>Usada automaticamente nos anexos de despesas.</small>}</td><td className="row-actions">{can('categorias.atualizar')&&<button title="Editar categoria" onClick={() => setEditing(item)}><Pencil /></button>}{can('categorias.excluir')&&<button className="danger" title="Excluir categoria" onClick={() => confirm(`Excluir a categoria ${item.nome}?`) && remove.mutate(item.id)}><Trash2 /></button>}</td></tr>)}</tbody></table></section>}
    {editing && <div className="dialog-backdrop"><section className="dialog" role="dialog" aria-modal="true"><header><div><small>CATEGORIA DE DOCUMENTO</small><h2>{editing === 'new' ? 'Nova categoria' : 'Editar categoria'}</h2></div><button onClick={() => setEditing(null)}><X /></button></header><form onSubmit={submit}>{save.error && <ErrorNotice message={save.error.message} />}<label className="field span-2"><span>Nome da categoria</span><input name="nome" required minLength={2} maxLength={80} autoFocus defaultValue={editing === 'new' ? '' : editing.nome} /></label><footer className="form-actions span-2"><button type="button" className="app-button" onClick={() => setEditing(null)}>Cancelar</button><button className="app-button primary" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar categoria'}</button></footer></form></section></div>}
  </div>
}
