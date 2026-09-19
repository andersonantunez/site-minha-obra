import { expenseItemTotalSql, expenseTotalSql } from '../despesas/expense-financial.js'
/**
 * Representação financeira de Despesas durante a transição Despesa -> Itens.
 *
 * Uma Despesa aparece uma única vez com o total calculado de seus itens. Registros
 * legados ainda sem Despesa continuam aparecendo individualmente. Centralizar este
 * CTE evita somar simultaneamente a Despesa e seus filhos nos módulos financeiros.
 */
export const paymentFinancialCte = `pagamentos_financeiros AS (
  SELECT c.id,c.projeto_id,c.descricao,c.etapa_id,
    NULL::numeric AS quantidade,NULL::varchar AS unidade,NULL::text AS observacao,
    c.fornecedor,c.status,c.data_pagamento,c.data_agendamento,c.data_entrega,c.forma_pagamento,
    NULL::varchar AS chave_pix,c.contato_fornecedor,c.nome_contato_fornecedor,c.criado_em,
    ${expenseTotalSql('c')} AS valor,
    'COMPRA'::text AS origem_tipo
  FROM despesas c
  WHERE c.excluido_em IS NULL
  UNION ALL
  SELECT p.id,p.projeto_id,p.descricao,p.etapa_id,p.quantidade,p.unidade,p.observacao,
    p.fornecedor,p.status,p.data_pagamento,p.data_agendamento,p.data_entrega,p.forma_pagamento,
    p.chave_pix,p.contato_fornecedor,p.nome_contato_fornecedor,p.criado_em,
    (${expenseItemTotalSql('p')})::numeric(15,2) AS valor,
    'ITEM_ORFAO'::text AS origem_tipo
  FROM pagamentos p
  WHERE p.compra_id IS NULL AND p.excluido_em IS NULL
)`
