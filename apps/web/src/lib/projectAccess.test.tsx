import { describe, expect, it } from 'vitest'
import { hasProjectPermission, type ProjectAccessInfo } from './projectAccess'

const access = (permissoes: string[], proprietario = false): ProjectAccessInfo => ({
  projeto: { id: 1, nome: 'Projeto' }, permissoes, proprietario,
})

describe('acesso do projeto no frontend', () => {
  it('exibe somente módulos presentes nas permissões efetivas', () => {
    const engineer = access(['tarefas.visualizar'])
    expect(hasProjectPermission(engineer, 'tarefas.visualizar')).toBe(true)
    expect(hasProjectPermission(engineer, 'pagamentos.visualizar')).toBe(false)
  })

  it('mantém o proprietário com acesso protegido', () => {
    expect(hasProjectPermission(access([], true), 'permissoes.atualizar')).toBe(true)
  })
})
