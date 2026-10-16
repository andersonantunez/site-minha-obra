import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export function useUploadsEnabled() {
  return useQuery({ queryKey: ['system-uploads'], queryFn: () => api<{ uploads_enabled: boolean }>('/configuracoes/uploads'), staleTime: 30_000 })
}
