ALTER TABLE despesas
  ADD COLUMN incluir_itens BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN valor_total_manual NUMERIC(15,2);

ALTER TABLE despesas
  ADD CONSTRAINT ck_despesas_valor_manual_sem_itens
  CHECK (incluir_itens OR (valor_total_manual IS NOT NULL AND valor_total_manual > 0));

COMMENT ON COLUMN despesas.incluir_itens IS 'Define se o valor total e composto pelos itens da despesa.';
COMMENT ON COLUMN despesas.valor_total_manual IS 'Valor informado diretamente quando a despesa nao possui itens.';
