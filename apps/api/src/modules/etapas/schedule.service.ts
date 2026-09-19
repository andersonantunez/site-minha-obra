import { query } from '../../config/database.js'
import { paymentFinancialCte } from '../pagamentos/purchase-financial.query.js'
import { SETTLED_PAYMENT_STATUSES } from '../pagamentos/payment-status.js'
import { activeScheduleStageWhere, activeScheduleStageOrder } from './stage-query.js'
export type ScheduleRow = { id:number;parent_id:number|null;nome:string;descricao:string|null;cor:string;etapa_pai:string|null; ordem: number; etapa: string; tipo: string; data_inicio_previsto: string | null; data_fim_previsto: string | null; valor_previsto: string; data_inicio: string | null; data_fim: string | null; valor_pago: string }

export async function getSchedule(projectId:number) {
  const result = await query<ScheduleRow>(`WITH ${paymentFinancialCte} SELECT c.id,c.parent_id,c.nome,c.descricao,c.cor,pai.nome AS etapa_pai,c.ordem,
      CASE WHEN pai.id IS NULL THEN 'ETAPA '||c.ordem||' - '||c.nome ELSE 'ETAPA '||pai.ordem||' - '||pai.nome||' / '||c.nome END AS etapa,
      CASE WHEN pai.id IS NULL THEN 'Etapa' ELSE 'Subitem' END AS tipo,
      c.data_inicio_previsto,c.data_fim_previsto,c.data_inicio,c.data_fim,
      (CASE WHEN c.parent_id IS NULL AND EXISTS(SELECT 1 FROM cronogramas f WHERE f.parent_id=c.id AND f.excluido_em IS NULL)
        THEN COALESCE((SELECT SUM(f.valor_previsto) FROM cronogramas f WHERE f.parent_id=c.id AND f.excluido_em IS NULL),0) ELSE c.valor_previsto END)::numeric(15,2) AS valor_previsto,
      COALESCE((SELECT SUM(p.valor) FROM pagamentos_financeiros p WHERE p.projeto_id=c.projeto_id AND p.status=ANY($2::varchar[])
        AND (p.etapa_id=c.id OR (c.parent_id IS NULL AND p.etapa_id IN (SELECT f.id FROM cronogramas f WHERE f.parent_id=c.id AND f.excluido_em IS NULL)))),0)::numeric(15,2) AS valor_pago
      FROM cronogramas c LEFT JOIN cronogramas pai ON pai.id=c.parent_id
      WHERE c.projeto_id=$1 AND ${activeScheduleStageWhere('c')}
      ORDER BY ${activeScheduleStageOrder('c')}`,[projectId,SETTLED_PAYMENT_STATUSES])
  const rows=result.rows
  const arvore=rows.filter(row=>row.parent_id===null).map(parent=>({...parent,subitens:rows.filter(row=>Number(row.parent_id)===Number(parent.id))}))
  return {etapas:rows,arvore,total:arvore.length,totalRegistros:rows.length}
}
