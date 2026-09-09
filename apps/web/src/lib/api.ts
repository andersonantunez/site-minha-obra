export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly code?: string, public readonly details?: unknown) {
    super(message)
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: { ...(isFormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers },
  })
  if (response.status === 204) return undefined as T
  const type = response.headers.get('content-type') || ''
  const payload = type.includes('application/json') ? await response.json() : await response.text()
  if (!response.ok) {
    const data = typeof payload === 'object' && payload ? payload as Record<string, unknown> : {}
    throw new ApiError(response.status, String(data.erro || 'Não foi possível concluir a operação.'), String(data.codigo || ''), data.detalhes)
  }
  return payload as T
}

export function jsonBody(value: unknown): Pick<RequestInit, 'body'> {
  return { body: JSON.stringify(value) }
}
