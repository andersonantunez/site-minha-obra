/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react'
import { Navigate, useOutletContext } from 'react-router-dom'

export type ProjectAccessInfo = {
  projeto: { id: number; nome: string; papel?: string; cep?: string | null; logradouro?: string | null; numero?: string | null; complemento?: string | null; bairro?: string | null; cidade?: string | null; estado?: string | null; latitude?: string | number | null; longitude?: string | number | null }
  permissoes: string[]
  proprietario: boolean
  administradorSistema: boolean
}

export type ProjectOutletContext = { project?: ProjectAccessInfo['projeto']; access?: ProjectAccessInfo }

export function roleLabel(role?: string) {
  return { ADMINISTRADOR_SISTEMA: 'Administrador do Sistema', PROPRIETARIO: 'Proprietário', ENGENHEIRO: 'Engenheiro', LEITOR: 'Observador' }[role || ''] || role || 'Participante'
}

export function hasProjectPermission(access: ProjectAccessInfo | undefined, permission: string) {
  return Boolean(access?.administradorSistema || access?.proprietario || access?.permissoes.includes(permission))
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
    ['orcamento.visualizar', 'fluxo-caixa'], ['pagamentos.visualizar', 'despesas'],
    ['categorias.visualizar', 'categorias-documentos'], ['documentos.visualizar', 'documentos'],
    ['membros.visualizar', 'participantes'], ['permissoes.visualizar', 'permissoes'], ['configuracoes.visualizar', 'dados-obra'],
  ] as const
  const available = destinations.find(([candidate]) => hasProjectPermission(access, candidate))
  const base = `/app/projetos/${access.projeto.id}`
  return <Navigate to={available ? `${base}${available[1] ? `/${available[1]}` : ''}` : '/app'} replace />
}
