import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { AddButton, EmptyState, ErrorNotice, PageHeader, SortableHeader } from '../components/Ui'
import { api, jsonBody } from '../lib/api'
import { useProjectAccess } from '../lib/projectAccess'
import { useSortableData } from '../lib/sorting'

type DocumentType = { id: number; nome: string }

export function DocumentTypesPage() {
  const { projetoId } = useParams(); const { can } = useProjectAccess(); const client = useQueryClient()
  const endpoint = `/projetos/${projetoId}/acervo/tipos-documento`
  const [editing, setEditing] = useState<DocumentType | 'new' | null>(null)
  const { data, error } = useQuery({ queryKey: ['tipos-documento', projetoId], queryFn: () => api<{ tipos: DocumentType[] }>(endpoint) })
  const sorted = useSortableData(data?.tipos || [], 'nome')
  const refresh = () => { void client.invalidateQueries({ queryKey: ['tipos-documento', projetoId] }); void client.invalidateQueries({ queryKey: ['documentos', projetoId] }); void client.invalidateQueries({ queryKey: ['documentos-despesa', projetoId] }) }
  const save = useMutation({ mutationFn: ({ id, nome }: { id?: number; nome: string }) => api(`${endpoint}${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', ...jsonBody({ nome }) }), onSuccess: () => { setEditing(null); refresh() } })
  const remove = useMutation({ mutationFn: (id: number) => api(`${endpoint}/${id}`, { method: 'DELETE' }), onSuccess: refresh })
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); save.mutate({ id: editing === 'new' ? undefined : editing?.id, nome: String(form.get('nome') || '') }) }
  return <div>
    <PageHeader eyebrow="PROJETO" title="Tipos de documento" description="Defina os tipos disponíveis para classificar cada documento do projeto." action={can('categorias.inserir') ? <AddButton onClick={() => setEditing('new')}>Novo tipo</AddButton> : undefined} />
    {error && <ErrorNotice message={error.message} />}
    {!data?.tipos.length ? <EmptyState title="Nenhum tipo cadastrado" description="Crie um tipo para classificar os documentos do projeto." action={can('categorias.inserir') ? <AddButton onClick={() => setEditing('new')}>Novo tipo</AddButton> : undefined} /> : <section className="data-table-wrap"><div className="table-summary"><strong>{data.tipos.length}</strong> tipos cadastrados</div><table className="data-table document-categories-table"><thead><tr><SortableHeader<DocumentType> label="Tipo de documento" column="nome" activeColumn={sorted.sort.key} direction={sorted.sort.direction} onSort={sorted.toggle}/><th>AÇÕES</th></tr></thead><tbody>{sorted.sorted.map((item) => <tr key={item.id}><td><strong>{item.nome}</strong></td><td className="row-actions">{can('categorias.atualizar') && <button title="Editar tipo" onClick={() => setEditing(item)}><Pencil /></button>}{can('categorias.excluir') && <button className="danger" title="Excluir tipo" onClick={() => confirm(`Excluir o tipo ${item.nome}?`) && remove.mutate(item.id)}><Trash2 /></button>}</td></tr>)}</tbody></table></section>}
    {editing && <div className="dialog-backdrop"><section className="dialog" role="dialog" aria-modal="true"><header><div><small>TIPO DE DOCUMENTO</small><h2>{editing === 'new' ? 'Novo tipo' : 'Editar tipo'}</h2></div><button onClick={() => setEditing(null)}><X /></button></header><form onSubmit={submit}>{save.error && <ErrorNotice message={save.error.message} />}<label className="field span-2"><span>Nome do tipo</span><input name="nome" required minLength={2} maxLength={80} autoFocus defaultValue={editing === 'new' ? '' : editing.nome} /></label><footer className="form-actions span-2"><button type="button" className="app-button" onClick={() => setEditing(null)}>Cancelar</button><button className="app-button primary" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar tipo'}</button></footer></form></section></div>}
  </div>
}
