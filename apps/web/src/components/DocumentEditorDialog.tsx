import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CategoryMultiSelect, type DocumentCategoryOption } from './CategoryMultiSelect'
import { ErrorNotice } from './Ui'
import { api } from '../lib/api'
import { useUploadsEnabled } from '../lib/uploads'

export type EditableDocument = { id: number; titulo: string; categorias: DocumentCategoryOption[]; tipo_documento_id: number; descricao: string | null; url: string | null }
type DocumentType = { id: number; nome: string }

export function DocumentEditorDialog({ projectId, document, expenseId, defaultTitle = '', onClose }: { projectId: string; document: EditableDocument | 'new'; expenseId?: number; defaultTitle?: string; onClose: () => void }) {
  const uploads = useUploadsEnabled()
  const client = useQueryClient(); const endpoint = `/projetos/${projectId}/acervo/documentos`
  const [categories, setCategories] = useState<number[]>(document === 'new' ? [] : document.categorias.map(item => item.id)); const [error, setError] = useState('')
  const categoryOptions = useQuery({ queryKey: ['categorias-documento', projectId], queryFn: () => api<{ categorias: DocumentCategoryOption[] }>(`/projetos/${projectId}/acervo/documentos/categorias`) })
  const lockedCategoryIds = useMemo(() => expenseId ? categoryOptions.data?.categorias.filter(category => category.nome.toLocaleLowerCase('pt-BR') === 'despesas').map(category => category.id) || [] : [], [categoryOptions.data?.categorias, expenseId])
  useEffect(() => { if (lockedCategoryIds.length) setCategories(current => [...new Set([...current, ...lockedCategoryIds])]) }, [lockedCategoryIds])
  const types = useQuery({ queryKey: ['tipos-documento', projectId], queryFn: () => api<{ tipos: DocumentType[] }>(`/projetos/${projectId}/acervo/documentos/tipos`) })
  const save = useMutation({ mutationFn: (form: FormData) => api(`${endpoint}${document === 'new' ? '' : `/${document.id}`}`, { method: document === 'new' ? 'POST' : 'PUT', body: form }), onSuccess: () => { void client.invalidateQueries({ queryKey: ['documentos', projectId] }); void client.invalidateQueries({ queryKey: ['documentos-despesa', projectId, expenseId || null] }); void client.invalidateQueries({ queryKey: ['despesas', projectId] }); onClose() } })
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); if (!categories.length) { setError('Selecione ao menos uma categoria.'); return }; form.set('categoria_ids', JSON.stringify(categories)); if (expenseId) form.set('compra_id', String(expenseId)); save.mutate(form) }
  const enabled = uploads.data?.uploads_enabled === true
  return <div className="dialog-backdrop"><section className="dialog" role="dialog" aria-modal="true"><header><div><small>DOCUMENTO</small><h2>{document === 'new' ? 'Novo documento' : 'Editar documento'}</h2></div><button onClick={onClose}><X /></button></header>
<form onSubmit={submit}>
{save.error && <ErrorNotice message={save.error.message} />}<label className="field"><span>Nome do arquivo</span><input name="titulo" required defaultValue={document === 'new' ? defaultTitle : document.titulo} /></label><label className="field"><span>Tipo de documento</span><select name="tipo_documento_id" required defaultValue={document === 'new' ? '' : document.tipo_documento_id}><option value="" disabled>Selecione</option>{types.data?.tipos.map(item => <option value={item.id} key={item.id}>{item.nome}</option>)}</select></label><label className="field span-2"><span>Categorias</span><CategoryMultiSelect categories={categoryOptions.data?.categorias || []} selectedIds={categories} lockedIds={lockedCategoryIds} onChange={ids => { setError(''); setCategories(ids) }} />{error && <small className="field-error">{error}</small>}</label><label className="field span-2"><span>Descrição</span><textarea name="descricao" rows={3} defaultValue={document === 'new' ? '' : document.descricao || ''} /></label><div className="source-fields span-2">{enabled && <>
<label className="field"><span>{document === 'new' ? 'Arquivo' : 'Substituir arquivo'}</span>
<input type="file" name="arquivo" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={!enabled} />
</label><span>ou</span></>}<label className="field"><span>Link externo</span><input type="url" name="url" placeholder="https://..." defaultValue={document === 'new' ? '' : document.url || ''} /></label></div><footer className="form-actions span-2"><button type="button" className="app-button" onClick={onClose}>Cancelar</button><button className="app-button primary" disabled={save.isPending}><Upload />{save.isPending ? 'Salvando…' : 'Salvar documento'}</button></footer></form>
</section></div>
}
