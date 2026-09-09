import type { ErrorRequestHandler, RequestHandler } from 'express'
import multer from 'multer'
import { ZodError } from 'zod'
import { env } from '../config/env.js'

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = 'ERRO_APLICACAO',
    public readonly details?: unknown,
  ) {
    super(message)
  }
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ erro: 'Recurso não encontrado.', codigo: 'NAO_ENCONTRADO' })
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 422).json({ erro: error.code === 'LIMIT_FILE_SIZE' ? 'O arquivo excede o tamanho permitido.' : 'Não foi possível processar o arquivo.', codigo: error.code })
    return
  }
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ erro: error.message, codigo: error.code, detalhes: error.details })
    return
  }
  if (error instanceof ZodError) {
    res.status(422).json({ erro: 'Dados inválidos.', codigo: 'VALIDACAO', detalhes: error.flatten() })
    return
  }
  const reference = crypto.randomUUID()
  console.error(`[erro:${reference}]`, error)
  res.status(500).json({
    erro: 'Não foi possível concluir a operação.',
    codigo: 'ERRO_INTERNO',
    referencia: reference,
    ...(env.nodeEnv === 'development' && error instanceof Error ? { detalhe: error.message } : {}),
  })
}
