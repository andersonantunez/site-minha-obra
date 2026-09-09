import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { api, jsonBody } from '../lib/api'
import { useAuth } from '../lib/auth'
import { ErrorNotice } from '../components/Ui'

declare global {
  interface Window {
    google?: { accounts: { id: { initialize(options: { client_id: string; callback: (result: { credential: string }) => void }): void; renderButton(element: HTMLElement, options: Record<string, unknown>): void } } }
  }
}

export function LoginPage() {
  const { user, refresh } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const buttonRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [configured, setConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    const prepare = async () => {
      const result = await api<{ googleClientId: string | null }>('/auth/configuracao')
      if (!active) return
      setConfigured(Boolean(result.googleClientId))
      if (!result.googleClientId) return
      const onCredential = async ({ credential }: { credential: string }) => {
        try {
          await api('/auth/google', { method: 'POST', ...jsonBody({ credencial: credential }) })
          await refresh()
          navigate(params.get('retorno') || '/app', { replace: true })
        } catch (issue) { setError(issue instanceof Error ? issue.message : 'Não foi possível entrar.') }
      }
      const render = () => {
        if (!window.google || !buttonRef.current || !result.googleClientId) return
        window.google.accounts.id.initialize({ client_id: result.googleClientId, callback: onCredential })
        window.google.accounts.id.renderButton(buttonRef.current, { theme: 'outline', size: 'large', shape: 'rectangular', text: 'continue_with', width: 320, locale: 'pt-BR' })
      }
      if (window.google) render()
      else {
        const script = document.createElement('script')
        script.src = 'https://accounts.google.com/gsi/client'
        script.async = true
        script.onload = render
        document.head.appendChild(script)
      }
    }
    void prepare().catch((issue) => setError(issue instanceof Error ? issue.message : 'Não foi possível preparar o login.'))
    return () => { active = false }
  }, [navigate, params, refresh])

  if (user) return <Navigate to={params.get('retorno') || '/app'} replace />
  return <main className="login-page">
    <a href="/" className="login-back"><ArrowLeft size={17} /> Página inicial</a>
    <section className="login-panel">
      <a className="brand dark" href="/"><span className="brand-mark">M</span><span>MinhaObra</span></a>
      <div className="login-copy"><span>ACESSO SEGURO</span><h1>Entre para acompanhar sua obra.</h1><p>Projetos, decisões, pagamentos e documentos protegidos em um só ambiente.</p></div>
      {error && <ErrorNotice message={error} />}
      {configured === false && <div className="setup-notice"><strong>Login em preparação</strong><p>Configure <code>GOOGLE_CLIENT_ID</code> no arquivo <code>.env</code> para habilitar o acesso.</p></div>}
      <div ref={buttonRef} className="google-button-slot" />
      <small className="login-security"><ShieldCheck size={15} /> A autenticação é feita diretamente pelo Google.</small>
    </section>
    <aside className="login-visual"><div><small>VISÃO UNIFICADA</small><strong>68%</strong><p>Execução física da CASA DALS</p><span><i style={{ width: '68%' }} /></span></div></aside>
  </main>
}
