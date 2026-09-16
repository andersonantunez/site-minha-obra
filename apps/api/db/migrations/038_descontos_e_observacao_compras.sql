-- Descontos de compra e de item permanecem independentes. Valores nulos
-- preservam integralmente o comportamento dos registros existentes.
ALTER TABLE compras
  ADD COLUMN IF NOT EXISTS observacao TEXT,
  ADD COLUMN IF NOT EXISTS valor_desconto NUMERIC(15,2);

ALTER TABLE pagamentos
  ADD COLUMN IF NOT EXISTS valor_desconto NUMERIC(15,2);

ALTER TABLE compras
  ADD CONSTRAINT ck_compras_valor_desconto
  CHECK (valor_desconto IS NULL OR valor_desconto >= 0);

ALTER TABLE pagamentos
  ADD CONSTRAINT ck_pagamentos_valor_desconto
  CHECK (valor_desconto IS NULL OR valor_desconto >= 0);

COMMENT ON COLUMN compras.valor_desconto IS 'Desconto global da compra, independente dos descontos dos itens.';
COMMENT ON COLUMN pagamentos.valor_desconto IS 'Desconto individual do item de compra.';
