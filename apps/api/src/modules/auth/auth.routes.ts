import { Router } from 'express'
import { OAuth2Client } from 'google-auth-library'
import { z } from 'zod'
import { query, withTransaction } from '../../config/database.js'
import { env } from '../../config/env.js'
import { issueSessionToken, requireAuth } from '../../shared/auth.js'
import { AppError } from '../../shared/errors.js'
import { validateBody } from '../../shared/validation.js'

const googleClient = new OAuth2Client(env.googleClientId)
const loginSchema = z.object({ credencial: z.string().min(100).max(10_000) })

export const authRouter = Router()

authRouter.get('/configuracao', (_req, res) => {
  res.json({ googleClientId: env.googleClientId || null })
})

authRouter.post('/google', validateBody(loginSchema), async (req, res) => {
  if (!env.googleClientId) throw new AppError(503, 'O login Google ainda não foi configurado.', 'GOOGLE_NAO_CONFIGURADO')
  const ticket = await googleClient.verifyIdToken({ idToken: req.body.credencial, audience: env.googleClientId })
  const profile = ticket.getPayload()
  if (!profile?.sub || !profile.email || !profile.email_verified) {
    throw new AppError(401, 'A conta Google não pôde ser validada.', 'GOOGLE_INVALIDO')
  }
  const email = profile.email.trim().toLowerCase()
  const user = await withTransaction(async (client) => {
    const { rows } = await client.query<{
      id: number; nome: string; email: string; foto_url: string | null; administrador_sistema: boolean
    }>(`INSERT INTO usuarios (plano_id,google_sub,nome,email,foto_url,ultimo_acesso_em)
      VALUES ((SELECT id FROM planos WHERE codigo='FREE'),$1,$2,$3,$4,NOW())
      ON CONFLICT (email) DO UPDATE SET
        google_sub=CASE WHEN usuarios.google_sub IS NULL OR usuarios.google_sub=EXCLUDED.google_sub THEN EXCLUDED.google_sub ELSE usuarios.google_sub END,
        nome=EXCLUDED.nome, foto_url=EXCLUDED.foto_url, ultimo_acesso_em=NOW(), ativo=TRUE
      RETURNING id,nome,email,foto_url,administrador_sistema`, [profile.sub, profile.name || email, email, profile.picture || null])
    const row = rows[0]!
    if (!row) throw new AppError(500, 'Não foi possível criar a conta.', 'ERRO_CRIAR_USUARIO')
    return row
  })
  res.cookie('minhaobra_sessao', issueSessionToken(user.id), {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  })
  res.json({ usuario: user })
})

authRouter.post('/sair', (_req, res) => {
  res.clearCookie('minhaobra_sessao', { httpOnly: true, secure: env.nodeEnv === 'production', sameSite: 'lax', path: '/' })
  res.status(204).end()
})

authRouter.get('/eu', requireAuth, async (req, res) => {
  const { rows } = await query(`SELECT u.id,u.nome,u.email,u.foto_url,u.administrador_sistema,
    p.codigo AS plano,p.nome AS nome_plano,p.limite_projetos_proprios
    FROM usuarios u JOIN planos p ON p.id=u.plano_id WHERE u.id=$1`, [req.usuarioId])
  res.json({ usuario: rows[0] })
})
