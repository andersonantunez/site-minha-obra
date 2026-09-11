import { describe, expect, it } from 'vitest'
import { systemVariableSchema } from '../src/modules/admin/system-variable.schemas.js'

describe('variáveis do sistema', () => {
  it.each([
    ['texto'],
    [12.5],
    [true],
    [['um', 'dois']],
    [{ recurso: { ativo: true }, limites: [1, 2] }],
    [null],
  ])('aceita valores JSON tipados: %j', (valor) => {
    expect(systemVariableSchema.safeParse({ chave: 'variavel_teste', valor, descricao: 'Variável usada no teste.' }).success).toBe(true)
  })

  it('rejeita chaves fora do padrão centralizado', () => {
    expect(systemVariableSchema.safeParse({ chave: 'administradores globais', valor: [], descricao: 'Lista administrativa.' }).success).toBe(false)
  })
})
