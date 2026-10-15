import { ChevronDown, LogOut, Settings } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

type TopbarUserData = { nome?: string | null; foto_url?: string | null; administrador_sistema?: boolean }

export function TopbarUser({ user, role, onSignOut }: { user: TopbarUserData | null; role: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  return <div className="topbar-user" ref={containerRef}>
    <button className="topbar-user-trigger" type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((current) => !current)}>
      {user?.foto_url ? <img src={user.foto_url} alt="" referrerPolicy="no-referrer" /> : <span className="topbar-user-avatar">{user?.nome?.charAt(0)}</span>}
      <span className="topbar-user-details"><strong>{user?.nome}</strong><small>{role}</small></span>
      <ChevronDown className="topbar-user-chevron" aria-hidden="true" />
    </button>
    {open && <div className="topbar-user-menu" role="menu">
      {user?.administrador_sistema && <Link className="topbar-user-menu-item" role="menuitem" to="/admin" onClick={() => setOpen(false)}><Settings aria-hidden="true" />Admin</Link>}
      <button type="button" role="menuitem" onClick={() => { setOpen(false); onSignOut() }}><LogOut aria-hidden="true" />Sair</button>
      <div className="topbar-user-menu-divider" role="separator" />
      <a className="usermenu__versao" role="menuitem" title="Ver novidades da versão" href="https://github.com/andersonantunez/site-minha-obra/releases" target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>v0.1.0</a>
    </div>}
  </div>
}
