-- A estrutura pai foi renomeada sem recriar dados. IDs, chaves estrangeiras,
-- índices e o histórico são preservados pelo ALTER TABLE do PostgreSQL.
ALTER TABLE compras RENAME TO despesas;

ALTER INDEX idx_compras_projeto RENAME TO idx_despesas_projeto;
ALTER INDEX idx_compras_etapa RENAME TO idx_despesas_etapa;
ALTER INDEX idx_compras_status RENAME TO idx_despesas_status;
ALTER INDEX idx_pagamentos_compra RENAME TO idx_pagamentos_despesa;

ALTER TABLE despesas RENAME CONSTRAINT ck_compras_descricao TO ck_despesas_descricao;
ALTER TABLE despesas RENAME CONSTRAINT ck_compras_status TO ck_despesas_status;
ALTER TABLE despesas RENAME CONSTRAINT ck_compras_forma TO ck_despesas_forma;
ALTER TABLE despesas RENAME CONSTRAINT ck_compras_pago_data TO ck_despesas_pago_data;
ALTER TABLE despesas RENAME CONSTRAINT ck_compras_valor_desconto TO ck_despesas_valor_desconto;
ALTER TRIGGER tg_compras_atualizado ON despesas RENAME TO tg_despesas_atualizado;

COMMENT ON TABLE despesas IS 'Registro pai da estrutura Despesa -> Itens de despesa.';

-- Compatibilidade transitória para consultas legadas fora do módulo Despesas.
-- É uma view atualizável, não uma segunda tabela nem cópia de dados.
CREATE VIEW compras AS SELECT * FROM despesas;
