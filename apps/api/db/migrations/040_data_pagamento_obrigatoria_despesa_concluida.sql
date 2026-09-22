ALTER TABLE despesas DROP CONSTRAINT ck_despesas_pago_data;

ALTER TABLE despesas
  ADD CONSTRAINT ck_despesas_pago_data
  CHECK (status NOT IN ('PAGO_AGUARDANDO_ENTREGA', 'CONCLUIDO') OR data_pagamento IS NOT NULL) NOT VALID;
