import { useQuery } from '@tanstack/react-query'
import {
  Building2, CalendarRange, Check, CheckSquare2, Copy, FileText,
  Landmark, LayoutDashboard, Menu, ReceiptText, Settings, ShieldCheck, Tags, Users, X,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { hasProjectPermission, roleLabel, type ProjectAccessInfo } from '../lib/projectAccess'
import { TopbarBackButton } from '../components/TopbarBackButton'
import { TopbarUser } from '../components/TopbarUser'
import { SystemAdminLink } from '../components/SystemAdminLink'

const navigation: { group?: string; items: { label: string; icon: typeof LayoutDashboard; path: string; permission: string }[] }[] = [
  { items: [
    { label: 'Dados da obra', icon: Settings, path: 'dados-obra', permission: 'configuracoes.visualizar' },
    { label: 'Visão geral', icon: LayoutDashboard, path: '', permission: 'visao_geral.visualizar' },
  ] },
  { group: 'PLANEJAMENTO', items: [
    { label: 'Cronograma', icon: CalendarRange, path: 'cronograma', permission: 'etapas.visualizar' },
    { label: 'Tarefas', icon: CheckSquare2, path: 'tarefas', permission: 'tarefas.visualizar' },
  ] },
  { group: 'FINANCEIRO', items: [
    { label: 'Fluxo de Caixa', icon: Landmark, path: 'fluxo-caixa', permission: 'orcamento.visualizar' },
    { label: 'Despesas', icon: ReceiptText, path: 'despesas', permission: 'pagamentos.visualizar' },
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
  const [addressCopied, setAddressCopied] = useState(false)
  const { data } = useQuery({ queryKey: ['projeto', projetoId], queryFn: () => api<ProjectAccessInfo>(`/projetos/${projetoId}`), enabled: Boolean(projetoId) })
  const base = `/app/projetos/${projetoId}`
  const project = data?.projeto
  const addressStreet=[project?.logradouro,project?.numero].filter(Boolean).join(', ')
  const addressDetails=[addressStreet,project?.complemento].filter(Boolean).join(' · ')
  const addressLocality=[project?.cidade,project?.estado].filter(Boolean).join(' - ')
  const addressNeighborhood=[project?.bairro,addressLocality].filter(Boolean).join(' · ')
  const latitude=Number(project?.latitude);const longitude=Number(project?.longitude)
  const hasCoordinates=Number.isFinite(latitude)&&Number.isFinite(longitude)&&latitude>=-90&&latitude<=90&&longitude>=-180&&longitude<=180
  const mapsUrl=hasCoordinates?`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`:''
  const fullAddress=[project?.cep,addressStreet,project?.complemento,project?.bairro,project?.cidade,project?.estado].filter(Boolean).join(', ')
  const copiedAddress=[fullAddress,mapsUrl].filter(Boolean).join('\n')
  const copyAddress=async()=>{if(!copiedAddress)return;await navigator.clipboard.writeText(copiedAddress);setAddressCopied(true);window.setTimeout(()=>setAddressCopied(false),1800)}

  return <div className="app-layout">
    <aside className={mobileOpen ? 'app-sidebar open' : 'app-sidebar'}>
      <div className="sidebar-brand"><a className="brand" href="/"><span className="brand-mark">M</span><span>MinhaObra</span></a><button onClick={() => setMobileOpen(false)}><X /></button></div>
      <section className="project-current" aria-label="Projeto atual">
        <div className="project-current-header"><span className="project-current-icon"><Building2 /></span><div className="project-current-heading"><small>PROJETO ATUAL</small><strong>{project?.nome || 'Carregando…'}</strong></div></div>
        {(fullAddress||mapsUrl)&&<div className="project-current-address">{project?.cep&&<span className="project-address-cep"><small>CEP</small><b>{project.cep}</b></span>}{(addressDetails||addressNeighborhood||mapsUrl)&&<div className="project-address-details">{addressDetails&&<span className="project-address-street">{addressDetails}</span>}{addressNeighborhood&&<span className="project-address-locality">{addressNeighborhood}</span>}{hasCoordinates&&<a className="project-address-map-link" href={mapsUrl} target="_blank" rel="noopener noreferrer">Ver localização no Google Maps</a>}</div>}<button type="button" onClick={()=>void copyAddress()} aria-label="Copiar endereço" title={addressCopied?'Endereço copiado':'Copiar endereço'}>{addressCopied?<Check/>:<Copy/>}</button><small className="project-address-feedback" role="status" aria-live="polite">{addressCopied?'Endereço copiado':''}</small></div>}
      </section>
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
    {user?.administrador_sistema && <SystemAdminLink className="system-admin-corner-link" />}
    {mobileOpen && <button className="sidebar-overlay" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}
    <div className="app-main">
      <header className="app-topbar">
        <button className="mobile-nav-button" onClick={() => setMobileOpen(true)}><Menu /></button>
        <div className="topbar-spacer" />
        <div className="topbar-actions"><TopbarBackButton /><TopbarUser user={user} role={roleLabel(data?.projeto.papel)} onSignOut={() => void signOut().then(() => navigate('/'))} /></div>
      </header>
      <main className="app-content"><Outlet context={{ project: data?.projeto, access: data }} /></main>
    </div>
  </div>
}
