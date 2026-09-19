import { query } from '../../config/database.js'
import { SETTLED_PAYMENT_STATUSES } from '../pagamentos/payment-status.js'
import { cashFlowCte, cashFlowFilter } from './cash-flow.query.js'

export type CashFlowFilters = { search: string; start: string | null; end: string | null; includeFuture: boolean }
export type CashFlowItem = {
  id:string; origem:'MANUAL'|'PAGAMENTO'; payment_record_type:'COMPRA'|'ITEM_ORFAO'|null; origem_id:number
  data:string; descricao:string; detalhes:string|null; quantidade:string|null; unidade:string|null; fornecedor:string|null
  payment_status:string|null; data_agendamento:string|null; data_entrega:string|null; forma_pagamento:string|null
  chave_pix:string|null; contato_fornecedor:string|null; nome_contato_fornecedor:string|null; payment_etapa:string|null
  payment_observacao:string|null; valor:string; editavel:boolean; provisionado:boolean
}
type CashFlowTotals = { total:number; total_entrada:string; total_saida:string; saldo_atual:string; saldo_com_provisao:string }

/** Shared source for the Cash Flow CRUD and both export formats. */
export async function getCashFlowData(projectId:number, filters:CashFlowFilters, pagination?:{page:number;pageSize:number}) {
  const params=[projectId,SETTLED_PAYMENT_STATUSES,`%${filters.search}%`,filters.start,filters.end,filters.includeFuture]
  const limit=pagination ? ` LIMIT $7 OFFSET $8` : ''
  const itemParams=pagination?[...params,pagination.pageSize,(pagination.page-1)*pagination.pageSize]:params
  const [items,totals]=await Promise.all([
    query<CashFlowItem>(`${cashFlowCte} SELECT id,origem,payment_record_type,origem_id,data,descricao,detalhes,quantidade,unidade,fornecedor,payment_status,data_agendamento,data_entrega,forma_pagamento,chave_pix,contato_fornecedor,nome_contato_fornecedor,payment_etapa,payment_observacao,valor,editavel,(data>CURRENT_DATE) AS provisionado FROM fluxo ${cashFlowFilter} ORDER BY data DESC,origem_id DESC${limit}`,itemParams),
    query<CashFlowTotals>(`${cashFlowCte} SELECT COUNT(*)::int AS total, COALESCE(SUM(valor) FILTER (WHERE valor>0),0)::numeric(15,2) AS total_entrada, COALESCE(ABS(SUM(valor) FILTER (WHERE valor<0)),0)::numeric(15,2) AS total_saida, COALESCE(SUM(valor) FILTER (WHERE data<=CURRENT_DATE),0)::numeric(15,2) AS saldo_atual, COALESCE(SUM(valor),0)::numeric(15,2) AS saldo_com_provisao FROM fluxo ${cashFlowFilter}`,params),
  ])
  return { itens:items.rows, total:totals.rows[0]!.total, indicadores:totals.rows[0]! }
}
