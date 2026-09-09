import type { RequestHandler } from 'express'
import jwt, { type SignOptions } from 'jsonwebtoken'
import { query } from '../config/database.js'
import { env } from '../config/env.js'
import { AppError } from './errors.js'

type SessionPayload = { sub: string; tipo: 'sessao' }

export function issueSessionToken(userId: number): string {
  return jwt.sign({ tipo: 'sessao' }, env.jwtSecret, {
    subject: String(userId),
    expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
    issuer: 'minhaobra-api',
    audience: 'minhaobra-web',
  })
}

export function verifySessionToken(token: string): number {
  try {
    const payload = jwt.verify(token, env.jwtSecret, {
      issuer: 'minhaobra-api',
      audience: 'minhaobra-web',
    }) as SessionPayload
    const userId = Number(payload.sub)
    if (!Number.isSafeInteger(userId) || payload.tipo !== 'sessao') throw new Error('Token inválido')
    return userId
  } catch {
    throw new AppError(401, 'Sessão inválida ou expirada.', 'NAO_AUTENTICADO')
  }
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? readCookie(req.headers.cookie, 'minhaobra_sessao')
  if (!token) throw new AppError(401, 'Autenticação necessária.', 'NAO_AUTENTICADO')
  const userId = verifySessionToken(token)
  const { rowCount } = await query('SELECT 1 FROM usuarios WHERE id=$1 AND ativo', [userId])
  if (!rowCount) throw new AppError(401, 'Usuário inativo ou inexistente.', 'NAO_AUTENTICADO')
  req.usuarioId = userId
  next()
}

export const optionalAuth: RequestHandler = async (req, _res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? readCookie(req.headers.cookie, 'minhaobra_sessao')
  if (!token) return next()
  try {
    const userId = verifySessionToken(token)
    const { rowCount } = await query('SELECT 1 FROM usuarios WHERE id=$1 AND ativo', [userId])
    if (rowCount) req.usuarioId = userId
  } catch {
    // Rotas públicas não falham por um token antigo; apenas ignoram a sessão.
  }
  next()
}

function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}
