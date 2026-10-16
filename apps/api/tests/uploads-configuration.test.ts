import type { Request, Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))
vi.mock('../src/config/database.js', () => ({ query: queryMock }))

import { requireFileUploadsEnabled, requireUploadsEnabled, uploadsEnabled } from '../src/shared/uploads.js'

describe('configuração global de uploads', () => {
  beforeEach(() => queryMock.mockReset())

  it('mantém uploads desligados quando a configuração não existe ou é falsa', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
    await expect(uploadsEnabled()).resolves.toBe(false)
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ valor: false }] })
    await expect(uploadsEnabled()).resolves.toBe(false)
  })

  it('bloqueia o endpoint de upload antes de qualquer escrita quando desligado', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ valor: false }] })
    await expect(requireUploadsEnabled({} as Request, {} as Response, vi.fn())).rejects.toMatchObject({ statusCode: 403, code: 'UPLOADS_DESABILITADOS' })
  })

  it('mantém o envio de link externo disponível quando não há arquivo', async () => {
    const next = vi.fn()
    await requireFileUploadsEnabled({} as Request, {} as Response, next)
    expect(next).toHaveBeenCalledOnce()
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('permite o fluxo quando a configuração está ligada', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ valor: true }] })
    const next = vi.fn()
    await requireUploadsEnabled({} as Request, {} as Response, next)
    expect(next).toHaveBeenCalledOnce()
  })
})
