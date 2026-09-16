import { query } from '../apps/api/src/config/database.js'

const pagamentos = await query(`SELECT COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE excluido_em IS NULL)::int AS ativos,
  COUNT(*) FILTER (WHERE compra_id IS NOT NULL AND excluido_em IS NULL)::int AS com_compra
  FROM pagamentos WHERE projeto_id=1`)
const compras = await query(`SELECT COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE excluido_em IS NULL)::int AS ativos
  FROM compras WHERE projeto_id=1`)
console.log(JSON.stringify({ pagamentos: pagamentos.rows[0], compras: compras.rows[0] }))

const totals = await query(`SELECT COUNT(*)::int AS itens,
  COUNT(*) FILTER (WHERE valor_total_manual)::int AS totais_manuais,
  COALESCE(SUM(CASE WHEN valor_total_manual THEN valor
    WHEN valor_unitario IS NULL THEN valor
    ELSE ROUND(COALESCE(quantidade,1) * valor_unitario,2) END),0) AS total_calculado
  FROM pagamentos WHERE projeto_id=1 AND excluido_em IS NULL`)
console.log(JSON.stringify({ totais: totals.rows[0] }))
