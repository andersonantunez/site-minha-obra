import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function TopbarBackButton() {
  const navigate = useNavigate()
  const goBack = () => window.history.length > 1 ? navigate(-1) : navigate('/app')
  return <button type="button" className="topbar-back-button" onClick={goBack}><ArrowLeft />Voltar</button>
}
