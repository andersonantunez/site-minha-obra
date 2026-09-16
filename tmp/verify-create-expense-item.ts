import { pool } from '../apps/api/src/config/database.js'

const client = await pool.connect()
try {
  await client.query('BEGIN')
  const purchase = await client.query<{ id: number }>('SELECT id FROM compras WHERE projeto_id=$1 AND excluido_em IS NULL ORDER BY id LIMIT 1', [1])
  if (!purchase.rows[0]) throw new Error('Nenhuma compra ativa para validar.')
  const inserted = await client.query<{ id: number; valor: string; valor_total_manual: boolean }>(`INSERT INTO pagamentos
    (projeto_id,compra_id,descricao,quantidade,unidade,observacao,valor_unitario,valor,valor_total_manual,status,ordem,criado_por)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDENTE',$10,$11)
    RETURNING id,valor,valor_total_manual`, [1, purchase.rows[0].id, 'Validação temporária', 3000, 'unidades', null, 1.8333, 5500, true, 0, 1])
  console.log(JSON.stringify({ item: inserted.rows[0], purchaseId: purchase.rows[0].id }))
  await client.query('ROLLBACK')
} finally {
  client.release()
  await pool.end()
}
