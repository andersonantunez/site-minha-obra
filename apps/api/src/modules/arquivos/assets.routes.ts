import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { query, withTransaction } from '../../config/database.js'
import { env } from '../../config/env.js'
import { requireAuth } from '../../shared/auth.js'
import { AppError } from '../../shared/errors.js'
import { requireProjectPermission } from '../../shared/projectAccess.js'
import { readStoredFile, removeStoredFile, safeDownloadName, saveUploadedFile } from '../../shared/storage.js'
import { validateHttpUrl } from '../../shared/url.js'
import { assignDocumentCategoryByName, replaceDocumentCategories } from './document-categories.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.maxUploadBytes, files: 1 }, fileFilter: (_req, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.mimetype)) })
const textOrNull = (max: number) => z.string().trim().max(max).optional().nullable().transform((value) => value || null)
const categoryIds = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}, z.array(z.coerce.number().int().positive()).min(1).max(50).refine((ids) => new Set(ids).size === ids.length, 'Não repita uma categoria.'))
const documentSchema = z.object({ titulo: z.string().trim().min(2).max(180), categoria_ids: categoryIds, descricao: textOrNull(4_000), url: textOrNull(4_000) })
const categorySchema = z.object({ nome: z.string().trim().min(2).max(80) })

async function listCategories(projectId: number) {
  return query('SELECT id,nome,criado_em FROM categorias_documento WHERE projeto_id=$1 AND excluido_em IS NULL ORDER BY nome', [projectId])
}

export const assetsRouter = Router({ mergeParams: true })
assetsRouter.use(requireAuth)

assetsRouter.get('/categorias', requireProjectPermission('categorias.visualizar'), async (req, res) => {
  const { rows } = await listCategories(req.acessoProjeto!.projetoId)
  res.json({ categorias: rows })
})

assetsRouter.get('/documentos/categorias', requireProjectPermission('documentos.visualizar'), async (req, res) => {
  const { rows } = await listCategories(req.acessoProjeto!.projetoId)
  res.json({ categorias: rows })
})

assetsRouter.post('/categorias', requireProjectPermission('categorias.inserir'), async (req, res) => {
  const input = categorySchema.parse(req.body)
  try {
    const { rows } = await query('INSERT INTO categorias_documento (projeto_id,nome,criado_por) VALUES ($1,$2,$3) RETURNING id,nome,criado_em', [req.acessoProjeto!.projetoId, input.nome, req.usuarioId])
    res.status(201).json({ categoria: rows[0] })
  } catch (error: unknown) {
    if ((error as { code?: string }).code === '23505') throw new AppError(409, 'Esta categoria já existe no projeto.', 'CATEGORIA_DOCUMENTO_DUPLICADA')
    throw error
  }
})

assetsRouter.put('/categorias/:categoriaId', requireProjectPermission('categorias.atualizar'), async (req, res) => {
  const input = categorySchema.parse(req.body)
  const current = await query<{ nome: string }>('SELECT nome FROM categorias_documento WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL', [Number(req.params.categoriaId), req.acessoProjeto!.projetoId])
  if (!current.rows[0]) throw new AppError(404, 'Categoria não encontrada.', 'CATEGORIA_DOCUMENTO_NAO_ENCONTRADA')
  const currentCategory = current.rows[0]
  if (currentCategory.nome.toLocaleLowerCase('pt-BR') === 'pagamentos' && input.nome.toLocaleLowerCase('pt-BR') !== 'pagamentos') throw new AppError(409, 'A categoria Pagamentos é usada automaticamente nos anexos de pagamentos.', 'CATEGORIA_PAGAMENTO_FIXA')
  try {
    const category = await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: number; nome: string; criado_em: string }>('UPDATE categorias_documento SET nome=$3 WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL RETURNING id,nome,criado_em', [Number(req.params.categoriaId), req.acessoProjeto!.projetoId, input.nome])
      await client.query('UPDATE documentos_projeto SET categoria=$3 WHERE projeto_id=$1 AND lower(categoria)=lower($2) AND excluido_em IS NULL', [req.acessoProjeto!.projetoId,currentCategory.nome,input.nome])
      return rows[0]!
    })
    res.json({ categoria: category })
  } catch (error: unknown) {
    if ((error as { code?: string }).code === '23505') throw new AppError(409, 'Esta categoria já existe no projeto.', 'CATEGORIA_DOCUMENTO_DUPLICADA')
    throw error
  }
})

assetsRouter.delete('/categorias/:categoriaId', requireProjectPermission('categorias.excluir'), async (req, res) => {
  const category = await query<{ nome: string }>('SELECT nome FROM categorias_documento WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL', [Number(req.params.categoriaId), req.acessoProjeto!.projetoId])
  if (!category.rows[0]) throw new AppError(404, 'Categoria não encontrada.', 'CATEGORIA_DOCUMENTO_NAO_ENCONTRADA')
  if (category.rows[0].nome.toLocaleLowerCase('pt-BR') === 'pagamentos') throw new AppError(409, 'A categoria Pagamentos é usada automaticamente nos anexos de pagamentos.', 'CATEGORIA_PAGAMENTO_FIXA')
  const used = await query(`SELECT 1 FROM documentos_projeto_categorias dc
    JOIN documentos_projeto d ON d.id=dc.documento_id
    WHERE dc.categoria_id=$1 AND d.projeto_id=$2 AND d.excluido_em IS NULL LIMIT 1`, [Number(req.params.categoriaId), req.acessoProjeto!.projetoId])
  if (used.rowCount) throw new AppError(409, 'Esta categoria possui documentos vinculados.', 'CATEGORIA_DOCUMENTO_EM_USO')
  await query('UPDATE categorias_documento SET excluido_em=NOW() WHERE id=$1 AND projeto_id=$2', [Number(req.params.categoriaId), req.acessoProjeto!.projetoId])
  res.status(204).end()
})

assetsRouter.get('/documentos', requireProjectPermission('documentos.visualizar'), async (req, res) => {
  const search = String(req.query.busca || '').trim()
  const categoryId = Number(req.query.categoriaId) || null
  const { rows } = await query(`SELECT d.id,d.titulo,d.descricao,d.tipo_origem,d.url,d.caminho_arquivo,d.nome_original,d.tipo_mime,d.pagamento_id,d.criado_em,p.descricao AS pagamento_descricao,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'nome',c.nome) ORDER BY c.nome)
        FROM documentos_projeto_categorias dc JOIN categorias_documento c ON c.id=dc.categoria_id
        WHERE dc.documento_id=d.id AND c.excluido_em IS NULL),'[]'::jsonb) AS categorias
    FROM documentos_projeto d LEFT JOIN pagamentos p ON p.id=d.pagamento_id
    WHERE d.projeto_id=$1 AND d.excluido_em IS NULL AND ($2::bigint IS NULL OR EXISTS (
      SELECT 1 FROM documentos_projeto_categorias dc WHERE dc.documento_id=d.id AND dc.categoria_id=$2))
      AND ($3='%%' OR d.titulo ILIKE $3 OR COALESCE(d.descricao,'') ILIKE $3 OR COALESCE(d.nome_original,'') ILIKE $3)
    ORDER BY d.criado_em DESC,d.id DESC`, [req.acessoProjeto!.projetoId, categoryId, `%${search}%`])
  res.json({ documentos: rows })
})

assetsRouter.get('/documentos/apresentacao', requireProjectPermission('configuracoes.visualizar'), async (req, res) => {
  const { rows } = await query(`SELECT d.id,d.titulo,d.categoria,d.url,d.caminho_arquivo,d.nome_original,d.tipo_mime,d.criado_em FROM documentos_projeto d
    JOIN documentos_projeto_categorias dc ON dc.documento_id=d.id
    JOIN categorias_documento c ON c.id=dc.categoria_id
    WHERE d.projeto_id=$1 AND lower(c.nome)=lower('Imagem de Apresentação') AND c.excluido_em IS NULL AND d.excluido_em IS NULL
    ORDER BY criado_em DESC,id DESC LIMIT 1`, [req.acessoProjeto!.projetoId])
  res.json({ documento: rows[0] || null })
})

assetsRouter.post('/documentos/apresentacao', requireProjectPermission('configuracoes.atualizar'), upload.single('arquivo'), async (req, res) => {
  if (!req.file || !req.file.mimetype.startsWith('image/')) throw new AppError(422, 'Envie uma imagem JPEG, PNG ou WebP.', 'IMAGEM_APRESENTACAO_OBRIGATORIA')
  const stored = await saveUploadedFile(req.acessoProjeto!.projetoId, 'documentos', req.file)
  try {
    const item = await withTransaction(async (client) => {
      await client.query(`INSERT INTO categorias_documento (projeto_id,nome,criado_por)
        VALUES ($1,'Imagem de Apresentação',$2) ON CONFLICT DO NOTHING`, [req.acessoProjeto!.projetoId, req.usuarioId])
      const previous = await client.query<{ id: number; caminho_arquivo: string | null }>(`SELECT d.id,d.caminho_arquivo FROM documentos_projeto d
        JOIN documentos_projeto_categorias dc ON dc.documento_id=d.id JOIN categorias_documento c ON c.id=dc.categoria_id
        WHERE d.projeto_id=$1 AND lower(c.nome)=lower('Imagem de Apresentação') AND c.excluido_em IS NULL AND d.excluido_em IS NULL
        ORDER BY criado_em DESC,id DESC LIMIT 1 FOR UPDATE`, [req.acessoProjeto!.projetoId])
      if (previous.rows[0]) {
        const { rows } = await client.query(`UPDATE documentos_projeto SET titulo='Imagem de apresentação',descricao='Imagem usada na apresentação do projeto',tipo_origem='ARQUIVO',url=NULL,caminho_arquivo=$2,nome_original=$3,tipo_mime=$4
          WHERE id=$1 RETURNING *`, [previous.rows[0].id,stored.relativePath,stored.originalName,stored.mimeType])
        await assignDocumentCategoryByName(client, rows[0]!.id, req.acessoProjeto!.projetoId, 'Imagem de Apresentação')
        return { documento: rows[0]!, previousPath: previous.rows[0].caminho_arquivo }
      }
      const { rows } = await client.query(`INSERT INTO documentos_projeto
        (projeto_id,titulo,categoria,descricao,tipo_origem,caminho_arquivo,nome_original,tipo_mime,criado_por)
        VALUES ($1,'Imagem de apresentação','Imagem de Apresentação','Imagem usada na apresentação do projeto','ARQUIVO',$2,$3,$4,$5) RETURNING *`, [req.acessoProjeto!.projetoId,stored.relativePath,stored.originalName,stored.mimeType,req.usuarioId])
      await assignDocumentCategoryByName(client, rows[0]!.id, req.acessoProjeto!.projetoId, 'Imagem de Apresentação')
      return { documento: rows[0]!, previousPath: null }
    })
    await removeStoredFile(item.previousPath)
    res.status(201).json({ documento: item.documento })
  } catch (error) { await removeStoredFile(stored.relativePath); throw error }
})

assetsRouter.post('/documentos', requireProjectPermission('documentos.inserir'), upload.single('arquivo'), async (req, res) => {
  const input = documentSchema.parse(req.body)
  if (!req.file && !input.url) throw new AppError(422, 'Envie um arquivo ou informe um link.', 'FONTE_OBRIGATORIA')
  if (req.file && input.url) throw new AppError(422, 'Escolha arquivo ou link, não ambos.', 'FONTE_DUPLICADA')
  const stored = req.file ? await saveUploadedFile(req.acessoProjeto!.projetoId, 'documentos', req.file) : null
  try {
    const url = input.url ? validateHttpUrl(input.url) : null
    const document = await withTransaction(async (client) => {
      const { rows } = await client.query(`INSERT INTO documentos_projeto (projeto_id,titulo,categoria,descricao,tipo_origem,url,caminho_arquivo,nome_original,tipo_mime,criado_por)
        SELECT $1,$2,c.nome,$3,$4,$5,$6,$7,$8,$9 FROM categorias_documento c WHERE c.id=$10
        RETURNING *`, [req.acessoProjeto!.projetoId,input.titulo,input.descricao,stored ? 'ARQUIVO' : 'LINK',url,stored?.relativePath,stored?.originalName,stored?.mimeType,req.usuarioId,input.categoria_ids[0]])
      if (!rows[0]) throw new AppError(422, 'Selecione uma categoria ativa do projeto.', 'CATEGORIA_DOCUMENTO_INVALIDA')
      await replaceDocumentCategories(client, rows[0].id, req.acessoProjeto!.projetoId, input.categoria_ids)
      return rows[0]
    })
    res.status(201).json({ documento: document })
  } catch (error) { await removeStoredFile(stored?.relativePath); throw error }
})

assetsRouter.put('/documentos/:documentoId', requireProjectPermission('documentos.atualizar'), upload.single('arquivo'), async (req, res) => {
  const input = documentSchema.parse(req.body)
  if (req.file && input.url) throw new AppError(422, 'Escolha arquivo ou link, não ambos.', 'FONTE_DUPLICADA')
  const before = await query<{ caminho_arquivo: string | null; url: string | null; tipo_origem: string }>('SELECT caminho_arquivo,url,tipo_origem FROM documentos_projeto WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL', [Number(req.params.documentoId), req.acessoProjeto!.projetoId])
  if (!before.rows[0]) throw new AppError(404, 'Documento não encontrado.', 'DOCUMENTO_NAO_ENCONTRADO')
  const currentDocument = before.rows[0]!
  const stored = req.file ? await saveUploadedFile(req.acessoProjeto!.projetoId, 'documentos', req.file) : null
  try {
    const url = input.url ? validateHttpUrl(input.url) : null
    const replacingSource = Boolean(stored || url)
    const source = replacingSource ? (stored ? 'ARQUIVO' : 'LINK') : currentDocument.tipo_origem
    const document = await withTransaction(async (client) => {
      const { rows } = await client.query(`UPDATE documentos_projeto SET titulo=$3,categoria=(SELECT nome FROM categorias_documento WHERE id=$4),descricao=$5,tipo_origem=$6,url=$7,caminho_arquivo=$8,nome_original=COALESCE($9,nome_original),tipo_mime=COALESCE($10,tipo_mime)
        WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL RETURNING *`, [Number(req.params.documentoId),req.acessoProjeto!.projetoId,input.titulo,input.categoria_ids[0],input.descricao,source,replacingSource ? url : currentDocument.url,replacingSource ? stored?.relativePath || null : currentDocument.caminho_arquivo,stored?.originalName,stored?.mimeType])
      if (!rows[0]) throw new AppError(404, 'Documento não encontrado.', 'DOCUMENTO_NAO_ENCONTRADO')
      await replaceDocumentCategories(client, rows[0].id, req.acessoProjeto!.projetoId, input.categoria_ids)
      return rows[0]
    })
    if (replacingSource) await removeStoredFile(currentDocument.caminho_arquivo)
    res.json({ documento: document })
  } catch (error) { await removeStoredFile(stored?.relativePath); throw error }
})

assetsRouter.delete('/documentos/:documentoId', requireProjectPermission('documentos.excluir'), async (req, res) => {
  const itemId = Number(req.params.documentoId)
  await withTransaction(async (client) => {
    const { rows } = await client.query('UPDATE documentos_projeto SET excluido_em=NOW() WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL RETURNING id', [itemId,req.acessoProjeto!.projetoId])
    if (!rows[0]) throw new AppError(404, 'Documento não encontrado.', 'DOCUMENTO_NAO_ENCONTRADO')
    await client.query('DELETE FROM documentos_projeto_categorias WHERE documento_id=$1', [itemId])
    await client.query('UPDATE documentos_pagamento SET excluido_em=NOW() WHERE documento_projeto_id=$1 AND excluido_em IS NULL', [itemId])
  })
  res.status(204).end()
})

assetsRouter.get('/documentos/:documentoId/arquivo', requireProjectPermission('documentos.visualizar'), async (req, res) => {
  const { rows } = await query<{ caminho_arquivo: string | null; nome_original: string | null; tipo_mime: string | null }>('SELECT caminho_arquivo,nome_original,tipo_mime FROM documentos_projeto WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL', [Number(req.params.documentoId),req.acessoProjeto!.projetoId])
  const document = rows[0]
  if (!document?.caminho_arquivo || !document.tipo_mime) throw new AppError(404, 'Arquivo não encontrado.', 'ARQUIVO_NAO_ENCONTRADO')
  res.setHeader('Content-Type', document.tipo_mime)
  res.setHeader('Content-Disposition', `inline; filename="${safeDownloadName(document.nome_original || 'documento', document.tipo_mime)}"`)
  res.setHeader('Cache-Control', 'private, max-age=300')
  res.send(await readStoredFile(document.caminho_arquivo))
})
