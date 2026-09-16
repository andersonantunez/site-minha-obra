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
    const details = data.detalhes as { fieldErrors?: Record<string, string[] | undefined> } | undefined
    const fieldError = details?.fieldErrors && Object.entries(details.fieldErrors).find(([, messages]) => messages?.[0])
    const message = fieldError
      ? `${String(data.erro || 'Dados inválidos.')} ${fieldError[0].replaceAll('_', ' ')}: ${fieldError[1]![0]}`
      : String(data.erro || 'Não foi possível concluir a operação.')
    throw new ApiError(response.status, message, String(data.codigo || ''), data.detalhes)
  }
  return payload as T
}

export function jsonBody(value: unknown): Pick<RequestInit, 'body'> {
  return { body: JSON.stringify(value) }
}
