import { randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { env } from '../config/env.js'
import { AppError } from './errors.js'

const mimeExtensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
}

function hasValidSignature(buffer: Buffer, mime: string) {
  if (mime === 'application/pdf') return buffer.subarray(0, 4).toString() === '%PDF'
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  if (mime === 'image/webp') return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP'
  return false
}

export async function saveUploadedFile(projectId: number, category: string, file: Express.Multer.File) {
  const extension = mimeExtensions[file.mimetype]
  if (!extension || !hasValidSignature(file.buffer, file.mimetype)) {
    throw new AppError(422, 'O conteúdo do arquivo não corresponde a um formato permitido.', 'ARQUIVO_INVALIDO')
  }
  const directory = resolve(env.uploadDir, 'projetos', String(projectId), category)
  await mkdir(directory, { recursive: true })
  const filename = `${randomUUID()}${extension}`
  const absolutePath = resolve(directory, filename)
  await writeFile(absolutePath, file.buffer, { flag: 'wx' })
  return { relativePath: absolutePath.slice(env.uploadDir.length + 1).split(sep).join('/'), originalName: file.originalname.slice(0, 255), mimeType: file.mimetype }
}

export async function readStoredFile(relativePath: string) {
  const absolutePath = resolve(env.uploadDir, relativePath)
  const root = `${resolve(env.uploadDir)}${sep}`
  if (!absolutePath.startsWith(root)) throw new AppError(400, 'Caminho de arquivo inválido.', 'ARQUIVO_INVALIDO')
  try {
    return await readFile(absolutePath)
  } catch {
    throw new AppError(404, 'Arquivo não encontrado.', 'ARQUIVO_NAO_ENCONTRADO')
  }
}

export async function removeStoredFile(relativePath?: string | null) {
  if (!relativePath) return
  const absolutePath = resolve(env.uploadDir, relativePath)
  if (!absolutePath.startsWith(`${resolve(env.uploadDir)}${sep}`)) return
  await unlink(absolutePath).catch(() => undefined)
}

export function safeDownloadName(value: string, mimeType: string) {
  const extension = mimeExtensions[mimeType] || extname(value)
  const base = value.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180)
  return base.toLowerCase().endsWith(extension) ? base : `${base}${extension}`
}
