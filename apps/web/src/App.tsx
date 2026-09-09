import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LandingPage } from './pages/LandingPage'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { ProjectPermissionRoute } from './lib/projectAccess'

const AppShell = lazy(() => import('./layouts/AppShell').then((module) => ({ default: module.AppShell })))
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })))
const DocumentsPage = lazy(() => import('./pages/DocumentsPage').then((module) => ({ default: module.DocumentsPage })))
const DocumentCategoriesPage = lazy(() => import('./pages/DocumentCategoriesPage').then((module) => ({ default: module.DocumentCategoriesPage })))
const BudgetPage = lazy(() => import('./pages/BudgetPage').then((module) => ({ default: module.BudgetPage })))
const InvitePage = lazy(() => import('./pages/InvitePage').then((module) => ({ default: module.InvitePage })))
const MembersPage = lazy(() => import('./pages/MembersPage').then((module) => ({ default: module.MembersPage })))
const PaymentsPage = lazy(() => import('./pages/PaymentsPage').then((module) => ({ default: module.PaymentsPage })))
const PermissionsPage = lazy(() => import('./pages/PermissionsPage').then((module) => ({ default: module.PermissionsPage })))
const ProjectDashboardPage = lazy(() => import('./pages/ProjectDashboardPage').then((module) => ({ default: module.ProjectDashboardPage })))
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then((module) => ({ default: module.ProjectsPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const StagesPage = lazy(() => import('./pages/StagesPage').then((module) => ({ default: module.StagesPage })))
const TasksPage = lazy(() => import('./pages/TasksPage').then((module) => ({ default: module.TasksPage })))

const Loading = () => <div className="route-loading"><span /><p>Carregando…</p></div>

export function App() {
  return (
    <Suspense fallback={<Loading />}>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/convites/:token" element={<InvitePage />} />
      <Route path="/app" element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
      <Route path="/app/projetos/:projetoId" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route index element={<ProjectPermissionRoute permission="visao_geral.visualizar"><ProjectDashboardPage /></ProjectPermissionRoute>} />
        <Route path="etapas" element={<Navigate to="../cronograma" replace />} />
        <Route path="orcamento" element={<Navigate to="../fluxo-caixa" replace />} />
        <Route path="fluxo-caixa" element={<ProjectPermissionRoute permission="orcamento.visualizar"><BudgetPage /></ProjectPermissionRoute>} />
        <Route path="cronograma" element={<ProjectPermissionRoute permission="etapas.visualizar"><StagesPage /></ProjectPermissionRoute>} />
        <Route path="tarefas" element={<ProjectPermissionRoute permission="tarefas.visualizar"><TasksPage /></ProjectPermissionRoute>} />
        <Route path="pagamentos" element={<ProjectPermissionRoute permission="pagamentos.visualizar"><PaymentsPage /></ProjectPermissionRoute>} />
        <Route path="indicadores" element={<Navigate to=".." replace />} />
        <Route path="renders" element={<Navigate to="../documentos" replace />} />
        <Route path="plantas" element={<Navigate to="../documentos" replace />} />
        <Route path="categorias-documentos" element={<ProjectPermissionRoute permission="categorias.visualizar"><DocumentCategoriesPage /></ProjectPermissionRoute>} />
        <Route path="documentos" element={<ProjectPermissionRoute permission="documentos.visualizar"><DocumentsPage /></ProjectPermissionRoute>} />
        <Route path="participantes" element={<ProjectPermissionRoute permission="membros.visualizar"><MembersPage /></ProjectPermissionRoute>} />
        <Route path="permissoes" element={<ProjectPermissionRoute permission="permissoes.visualizar"><PermissionsPage /></ProjectPermissionRoute>} />
        <Route path="configuracoes" element={<ProjectPermissionRoute permission="configuracoes.visualizar"><SettingsPage /></ProjectPermissionRoute>} />
      </Route>
      <Route path="/admin" element={<ProtectedRoute admin><AdminPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}
