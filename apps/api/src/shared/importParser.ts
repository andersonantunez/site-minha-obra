import { AppError } from './errors.js'

export type ImportFormat = 'TSV' | 'JSON'

function normalizeKey(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s/-]+/g, '_')
}

export function parseImportContent(format: ImportFormat, content: string): unknown[] {
  if (content.length > 5_000_000) throw new AppError(413, 'Arquivo muito grande para importação.', 'IMPORTACAO_MUITO_GRANDE')
  if (format === 'JSON') {
    try {
      const parsed: unknown = JSON.parse(content.replace(/^\uFEFF/, ''))
      if (!Array.isArray(parsed)) throw new Error('A raiz deve ser uma lista')
      if (!parsed.length || parsed.length > 10000) throw new Error('Informe entre 1 e 10000 registros')
      return parsed.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Registro inválido')
        return Object.fromEntries(Object.entries(item).map(([key, value]) => [normalizeKey(key), value]))
      })
    } catch {
      throw new AppError(422, 'JSON inválido. Utilize uma lista com 1 a 10000 objetos.', 'JSON_INVALIDO')
    }
  }

  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) throw new AppError(422, 'O TSV deve conter cabeçalho e ao menos uma linha.', 'TSV_VAZIO')
  const headers = lines[0]!.split('\t').map(normalizeKey)
  if (headers.some(header => !header)) throw new AppError(422, 'O TSV possui cabeçalho vazio.', 'TSV_CABECALHO_INVALIDO')
  if (lines.length > 10001) throw new AppError(413, 'Utilize até 10000 registros por importação.', 'IMPORTACAO_MUITO_GRANDE')
  if (new Set(headers).size !== headers.length) throw new AppError(422, 'O TSV possui colunas repetidas.', 'TSV_CABECALHO_INVALIDO')
  return lines.slice(1).map((line, lineIndex) => {
    const values = line.split('\t')
    if (values.length !== headers.length) {
      throw new AppError(422, `A linha ${lineIndex + 2} possui ${values.length} colunas; eram esperadas ${headers.length}.`, 'TSV_COLUNAS_INVALIDAS')
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() || null]))
  })
}

export function parseBrazilianNumber(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const clean = value.replace(/R\$\s?/g, '').trim()
  if (!clean) return undefined
  if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(clean)) return Number(clean.replace(/\./g, '').replace(',', '.'))
  if (/^-?\d+,\d+$/.test(clean)) return Number(clean.replace(',', '.'))
  return Number(clean)
}
