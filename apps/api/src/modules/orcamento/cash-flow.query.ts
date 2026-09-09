export const cashFlowCte = `WITH fluxo AS (
  SELECT 'MANUAL'::text AS origem,io.id AS origem_id,('manual-'||io.id)::text AS id,
    io.competencia AS data,io.descricao,io.observacao AS detalhes,
    NULL::numeric AS quantidade,NULL::varchar AS unidade,io.valor::numeric(15,2) AS valor,TRUE AS editavel
  FROM itens_orcamento io
  WHERE io.projeto_id=$1 AND io.excluido_em IS NULL
  UNION ALL
  SELECT 'PAGAMENTO'::text AS origem,p.id AS origem_id,('pagamento-'||p.id)::text AS id,
    COALESCE(p.data_pagamento,p.data_agendamento,p.criado_em::date) AS data,p.descricao,
    CONCAT_WS(E'\n',
      CASE WHEN pai.id IS NOT NULL THEN 'Etapa: ETAPA '||pai.ordem||' - '||pai.nome ELSE CASE WHEN e.id IS NOT NULL THEN 'Etapa: ETAPA '||e.ordem||' - '||e.nome END END,
      CASE WHEN pai.id IS NOT NULL THEN 'Subitem: '||e.nome END,
      CASE WHEN p.fornecedor IS NOT NULL THEN 'Fornecedor: '||p.fornecedor END,
      CASE WHEN p.observacao IS NOT NULL THEN 'Observações: '||p.observacao END
    ) AS detalhes,p.quantidade,p.unidade,(-ABS(p.valor))::numeric(15,2) AS valor,FALSE AS editavel
  FROM pagamentos p
  LEFT JOIN cronogramas e ON e.id=p.etapa_id
  LEFT JOIN cronogramas pai ON pai.id=e.parent_id
  WHERE p.projeto_id=$1 AND p.excluido_em IS NULL AND p.status=ANY($2::varchar[])
)`

export const cashFlowFilter = `WHERE ($3='%%' OR descricao ILIKE $3 OR detalhes ILIKE $3)
  AND ($4::date IS NULL OR data >= $4::date) AND ($5::date IS NULL OR data <= $5::date)
  AND ($6::boolean OR data <= CURRENT_DATE)`
