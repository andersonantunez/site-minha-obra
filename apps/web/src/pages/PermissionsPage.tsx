import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { EmptyState, ErrorNotice, PageHeader } from '../components/Ui'
import { api, jsonBody } from '../lib/api'
import { roleLabel, useProjectAccess } from '../lib/projectAccess'

type Role = { id: number; codigo: string; nome: string; descricao: string | null }
type Permission = { id: number; chave: string; modulo: string; acao: string; descricao: string }
type PermissionValue = { papel_id: number; chave: string; permitido: boolean; configurado_no_projeto: boolean }
type PermissionData = { papeis: Role[]; permissoes: Permission[]; valores: PermissionValue[] }

const operations = [
  ['visualizar', 'Visualizar'],
  ['inserir', 'Incluir'],
  ['atualizar', 'Editar'],
  ['excluir', 'Excluir'],
  ['exportar', 'Exportar'],
  ['convidar', 'Convidar'],
] as const

const moduleLabels: Record<string, string> = {
  visao_geral: 'Visão Geral',
  etapas: 'Cronograma',
  fluxo_caixa: 'Fluxo de Caixa',
  pagamentos: 'Pagamentos',
  tarefas: 'Tarefas',
  categorias: 'Categorias',
  documentos: 'Documentos',
  membros: 'Participantes',
  permissoes: 'Permissões',
  configuracoes: 'Configurações',
}

export function PermissionsPage() {
  const { projetoId } = useParams()
  const client = useQueryClient()
  const { project, can } = useProjectAccess()
  const endpoint = `/projetos/${projetoId}/permissoes`
  const [roleId, setRoleId] = useState<number | null>(null)
  const [matrix, setMatrix] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState(false)
  const { data, error, isLoading } = useQuery({ queryKey: ['permissoes-projeto', projetoId], queryFn: () => api<PermissionData>(endpoint) })
  const selectedRole = data?.papeis.find((role) => role.id === roleId)
  const groups = useMemo(() => (data?.permissoes || []).reduce<Record<string, Permission[]>>((result, permission) => {
    (result[permission.modulo] ??= []).push(permission)
    return result
  }, {}), [data])

  useEffect(() => {
    if (!data?.papeis.length) return
    // Sincroniza a seleção inicial após a carga remota dos papéis.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!roleId || !data.papeis.some((role) => role.id === roleId)) setRoleId(data.papeis[0]!.id)
  }, [data, roleId])

  useEffect(() => {
    if (!data || !roleId) return
    // Recria a matriz local quando o administrador troca o papel selecionado.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMatrix(Object.fromEntries(data.valores.filter((item) => item.papel_id === roleId).map((item) => [item.chave, item.permitido])))
  }, [data, roleId])

  const save = useMutation({
    mutationFn: () => api(`${endpoint}/papeis/${roleId}`, { method: 'PUT', ...jsonBody({ permissoes: data?.permissoes.map((permission) => ({ chave: permission.chave, permitido: Boolean(matrix[permission.chave]) })) || [] }) }),
    onSuccess: () => {
      setSaved(true)
      void client.invalidateQueries({ queryKey: ['permissoes-projeto', projetoId] })
      void client.invalidateQueries({ queryKey: ['projeto', projetoId] })
    },
  })

  const changePermission = (permission: Permission, allowed: boolean) => {
    setSaved(false)
    setMatrix((current) => {
      const next = { ...current, [permission.chave]: allowed }
      if (permission.acao === 'visualizar' && !allowed) {
        for (const item of groups[permission.modulo] || []) next[item.chave] = false
      }
      return next
    })
  }

  return <div className="permissions-page">
    <PageHeader eyebrow="GESTÃO DO PROJETO" title="Permissões" description="Defina o acesso de cada papel exclusivamente para este projeto." />
    {(error || save.error) && <ErrorNotice message={(error || save.error)!.message} />}
    {saved && <p className="inline-success">Permissões atualizadas. Os novos acessos serão aplicados nas próximas requisições.</p>}
    {isLoading ? <div className="route-loading"><span /><p>Carregando permissões…</p></div> : !data?.papeis.length ? <EmptyState icon={ShieldCheck} title="Nenhum papel configurável" description="Cadastre um papel antes de definir permissões por projeto." /> : <>
      <section className="permission-context">
        <label className="field"><span>Projeto</span><input value={project?.nome || ''} readOnly /></label>
        <label className="field"><span>Papel</span><select value={roleId || ''} onChange={(event) => { setSaved(false); setRoleId(Number(event.target.value)) }}>{data.papeis.map((role) => <option value={role.id} key={role.id}>{roleLabel(role.codigo)}</option>)}</select></label>
        <div><small>CONFIGURAÇÃO ATUAL</small><strong>{roleLabel(selectedRole?.codigo)}</strong><p>{selectedRole?.descricao || 'Permissões específicas deste papel no projeto selecionado.'}</p></div>
      </section>
      <section className="project-permission-matrix">
        <div className="permission-matrix-summary"><strong>Matriz de permissões</strong><span>Desmarcar “Visualizar” também desativa as demais operações do módulo.</span></div>
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Módulo</th>{operations.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{Object.entries(groups).map(([module, permissions]) => {
          const viewPermission = permissions.find((permission) => permission.acao === 'visualizar')
          const canView = viewPermission ? Boolean(matrix[viewPermission.chave]) : true
          return <tr key={module}><td><strong>{moduleLabels[module] || module}</strong></td>{operations.map(([operation]) => {
            const permission = permissions.find((item) => item.acao === operation)
            if (!permission) return <td className="permission-not-applicable" key={operation}>—</td>
            const disabled = operation !== 'visualizar' && !canView
            return <td key={operation}><label className="matrix-check"><input type="checkbox" checked={Boolean(matrix[permission.chave])} disabled={disabled || !can('permissoes.atualizar')} onChange={(event) => changePermission(permission, event.target.checked)} /><span className="sr-only">{permission.descricao}</span></label></td>
          })}</tr>
        })}</tbody></table></div>
        {can('permissoes.atualizar') && <footer className="form-actions"><button className="app-button primary" disabled={save.isPending || !roleId} onClick={() => save.mutate()}><Save />{save.isPending ? 'Salvando…' : 'Salvar permissões'}</button></footer>}
      </section>
    </>}
  </div>
}
