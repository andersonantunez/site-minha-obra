import { describe, expect, it } from 'vitest'
import { identifyStore, validateHttpUrl } from '../src/shared/url.js'
import { parseImportContent } from '../src/shared/importParser.js'
import { AppError } from '../src/shared/errors.js'

describe('segurança de URLs de produtos', () => {
  it.each(['javascript:alert(1)', 'data:text/html,oi', 'file:///segredo'])('rejeita protocolo perigoso %s', (url) => {
    expect(() => validateHttpUrl(url)).toThrow(AppError)
  })

  it('aceita HTTP/HTTPS e identifica lojas sem persistir enum', () => {
    expect(validateHttpUrl('https://www.amazon.com.br/produto')).toBe('https://www.amazon.com.br/produto')
    expect(identifyStore('https://shopee.com.br/item/1')).toBe('Shopee')
    expect(identifyStore('https://loja.exemplo.com.br/p/1')).toBe('loja.exemplo.com.br')
  })
})

describe('parser de importação', () => {
  it('interpreta TSV com cabeçalho normalizado', () => {
    const result = parseImportContent('TSV', 'Etapa\tValor Previsto\nFundação\t12500,50')
    expect(result).toEqual([{ etapa: 'Fundação', valor_previsto: '12500,50' }])
  })

  it('interpreta JSON como lista e rejeita objeto solto', () => {
    expect(parseImportContent('JSON', '[{"Mês/Ano":"2026-09","Valor":100}]')).toEqual([{ mes_ano: '2026-09', valor: 100 }])
    expect(() => parseImportContent('JSON', '{"valor":100}')).toThrow(AppError)
  })

  it('rejeita linha TSV com quantidade diferente de colunas', () => {
    expect(() => parseImportContent('TSV', 'nome\tvalor\nitem')).toThrow(/linha 2/i)
  })
})
