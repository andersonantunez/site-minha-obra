-- Os campos de período já existem em projetos desde a migration inicial.
-- Esta migration documenta e reforça a validação sem substituir dados existentes.
ALTER TABLE projetos DROP CONSTRAINT IF EXISTS ck_projetos_periodo;
ALTER TABLE projetos
  ADD CONSTRAINT ck_projetos_periodo
  CHECK (previsao_termino IS NULL OR data_inicio IS NULL OR previsao_termino >= data_inicio);

ALTER TABLE pagamentos DROP CONSTRAINT IF EXISTS ck_pagamentos_status;
ALTER TABLE pagamentos ALTER COLUMN status DROP DEFAULT;

UPDATE pagamentos
SET status = CASE status
  WHEN 'FINALIZADO' THEN 'CONCLUIDO'
  WHEN 'PAGO' THEN 'PAGO_AGUARDANDO_ENTREGA'
  WHEN 'PARADO' THEN 'PENDENTE'
  ELSE status
END;

ALTER TABLE pagamentos ALTER COLUMN status SET DEFAULT 'PENDENTE';
ALTER TABLE pagamentos
  ADD CONSTRAINT ck_pagamentos_status
  CHECK (status IN ('PENDENTE','EM_NEGOCIACAO','PAGO_AGUARDANDO_ENTREGA','CONCLUIDO'));

-- A tabela de itens é legada, mas continua preservada para histórico.
ALTER TABLE itens_pagamento DROP CONSTRAINT IF EXISTS ck_itens_pagamento_status;
ALTER TABLE itens_pagamento DROP CONSTRAINT IF EXISTS ck_itens_pagamento_pago_data;
ALTER TABLE itens_pagamento ALTER COLUMN status DROP DEFAULT;

UPDATE itens_pagamento
SET status = CASE status
  WHEN 'FINALIZADO' THEN 'CONCLUIDO'
  WHEN 'PAGO' THEN 'PAGO_AGUARDANDO_ENTREGA'
  WHEN 'PARADO' THEN 'PENDENTE'
  ELSE status
END;

ALTER TABLE itens_pagamento ALTER COLUMN status SET DEFAULT 'PENDENTE';
ALTER TABLE itens_pagamento
  ADD CONSTRAINT ck_itens_pagamento_status
  CHECK (status IN ('PENDENTE','EM_NEGOCIACAO','PAGO_AGUARDANDO_ENTREGA','CONCLUIDO')),
  ADD CONSTRAINT ck_itens_pagamento_pago_data
  CHECK (status <> 'PAGO_AGUARDANDO_ENTREGA' OR data_pagamento IS NOT NULL);
