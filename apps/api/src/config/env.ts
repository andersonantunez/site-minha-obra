import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import dotenv from 'dotenv'
import { z } from 'zod'

const envCandidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]
const envPath = envCandidates.find((candidate) => existsSync(candidate))
if (envPath) dotenv.config({ path: envPath })

const booleanValue = z.string().optional().transform((value) => value === 'true')

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  WEB_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1).default('postgresql://postgres:postgres@localhost:5432/db_casa_dals'),
  DATABASE_SSL: booleanValue,
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  JWT_SECRET: z.string().min(32).optional(),
  JWT_EXPIRES_IN: z.string().default('8h'),
  UPLOAD_DIR: z.string().default('apps/api/uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(50).default(15),
})

const parsed = schema.parse(process.env)

if (parsed.NODE_ENV === 'production' && !parsed.JWT_SECRET) {
  throw new Error('JWT_SECRET deve ser configurado em produção.')
}

export const env = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.PORT,
  webUrl: parsed.WEB_URL,
  databaseUrl: parsed.DATABASE_URL,
  databaseSsl: parsed.DATABASE_SSL,
  googleClientId: parsed.GOOGLE_CLIENT_ID,
  googleClientSecret: parsed.GOOGLE_CLIENT_SECRET,
  jwtSecret: parsed.JWT_SECRET ?? randomBytes(48).toString('hex'),
  jwtExpiresIn: parsed.JWT_EXPIRES_IN,
  uploadDir: resolve(process.cwd(), parsed.UPLOAD_DIR),
  maxUploadBytes: parsed.MAX_UPLOAD_MB * 1024 * 1024,
} as const
