import { describe, expect, it } from 'vitest'
import { hasProjectPermission, type ProjectAccessInfo } from './projectAccess'

const access = (permissoes: string[], proprietario = false, administradorSistema = false): ProjectAccessInfo => ({
  projeto: { id: 1, nome: 'Projeto' }, permissoes, proprietario, administradorSistema,
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

  it('permite ao administrador do sistema usar qualquer módulo de qualquer projeto', () => {
    expect(hasProjectPermission(access([], false, true), 'pagamentos.excluir')).toBe(true)
  })
})
