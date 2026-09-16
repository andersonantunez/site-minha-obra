import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function TopbarBackButton() {
  const navigate = useNavigate()
  return <button type="button" className="topbar-back-button" onClick={() => navigate('/app/')}><ArrowLeft />Voltar</button>
}
