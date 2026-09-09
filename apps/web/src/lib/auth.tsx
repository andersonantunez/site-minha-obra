/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from './api'

export type User = {
  id: number
  nome: string
  email: string
  foto_url: string | null
  administrador_sistema: boolean
  plano: string
  nome_plano: string
  limite_projetos_proprios: number | null
}

type AuthContextValue = {
  user: User | null
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const result = await api<{ usuario: User }>('/auth/eu')
      setUser(result.usuario)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void api<{ usuario: User }>('/auth/eu')
      .then((result) => setUser(result.usuario))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user, loading, refresh,
    signOut: async () => { await api('/auth/sair', { method: 'POST' }); setUser(null) },
  }), [user, loading, refresh])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return value
}
