import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export function ProtectedRoute({ children, admin = false }: { children: React.ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="route-loading"><span /><p>Preparando sua obra…</p></div>
  if (!user) return <Navigate to={`/login?retorno=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (admin && !user.administrador_sistema) return <Navigate to="/app" replace />
  return children
}
