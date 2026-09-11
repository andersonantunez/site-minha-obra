import type { PoolClient } from 'pg'
import { AppError } from '../../shared/errors.js'

type Queryable = Pick<PoolClient, 'query'>

export async function ensureActiveDocumentCategories(client: Queryable, projectId: number, categoryIds: number[]) {
  const uniqueIds = [...new Set(categoryIds)]
  const { rows } = await client.query<{ id: number }>(`SELECT id FROM categorias_documento
    WHERE projeto_id=$1 AND id=ANY($2::bigint[]) AND excluido_em IS NULL`, [projectId, uniqueIds])
  if (rows.length !== uniqueIds.length) throw new AppError(422, 'Selecione somente categorias ativas do projeto.', 'CATEGORIA_DOCUMENTO_INVALIDA')
  return uniqueIds
}

export async function replaceDocumentCategories(client: Queryable, documentId: number, projectId: number, categoryIds: number[]) {
  const uniqueIds = await ensureActiveDocumentCategories(client, projectId, categoryIds)
  await client.query('DELETE FROM documentos_projeto_categorias WHERE documento_id=$1', [documentId])
  await client.query(`INSERT INTO documentos_projeto_categorias (documento_id,categoria_id)
    SELECT $1,id FROM categorias_documento WHERE projeto_id=$2 AND id=ANY($3::bigint[])
    ON CONFLICT DO NOTHING`, [documentId, projectId, uniqueIds])
}

export async function assignDocumentCategoryByName(client: Queryable, documentId: number, projectId: number, categoryName: string) {
  const { rows } = await client.query<{ id: number }>(`SELECT id FROM categorias_documento
    WHERE projeto_id=$1 AND lower(nome)=lower($2) AND excluido_em IS NULL`, [projectId, categoryName])
  if (!rows[0]) throw new AppError(422, 'Categoria de documento não encontrada.', 'CATEGORIA_DOCUMENTO_INVALIDA')
  await client.query(`INSERT INTO documentos_projeto_categorias (documento_id,categoria_id)
    VALUES ($1,$2) ON CONFLICT DO NOTHING`, [documentId, rows[0].id])
}
