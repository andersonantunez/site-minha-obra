/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react'
import { Navigate, useOutletContext } from 'react-router-dom'

export type ProjectAccessInfo = {
  projeto: { id: number; nome: string; papel?: string }
  permissoes: string[]
  proprietario: boolean
}

export type ProjectOutletContext = { project?: ProjectAccessInfo['projeto']; access?: ProjectAccessInfo }

export function roleLabel(role?: string) {
  return { PROPRIETARIO: 'Proprietário', ENGENHEIRO: 'Engenheiro', LEITOR: 'Observador' }[role || ''] || role || 'Participante'
}

export function hasProjectPermission(access: ProjectAccessInfo | undefined, permission: string) {
  return Boolean(access?.proprietario || access?.permissoes.includes(permission))
}

export function useProjectAccess() {
  const context = useOutletContext<ProjectOutletContext>()
  return { ...context, can: (permission: string) => hasProjectPermission(context.access, permission) }
}

export function ProjectPermissionRoute({ permission, children }: { permission: string; children: ReactNode }) {
  const { access } = useOutletContext<ProjectOutletContext>()
  if (!access) return <div className="route-loading"><span /><p>Validando acesso…</p></div>
  if (hasProjectPermission(access, permission)) return children
  const destinations = [
    ['visao_geral.visualizar', ''], ['etapas.visualizar', 'cronograma'], ['tarefas.visualizar', 'tarefas'],
    ['orcamento.visualizar', 'fluxo-caixa'], ['pagamentos.visualizar', 'pagamentos'],
    ['categorias.visualizar', 'categorias-documentos'], ['documentos.visualizar', 'documentos'],
    ['membros.visualizar', 'participantes'], ['permissoes.visualizar', 'permissoes'], ['configuracoes.visualizar', 'configuracoes'],
  ] as const
  const available = destinations.find(([candidate]) => hasProjectPermission(access, candidate))
  const base = `/app/projetos/${access.projeto.id}`
  return <Navigate to={available ? `${base}${available[1] ? `/${available[1]}` : ''}` : '/app'} replace />
}
