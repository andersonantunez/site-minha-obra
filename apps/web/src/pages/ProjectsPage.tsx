import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, CalendarDays, MapPin, Settings, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AddButton, EmptyState, ErrorNotice, PageHeader } from '../components/Ui'
import { api, jsonBody } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDateRange } from '../lib/format'
import { roleLabel } from '../lib/projectAccess'
import { TopbarUser } from '../components/TopbarUser'
import { TopbarBackButton } from '../components/TopbarBackButton'

type ProjectFilter = 'ATIVOS' | 'ARQUIVADOS' | 'TODOS'
type Project = {
  id: number; nome: string; descricao: string; cidade: string | null; estado: string | null; bairro: string | null
  data_inicio: string | null; previsao_termino: string | null; area_construida: string | null; papel: string
  proprietario: boolean; percentual_andamento: string; imagem_apresentacao_id: number | null
  imagem_apresentacao_url: string | null; arquivado_em: string | null
}

const projectLocation = (project: Project) => {
  const city = [project.cidade, project.estado].filter(Boolean).join(', ')
  if (city && project.bairro) return `${city} - ${project.bairro}`
  return city || project.bairro || 'Localização não informada'
}

function ProjectCards({ projects, archived = false }: { projects: Project[]; archived?: boolean }) {
  return <div className="projects-grid">{projects.map((project) => <Link to={`/app/projetos/${project.id}`} className={`project-card${archived ? ' archived' : ''}`} key={project.id}>
    <div className="project-card-art">{project.imagem_apresentacao_id ? <img src={project.imagem_apresentacao_url || `/api/projetos/${project.id}/acervo/documentos/${project.imagem_apresentacao_id}/arquivo`} alt="" /> : <Building2 />}</div>
    <div className="project-card-progress"><strong>{Math.round(Number(project.percentual_andamento))}%</strong><span>em andamento</span></div>
    <div className="project-card-body"><span>{archived ? 'ARQUIVADO' : project.proprietario ? 'PROJETO PRÓPRIO' : roleLabel(project.papel)}</span><h2>{project.nome}</h2><p>{project.descricao}</p><div className="project-card-details"><strong><MapPin />{projectLocation(project)}</strong><small><CalendarDays />{formatDateRange(project.data_inicio, project.previsao_termino)}</small></div></div>
  </Link>)}</div>
}

export function ProjectsPage() {
  const { user, signOut } = useAuth()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState<ProjectFilter>('ATIVOS')
  const { data, isLoading, error } = useQuery({ queryKey: ['projetos', filter], queryFn: () => api<{ projetos: Project[] }>(`/projetos?status=${filter}`) })
  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api('/projetos', { method: 'POST', ...jsonBody(payload) }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['projetos'] }); setCreating(false) },
  })
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    create.mutate({
      nome: data.get('nome'), descricao: data.get('descricao'), endereco: data.get('logradouro') || null,
      logradouro: data.get('logradouro') || null, numero: data.get('numero') || null,
      cidade: data.get('cidade') || null, estado: data.get('estado') || null,
    })
  }

  const projects = data?.projetos || []
  const activeProjects = projects.filter((project) => !project.arquivado_em)
  const archivedProjects = projects.filter((project) => Boolean(project.arquivado_em))
  const emptyTitle = filter === 'ARQUIVADOS' ? 'Nenhum projeto arquivado encontrado.' : filter === 'TODOS' ? 'Nenhum projeto encontrado.' : 'Sua primeira obra começa aqui'

  return <div className="projects-page">
    <header className="projects-topbar"><a className="brand dark" href="/"><span className="brand-mark">M</span><span>MinhaObra</span></a><div className="topbar-actions"><TopbarBackButton />{user?.administrador_sistema && <Link className="system-admin-topbar-link" to="/admin"><Settings />Admin</Link>}<TopbarUser user={user} role={user?.administrador_sistema ? 'Administrador do Sistema' : user?.nome_plano || 'Usuário'} onSignOut={() => void signOut()} /></div></header>
    <main className="projects-content">
      <PageHeader eyebrow="PROJETOS" title="Minhas obras" description="Acesse, acompanhe e gerencie suas obras em um único lugar." action={<div className="projects-heading-actions"><label className="projects-status-filter"><span>Exibir</span><select value={filter} onChange={(event) => setFilter(event.target.value as ProjectFilter)}><option value="ATIVOS">Ativos</option><option value="ARQUIVADOS">Arquivados</option><option value="TODOS">Todos</option></select></label><AddButton onClick={() => setCreating(true)}>Nova obra</AddButton></div>} />
      {error && <ErrorNotice message={error.message} />}
      {isLoading ? <div className="route-loading"><span /><p>Buscando seus projetos…</p></div> : !projects.length
        ? <EmptyState icon={Building2} title={emptyTitle} description={filter === 'ATIVOS' ? 'Cadastre as informações essenciais do projeto. No plano Free, você pode ter uma obra própria e participar de quantas for convidado.' : 'Altere o filtro para visualizar outros projetos ou cadastre uma nova obra.'} action={filter === 'ATIVOS' ? <AddButton onClick={() => setCreating(true)}>Criar primeira obra</AddButton> : undefined} />
        : <>{filter !== 'ARQUIVADOS' && activeProjects.length > 0 && <ProjectCards projects={activeProjects} />}{filter === 'TODOS' && archivedProjects.length > 0 && <div className="archived-projects-divider"><span>Projetos arquivados</span></div>}{filter !== 'ATIVOS' && archivedProjects.length > 0 && <ProjectCards projects={archivedProjects} archived />}</>}
    </main>
    {creating && <div className="dialog-backdrop" role="presentation"><section className="dialog large" role="dialog" aria-modal="true" aria-labelledby="new-project-title"><header><div><small>NOVO PROJETO</small><h2 id="new-project-title">Cadastre sua obra</h2></div><button onClick={() => setCreating(false)}><X /></button></header><form onSubmit={submit}>
      {create.error && <ErrorNotice message={create.error.message} />}
      <label className="field span-2"><span>Nome do projeto</span><input name="nome" required minLength={3} placeholder="Ex.: CASA DALS" /></label>
      <label className="field span-2"><span>Descrição</span><textarea name="descricao" required minLength={10} rows={4} placeholder="Conte o conceito e os principais objetivos desta obra." /></label>
      <label className="field span-2"><span>Logradouro <em>opcional</em></span><input name="logradouro" /></label><label className="field"><span>Número</span><input name="numero" /></label>
      <label className="field"><span>Cidade</span><input name="cidade" /></label><label className="field small-field"><span>UF</span><input name="estado" maxLength={2} /></label>
      <footer className="form-actions span-2"><button type="button" className="app-button" onClick={() => setCreating(false)}>Cancelar</button><button className="app-button primary" disabled={create.isPending}>{create.isPending ? 'Criando…' : 'Criar obra'}</button></footer>
    </form></section></div>}
  </div>
}
