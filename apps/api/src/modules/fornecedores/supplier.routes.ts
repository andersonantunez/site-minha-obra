import { Router } from 'express'
import { query, withTransaction } from '../../config/database.js'
import { requireAuth } from '../../shared/auth.js'
import { AppError } from '../../shared/errors.js'
import { requireProjectPermission } from '../../shared/projectAccess.js'
import { validateBody } from '../../shared/validation.js'
import { supplierSchema } from './supplier.schemas.js'

export const suppliersRouter = Router({ mergeParams: true })
suppliersRouter.use(requireAuth)

suppliersRouter.get('/', requireProjectPermission('pagamentos.visualizar'), async (req, res) => {
  const { rows } = await query(`SELECT f.id,f.tipo_documento,f.numero_documento,f.nome,f.telefone,f.nome_funcionario,
    f.email,f.observacoes,f.site,f.chave_pix,COUNT(d.id)::int AS quantidade_despesas
    FROM fornecedores f LEFT JOIN despesas d ON d.fornecedor_id=f.id
    WHERE f.projeto_id=$1 AND f.excluido_em IS NULL
    GROUP BY f.id ORDER BY f.nome`, [req.acessoProjeto!.projetoId])
  res.json({ fornecedores: rows })
})

async function ensureUnique(projectId:number, document:string, name:string, ignoredId?:number) {
  const duplicate=await query<{id:number}>(`SELECT id FROM fornecedores WHERE projeto_id=$1 AND excluido_em IS NULL
    AND id<>COALESCE($4,0) AND (numero_documento=$2 OR lower(trim(nome))=lower(trim($3))) LIMIT 1`,[projectId,document,name,ignoredId||null])
  if(duplicate.rowCount)throw new AppError(409,'Já existe um fornecedor com este documento ou nome.','FORNECEDOR_DUPLICADO')
}

suppliersRouter.post('/', requireProjectPermission('pagamentos.inserir'), validateBody(supplierSchema), async (req,res)=>{
  const projectId=req.acessoProjeto!.projetoId
  await ensureUnique(projectId,req.body.numero_documento,req.body.nome)
  const {rows}=await query<{id:number}>(`INSERT INTO fornecedores
    (projeto_id,tipo_documento,numero_documento,nome,telefone,nome_funcionario,email,observacoes,site,chave_pix,criado_por)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,[projectId,req.body.tipo_documento,req.body.numero_documento,
    req.body.nome,req.body.telefone,req.body.nome_funcionario,req.body.email,req.body.observacoes,req.body.site,req.body.chave_pix,req.usuarioId])
  res.status(201).json({fornecedor:rows[0]})
})

suppliersRouter.put('/:fornecedorId', requireProjectPermission('pagamentos.atualizar'), validateBody(supplierSchema), async (req,res)=>{
  const projectId=req.acessoProjeto!.projetoId;const supplierId=Number(req.params.fornecedorId)
  await ensureUnique(projectId,req.body.numero_documento,req.body.nome,supplierId)
  await withTransaction(async client=>{
    const result=await client.query(`UPDATE fornecedores SET tipo_documento=$3,numero_documento=$4,nome=$5,telefone=$6,
      nome_funcionario=$7,email=$8,observacoes=$9,site=$10,chave_pix=$11,atualizado_em=NOW()
      WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL`,[supplierId,projectId,req.body.tipo_documento,req.body.numero_documento,
      req.body.nome,req.body.telefone,req.body.nome_funcionario,req.body.email,req.body.observacoes,req.body.site,req.body.chave_pix])
    if(!result.rowCount)throw new AppError(404,'Fornecedor não encontrado.','FORNECEDOR_NAO_ENCONTRADO')
    await client.query(`UPDATE despesas SET fornecedor=$3,contato_fornecedor=$4,nome_contato_fornecedor=$5
      WHERE fornecedor_id=$1 AND projeto_id=$2`,[supplierId,projectId,req.body.nome,req.body.telefone,req.body.nome_funcionario])
  })
  res.status(204).end()
})

suppliersRouter.delete('/:fornecedorId', requireProjectPermission('pagamentos.excluir'), async(req,res)=>{
  const projectId=req.acessoProjeto!.projetoId;const supplierId=Number(req.params.fornecedorId)
  const linked=await query('SELECT 1 FROM despesas WHERE fornecedor_id=$1 AND projeto_id=$2 LIMIT 1',[supplierId,projectId])
  if(linked.rowCount)throw new AppError(409,'Este fornecedor está vinculado a despesas e não pode ser excluído.','FORNECEDOR_EM_USO')
  const result=await query('UPDATE fornecedores SET excluido_em=NOW() WHERE id=$1 AND projeto_id=$2 AND excluido_em IS NULL',[supplierId,projectId])
  if(!result.rowCount)throw new AppError(404,'Fornecedor não encontrado.','FORNECEDOR_NAO_ENCONTRADO')
  res.status(204).end()
})

