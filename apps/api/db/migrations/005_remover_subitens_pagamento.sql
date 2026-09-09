UPDATE pagamentos p
SET observacao = CONCAT_WS(E'\n\n', NULLIF(TRIM(p.observacao), ''), legado.detalhes)
FROM (
  SELECT pagamento_id,
    'Detalhamento migrado:' || E'\n' || STRING_AGG(
      '- ' || descricao ||
      CASE WHEN quantidade IS NOT NULL THEN ' | ' || quantidade::text || COALESCE(' ' || unidade, '') ELSE '' END ||
      CASE WHEN valor > 0 THEN ' | R$ ' || REPLACE(TO_CHAR(valor, 'FM999G999G999G990D00'), '.', ',') ELSE '' END,
      E'\n' ORDER BY ordem,id
    ) AS detalhes
  FROM itens_pagamento
  WHERE excluido_em IS NULL
  GROUP BY pagamento_id
) legado
WHERE legado.pagamento_id=p.id;

COMMENT ON TABLE itens_pagamento IS 'Estrutura legada preservada apenas para histórico; novos pagamentos usam observacao no registro principal.';
