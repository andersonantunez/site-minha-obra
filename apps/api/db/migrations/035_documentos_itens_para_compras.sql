-- Os documentos legados passam a pertencer exclusivamente a Compra pai do item.
-- O mesmo registro e arquivo sao preservados; apenas o vinculo e atualizado.
UPDATE documentos_projeto d
SET compra_id = p.compra_id,
    pagamento_id = NULL
FROM pagamentos p
WHERE d.pagamento_id = p.id
  AND d.compra_id IS NULL
  AND p.compra_id IS NOT NULL
  AND d.excluido_em IS NULL;

UPDATE pagamentos
SET documentos_legados_habilitados = FALSE
WHERE documentos_legados_habilitados;

COMMENT ON COLUMN pagamentos.documentos_legados_habilitados IS
  'Campo historico da transicao. Documentos ativos pertencem exclusivamente a compras.';
