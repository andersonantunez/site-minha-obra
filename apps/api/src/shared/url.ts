import { AppError } from './errors.js'

export function validateHttpUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new AppError(422, 'Informe uma URL válida.', 'URL_INVALIDA')
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new AppError(422, 'A URL deve usar HTTP ou HTTPS.', 'PROTOCOLO_URL_INVALIDO')
  }
  return url.toString()
}

export function identifyStore(value: string): string {
  const hostname = new URL(validateHttpUrl(value)).hostname.toLowerCase().replace(/^www\./, '')
  if (hostname.endsWith('amazon.com.br') || hostname.endsWith('amazon.com')) return 'Amazon'
  if (hostname.endsWith('shopee.com.br')) return 'Shopee'
  if (hostname.endsWith('mercadolivre.com.br')) return 'Mercado Livre'
  return hostname
}
