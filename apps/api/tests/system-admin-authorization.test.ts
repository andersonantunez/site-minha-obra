import type { Request, Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))
vi.mock('../src/config/database.js', () => ({ query: queryMock }))

import { getProjectAccess, requireSystemAdmin } from '../src/shared/projectAccess.js'

describe('autorização do administrador do sistema', () => {
  beforeEach(() => queryMock.mockReset())

  it('nega acesso direto às rotas administrativas para usuário comum', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] })
    await expect(requireSystemAdmin({ usuarioId: 8 } as Request, {} as Response, vi.fn())).rejects.toMatchObject({ statusCode: 403, code: 'ACESSO_NEGADO' })
  })

  it('autoriza o administrador global sem depender de papel de projeto', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ administrador_sistema: true }] })
    const next = vi.fn()
    await requireSystemAdmin({ usuarioId: 2 } as Request, {} as Response, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('concede ao administrador global todas as permissões de qualquer projeto existente', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ administrador_sistema: true }] })
      .mockResolvedValueOnce({ rows: [{ chave: 'pagamentos.visualizar' }, { chave: 'configuracoes.atualizar' }] })
    const access = await getProjectAccess(2, 99)
    expect(access.administradorSistema).toBe(true)
    expect(access.papel).toBe('ADMINISTRADOR_SISTEMA')
    expect(access.membroProjetoId).toBe(0)
    expect(access.permissoes).toEqual(new Set(['pagamentos.visualizar', 'configuracoes.atualizar']))
  })

  it('mantém usuário comum sem vínculo fora do projeto', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ administrador_sistema: false }] })
      .mockResolvedValueOnce({ rows: [] })
    await expect(getProjectAccess(8, 99)).rejects.toMatchObject({ statusCode: 404, code: 'PROJETO_NAO_ENCONTRADO' })
  })
})
