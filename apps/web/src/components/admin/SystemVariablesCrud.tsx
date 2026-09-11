import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { api, jsonBody } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { AddButton, EmptyState, ErrorNotice } from '../Ui'

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
type SystemVariable = { id: number; chave: string; valor: JsonValue; descricao: string; atualizado_em: string }
type Editing = 'new' | SystemVariable | null

function formatJson(value: JsonValue) {
  return JSON.stringify(value, null, 2)
}

export function SystemVariablesCrud() {
  const client = useQueryClient()
  const [editing, setEditing] = useState<Editing>(null)
  const [jsonError, setJsonError] = useState('')
  const variables = useQuery({ queryKey: ['admin-variaveis'], queryFn: () => api<{ variaveis: SystemVariable[] }>('/admin/variaveis') })
  const save = useMutation({
    mutationFn: ({ id, body }: { id?: number; body: { chave: string; valor: JsonValue; descricao: string } }) => api(id ? `/admin/variaveis/${id}` : '/admin/variaveis', { method: id ? 'PUT' : 'POST', ...jsonBody(body) }),
    onSuccess: () => { setEditing(null); setJsonError(''); void client.invalidateQueries({ queryKey: ['admin-variaveis'] }) },
  })
  const remove = useMutation({
    mutationFn: (id: number) => api(`/admin/variaveis/${id}`, { method: 'DELETE' }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['admin-variaveis'] }),
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setJsonError('')
    const form = new FormData(event.currentTarget)
    let value: JsonValue
    try {
      value = JSON.parse(String(form.get('valor'))) as JsonValue
    } catch {
      setJsonError('Informe um JSON válido antes de salvar.')
      return
    }
    save.mutate({
      id: editing === 'new' || !editing ? undefined : editing.id,
      body: { chave: String(form.get('chave')).trim().toLowerCase(), valor: value, descricao: String(form.get('descricao')).trim() },
    })
  }

  return <section className="system-variables-crud">
    <header className="system-variables-heading"><div><span>CONFIGURAÇÃO GLOBAL</span><h2>Variáveis do Sistema</h2><p>Valores usados pela plataforma, armazenados com seu tipo JSON original.</p></div><AddButton onClick={() => { setJsonError(''); setEditing('new') }}>Nova variável</AddButton></header>
    {(variables.error || remove.error) && <ErrorNotice message={(variables.error || remove.error)!.message} />}
    <section className="data-table-wrap system-variables-table">
      <div className="table-summary"><strong>{variables.data?.variaveis.length || 0}</strong> variáveis cadastradas</div>
      {variables.data?.variaveis.length ? <table className="data-table"><thead><tr><th>Chave</th><th>Valor</th><th>Descrição</th><th>Atualização</th><th>Ações</th></tr></thead><tbody>{variables.data.variaveis.map(variable => <tr key={variable.id}><td><strong>{variable.chave}</strong></td><td><pre className="system-variable-value">{formatJson(variable.valor)}</pre></td><td>{variable.descricao}</td><td>{formatDate(variable.atualizado_em)}</td><td><div className="row-actions"><button aria-label={`Editar ${variable.chave}`} onClick={() => { setJsonError(''); setEditing(variable) }}><Pencil /></button><button className="danger" aria-label={`Excluir ${variable.chave}`} onClick={() => confirm(`Excluir a variável ${variable.chave}?`) && remove.mutate(variable.id)}><Trash2 /></button></div></td></tr>)}</tbody></table> : <EmptyState title="Nenhuma variável cadastrada" description="Cadastre configurações globais tipadas para a plataforma." />}
    </section>
    {editing && <div className="dialog-backdrop"><section className="dialog system-variable-dialog" role="dialog" aria-modal="true" aria-labelledby="system-variable-title"><header><div><small>VARIÁVEL DO SISTEMA</small><h2 id="system-variable-title">{editing === 'new' ? 'Nova variável' : 'Editar variável'}</h2></div><button type="button" aria-label="Fechar" onClick={() => setEditing(null)}><X /></button></header><form onSubmit={submit}>{(jsonError || save.error) && <ErrorNotice message={jsonError || save.error!.message} />}<label className="field span-2"><span>Chave</span><input name="chave" required minLength={3} maxLength={100} pattern="[a-z][a-z0-9_]{2,99}" title="Use letras minúsculas, números e sublinhado." autoFocus defaultValue={editing === 'new' ? '' : editing.chave} /></label><label className="field span-2"><span>Valor (JSON)</span><textarea className="json-editor" name="valor" required spellCheck={false} defaultValue={editing === 'new' ? 'null' : formatJson(editing.valor)} /><em>Exemplos válidos: "texto", 10, true, ["item"] ou {`{"campo":"valor"}`}.</em></label><label className="field span-2"><span>Descrição</span><textarea name="descricao" required minLength={3} maxLength={300} rows={3} defaultValue={editing === 'new' ? '' : editing.descricao} /></label><footer className="form-actions span-2"><button type="button" className="app-button" onClick={() => setEditing(null)}>Cancelar</button><button className="app-button primary" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar variável'}</button></footer></form></section></div>}
  </section>
}
