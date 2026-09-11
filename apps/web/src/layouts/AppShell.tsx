import { useQuery } from '@tanstack/react-query'
import {
  Building2, CalendarRange, CheckSquare2, ChevronDown, FileText,
  Landmark, LayoutDashboard, Menu, ReceiptText, Settings, ShieldCheck, Tags, Users, X,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { hasProjectPermission, roleLabel, type ProjectAccessInfo } from '../lib/projectAccess'
import { TopbarUser } from '../components/TopbarUser'

const navigation: { group?: string; items: { label: string; icon: typeof LayoutDashboard; path: string; permission: string }[] }[] = [
  { items: [
    { label: 'Dados da obra', icon: Settings, path: 'configuracoes', permission: 'configuracoes.visualizar' },
    { label: 'Visão geral', icon: LayoutDashboard, path: '', permission: 'visao_geral.visualizar' },
  ] },
  { group: 'PLANEJAMENTO', items: [
    { label: 'Cronograma', icon: CalendarRange, path: 'cronograma', permission: 'etapas.visualizar' },
    { label: 'Tarefas', icon: CheckSquare2, path: 'tarefas', permission: 'tarefas.visualizar' },
  ] },
  { group: 'FINANCEIRO', items: [
    { label: 'Fluxo de Caixa', icon: Landmark, path: 'fluxo-caixa', permission: 'orcamento.visualizar' },
    { label: 'Pagamentos', icon: ReceiptText, path: 'pagamentos', permission: 'pagamentos.visualizar' },
  ] },
  { group: 'PROJETO', items: [
    { label: 'Categorias', icon: Tags, path: 'categorias-documentos', permission: 'categorias.visualizar' },
    { label: 'Documentos', icon: FileText, path: 'documentos', permission: 'documentos.visualizar' },
  ] },
  { group: 'GESTÃO', items: [
    { label: 'Participantes', icon: Users, path: 'participantes', permission: 'membros.visualizar' },
    { label: 'Permissões', icon: ShieldCheck, path: 'permissoes', permission: 'permissoes.visualizar' },
  ] },
]

export function AppShell() {
  const { projetoId } = useParams()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { data } = useQuery({ queryKey: ['projeto', projetoId], queryFn: () => api<ProjectAccessInfo>(`/projetos/${projetoId}`), enabled: Boolean(projetoId) })
  const base = `/app/projetos/${projetoId}`

  return <div className="app-layout">
    <aside className={mobileOpen ? 'app-sidebar open' : 'app-sidebar'}>
      <div className="sidebar-brand"><a className="brand" href="/"><span className="brand-mark">M</span><span>MinhaObra</span></a><button onClick={() => setMobileOpen(false)}><X /></button></div>
      <button className="project-switcher" onClick={() => navigate('/app')}>
        <span><Building2 /><i><small>PROJETO ATUAL</small><strong>{data?.projeto.nome || 'Carregando…'}</strong></i></span><ChevronDown size={16} />
      </button>
      <nav className="app-navigation">
        {navigation.map((section, index) => {
          const items = section.items.filter((item) => hasProjectPermission(data, item.permission))
          if (!items.length) return null
          return <div className="navigation-section" key={`${section.group || 'principal'}-${index}`}>
            {section.group && <span className="nav-group">{section.group}</span>}
            {items.map((item) => <NavLink key={item.path} end={!item.path} to={item.path ? `${base}/${item.path}` : base} onClick={() => setMobileOpen(false)}><item.icon />{item.label}</NavLink>)}
          </div>
        })}
      </nav>
    </aside>
    {mobileOpen && <button className="sidebar-overlay" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}
    <div className="app-main">
      <header className="app-topbar">
        <button className="mobile-nav-button" onClick={() => setMobileOpen(true)}><Menu /></button>
        <div className="topbar-spacer" />
        <div className="topbar-actions">{user?.administrador_sistema && <NavLink className="system-admin-topbar-link" to="/admin"><Settings />Admin</NavLink>}<TopbarUser user={user} role={roleLabel(data?.projeto.papel)} onSignOut={() => void signOut().then(() => navigate('/'))} /></div>
      </header>
      <main className="app-content"><Outlet context={{ project: data?.projeto, access: data }} /></main>
    </div>
  </div>
}
