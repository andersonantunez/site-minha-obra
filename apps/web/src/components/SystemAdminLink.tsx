import { Settings } from 'lucide-react'
import { Link } from 'react-router-dom'

export function SystemAdminLink({ className = '' }: { className?: string }) {
  return <Link className={`system-admin-link ${className}`.trim()} to="/admin"><Settings />Admin</Link>
}
