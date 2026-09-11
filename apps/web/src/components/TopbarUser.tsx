import { LogOut } from 'lucide-react'

type TopbarUserData = { nome?: string | null; foto_url?: string | null }

export function TopbarUser({ user, role, onSignOut }: { user: TopbarUserData | null; role: string; onSignOut: () => void }) {
  return <div className="topbar-user">{user?.foto_url ? <img src={user.foto_url} alt="" referrerPolicy="no-referrer" /> : <span className="topbar-user-avatar">{user?.nome?.charAt(0)}</span>}<div><strong>{user?.nome}</strong><small>{role}</small></div><button className="topbar-signout" type="button" aria-label="Sair" title="Sair" onClick={onSignOut}><LogOut /></button></div>
}
