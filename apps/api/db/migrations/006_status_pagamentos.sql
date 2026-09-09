ALTER TABLE pagamentos DROP CONSTRAINT IF EXISTS ck_pagamentos_status;

UPDATE pagamentos SET status = 'PENDENTE' WHERE status = 'PARADO';

ALTER TABLE pagamentos
  ADD CONSTRAINT ck_pagamentos_status
  CHECK (status IN ('FINALIZADO','PAGO','EM_NEGOCIACAO','PENDENTE'));

