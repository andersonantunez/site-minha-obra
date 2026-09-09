import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, FileText, Link2, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { AddButton, EmptyState, ErrorNotice, PageHeader } from '../components/Ui'
import { api, jsonBody } from '../lib/api'
import { formatDate } from '../lib/format'
import { useProjectAccess } from '../lib/projectAccess'

type Category = { id: number; nome: string }
type Document = { id: number; titulo: string; categoria: string; descricao: string | null; tipo_origem: 'ARQUIVO' | 'LINK'; url: string | null; caminho_arquivo: string | null; nome_original: string | null; tipo_mime: string | null; pagamento_id: number | null; pagamento_descricao: string | null; criado_em: string }

const isImage = (document: Document) => Boolean(document.tipo_mime?.startsWith('image/'))

export function DocumentsPage() {
  const { projetoId } = useParams()
  const { can } = useProjectAccess()
  const client = useQueryClient()
  const endpoint = `/projetos/${projetoId}/acervo/documentos`
  const categoriesEndpoint = `/projetos/${projetoId}/acervo/documentos/categorias`
  const categoryAdminEndpoint = `/projetos/${projetoId}/acervo/categorias`
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [editing, setEditing] = useState<Document | 'new' | null>(null)
  const [managingCategories, setManagingCategories] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [newCategory, setNewCategory] = useState('')
  const { data, error } = useQuery({ queryKey: ['documentos', projetoId, category, search], queryFn: () => api<{ documentos: Document[] }>(`${endpoint}?categoria=${encodeURIComponent(category)}&busca=${encodeURIComponent(search)}`) })
  const categories = useQuery({ queryKey: ['categorias-documento', projetoId], queryFn: () => api<{ categorias: Category[] }>(categoriesEndpoint) })
  const refresh = () => { void client.invalidateQueries({ queryKey: ['documentos', projetoId] }); void client.invalidateQueries({ queryKey: ['categorias-documento', projetoId] }); void client.invalidateQueries({ queryKey: ['dashboard', projetoId] }) }
  const save = useMutation({ mutationFn: ({ id, form }: { id?: number; form: FormData }) => api(`${endpoint}${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: form }), onSuccess: () => { setEditing(null); refresh() } })
  const remove = useMutation({ mutationFn: (id: number) => api(`${endpoint}/${id}`, { method: 'DELETE' }), onSuccess: refresh })
  const saveCategory = useMutation({ mutationFn: ({ id, nome }: { id?: number; nome: string }) => api(`${categoryAdminEndpoint}${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', ...jsonBody({ nome }) }), onSuccess: () => { setNewCategory(''); setEditingCategory(null); refresh() } })
  const removeCategory = useMutation({ mutationFn: (id: number) => api(`${categoryAdminEndpoint}/${id}`, { method: 'DELETE' }), onSuccess: refresh })
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); save.mutate({ id: editing === 'new' ? undefined : editing?.id, form: new FormData(event.currentTarget) }) }
  const documentUrl = (document: Document) => document.url || `/api${endpoint}/${document.id}/arquivo`

  return <div>
    <PageHeader eyebrow="ACERVO DO PROJETO" title="Documentos" description="Todos os arquivos, links, plantas, renders e comprovantes do projeto em um só lugar." action={<div className="heading-actions">{can('documentos.inserir')&&<AddButton onClick={() => setEditing('new')}>Novo documento</AddButton>}</div>} />
    {error && <ErrorNotice message={error.message} />}
    <div className="documents-toolbar"><label className="search-field"><span>Pesquisar documentos</span><div><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, descrição ou nome do arquivo" /></div></label><label className="compact-field"><span>Categoria</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Todas as categorias</option>{categories.data?.categorias.map((item) => <option value={item.nome} key={item.id}>{item.nome}</option>)}</select></label></div>
    {!data?.documentos.length ? <EmptyState icon={FileText} title="Nenhum documento encontrado" description="Envie um arquivo, informe um link ou altere os filtros aplicados." action={can('documentos.inserir')?<AddButton onClick={() => setEditing('new')}>Novo documento</AddButton>:undefined} /> : <div className="document-grid">{data.documentos.map((document) => <article className="document-card" key={document.id}><a className="document-preview" href={documentUrl(document)} target="_blank" rel="noopener noreferrer" title="Abrir em nova aba">{isImage(document) ? <img src={documentUrl(document)} alt={`Prévia de ${document.titulo}`} /> : document.tipo_origem === 'LINK' ? <Link2 /> : <FileText />}</a><div className="document-card-body"><small>{document.categoria}</small><h2 title={document.titulo}>{document.titulo}</h2><p>{document.descricao || document.nome_original || 'Sem descrição'}</p>{document.pagamento_id && <span className="document-payment">Pagamento: {document.pagamento_descricao || `#${document.pagamento_id}`}</span>}<span>{formatDate(document.criado_em)}</span></div><footer><a href={documentUrl(document)} target="_blank" rel="noopener noreferrer"><ExternalLink />Abrir</a>{can('documentos.atualizar')&&<button title="Editar documento" onClick={() => setEditing(document)}><Pencil /></button>}{can('documentos.excluir')&&<button className="danger" title="Excluir documento" onClick={() => confirm(`Excluir o documento ${document.titulo}?`) && remove.mutate(document.id)}><Trash2 /></button>}</footer></article>)}</div>}
    {editing && <div className="dialog-backdrop"><section className="dialog" role="dialog" aria-modal="true"><header><div><small>DOCUMENTO</small><h2>{editing === 'new' ? 'Novo documento' : 'Editar documento'}</h2></div><button onClick={() => setEditing(null)}><X /></button></header><form onSubmit={submit}>{save.error && <ErrorNotice message={save.error.message} />}<label className="field span-2"><span>Título</span><input name="titulo" required defaultValue={editing === 'new' ? '' : editing.titulo} /></label><label className="field span-2"><span>Categoria</span><select name="categoria" required defaultValue={editing === 'new' ? '' : editing.categoria}><option value="" disabled>Selecione uma categoria</option>{categories.data?.categorias.map((item) => <option value={item.nome} key={item.id}>{item.nome}</option>)}</select></label><label className="field span-2"><span>Descrição</span><textarea name="descricao" rows={3} defaultValue={editing === 'new' ? '' : editing.descricao || ''} /></label><div className="source-fields span-2"><label className="field"><span>{editing === 'new' ? 'Arquivo' : 'Substituir arquivo'}</span><input type="file" name="arquivo" accept="image/jpeg,image/png,image/webp,application/pdf" /></label><span>ou</span><label className="field"><span>Link externo</span><input type="url" name="url" placeholder="https://..." defaultValue={editing === 'new' ? '' : editing.url || ''} /></label></div><footer className="form-actions span-2"><button type="button" className="app-button" onClick={() => setEditing(null)}>Cancelar</button><button className="app-button primary" disabled={save.isPending}><Upload />{save.isPending ? 'Salvando…' : 'Salvar documento'}</button></footer></form></section></div>}
    {managingCategories && <div className="dialog-backdrop"><section className="dialog category-dialog" role="dialog" aria-modal="true"><header><div><small>DOCUMENTOS</small><h2>Categorias do projeto</h2></div><button onClick={() => setManagingCategories(false)}><X /></button></header><form className="category-create" onSubmit={(event) => { event.preventDefault(); if (newCategory.trim()) saveCategory.mutate({ nome: newCategory }) }}><input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="Nova categoria" /><button className="app-button primary" disabled={saveCategory.isPending}><Plus />Adicionar</button></form>{saveCategory.error && <ErrorNotice message={saveCategory.error.message} />}<div className="category-list">{categories.data?.categorias.map((item) => <div key={item.id}>{editingCategory?.id === item.id ? <form onSubmit={(event) => { event.preventDefault(); saveCategory.mutate({ id: item.id, nome: String(new FormData(event.currentTarget).get('nome')) }) }}><input name="nome" defaultValue={item.nome} autoFocus /><button className="app-button primary">Salvar</button><button type="button" className="app-button" onClick={() => setEditingCategory(null)}>Cancelar</button></form> : <><strong>{item.nome}</strong><span><button onClick={() => setEditingCategory(item)}><Pencil /></button><button className="danger" onClick={() => confirm(`Excluir a categoria ${item.nome}?`) && removeCategory.mutate(item.id)}><Trash2 /></button></span></>}</div>)}</div></section></div>}
  </div>
}
