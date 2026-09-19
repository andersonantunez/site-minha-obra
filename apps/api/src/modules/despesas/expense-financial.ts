/** Valores finais respeitam o total manual e aplicam cada desconto uma única vez. */
export function expenseItemTotalSql(alias = 'i') {
  return `CASE WHEN ${alias}.valor_total_manual THEN ${alias}.valor
    WHEN ${alias}.valor_unitario IS NULL THEN ${alias}.valor
    ELSE ROUND((COALESCE(${alias}.quantidade,1)*${alias}.valor_unitario)-COALESCE(${alias}.valor_desconto,0),2) END`
}

export function expenseTotalSql(alias = 'd') {
  return `(COALESCE((SELECT SUM(${expenseItemTotalSql('item_total')}) FROM pagamentos item_total
    WHERE item_total.compra_id=${alias}.id AND item_total.projeto_id=${alias}.projeto_id
      AND item_total.excluido_em IS NULL),0)-COALESCE(${alias}.valor_desconto,0))::numeric(15,2)`
}
