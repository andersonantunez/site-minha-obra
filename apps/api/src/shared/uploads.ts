import type { RequestHandler } from 'express'
import { query } from '../config/database.js'
import { AppError } from './errors.js'

export const UPLOADS_DISABLED_MESSAGE = 'O envio de arquivos está desabilitado nas configurações do sistema.'

export async function ensureUploadSettings() {
  await query(`INSERT INTO configuracoes_sistema (chave,valor,descricao) VALUES
    ('uploads_enabled','false'::jsonb,'Permitir envio de arquivos — Habilita o envio e armazenamento de arquivos e anexos em todo o sistema.'),
    ('storage_provider','"local"'::jsonb,'Provedor de armazenamento usado para novos arquivos.'),
    ('storage_config','{"bucket":null,"regiao":null,"url":null,"credenciais":null,"limite_mb":15,"tipos_permitidos":["image/jpeg","image/png","image/webp","application/pdf"]}'::jsonb,'Configurações do provedor de armazenamento para uso futuro.')
    ON CONFLICT (chave) DO NOTHING`)
}

export async function uploadsEnabled() {
  await ensureUploadSettings()
  const { rows } = await query<{ valor: unknown }>("SELECT valor FROM configuracoes_sistema WHERE chave='uploads_enabled'")
  return rows[0]?.valor === true
}

export const requireUploadsEnabled: RequestHandler = async (_req, _res, next) => {
  if (!await uploadsEnabled()) throw new AppError(403, UPLOADS_DISABLED_MESSAGE, 'UPLOADS_DESABILITADOS')
  next()
}

export const requireFileUploadsEnabled: RequestHandler = async (req, _res, next) => {
  if (req.file && !await uploadsEnabled()) throw new AppError(403, UPLOADS_DISABLED_MESSAGE, 'UPLOADS_DESABILITADOS')
  next()
}
