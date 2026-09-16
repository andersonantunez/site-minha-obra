CREATE TABLE compras (
  id BIGSERIAL PRIMARY KEY,
  projeto_id BIGINT NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  etapa_id BIGINT REFERENCES cronogramas(id),
  descricao VARCHAR(240) NOT NULL,
  status VARCHAR(35) NOT NULL DEFAULT 'PENDENTE',
  data_pagamento DATE,
  forma_pagamento VARCHAR(25),
  fornecedor VARCHAR(180),
  nome_contato_fornecedor VARCHAR(180),
  contato_fornecedor VARCHAR(30),
  numero_nota_fiscal VARCHAR(100),
  data_emissao DATE,
  data_agendamento DATE,
  data_entrega DATE,
  ordem INTEGER NOT NULL DEFAULT 0,
  criado_por BIGINT NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em TIMESTAMPTZ,
  CONSTRAINT ck_compras_descricao CHECK (length(trim(descricao)) >= 2),
  CONSTRAINT ck_compras_status CHECK (status IN ('PENDENTE','EM_NEGOCIACAO','PAGO_AGUARDANDO_ENTREGA','CONCLUIDO')),
  CONSTRAINT ck_compras_forma CHECK (forma_pagamento IS NULL OR forma_pagamento IN ('PIX','CARTAO','DINHEIRO','BOLETO','TRANSFERENCIA','OUTRO')),
  CONSTRAINT ck_compras_pago_data CHECK (status <> 'PAGO_AGUARDANDO_ENTREGA' OR data_pagamento IS NOT NULL)
);

CREATE INDEX idx_compras_projeto ON compras (projeto_id, ordem, id) WHERE excluido_em IS NULL;
CREATE INDEX idx_compras_etapa ON compras (etapa_id) WHERE excluido_em IS NULL;
CREATE INDEX idx_compras_status ON compras (projeto_id, status) WHERE excluido_em IS NULL;
CREATE TRIGGER tg_compras_atualizado BEFORE UPDATE ON compras
  FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();

ALTER TABLE pagamentos
  ADD COLUMN compra_id BIGINT REFERENCES compras(id),
  ADD COLUMN valor_unitario NUMERIC(15,2);

ALTER TABLE pagamentos
  ADD CONSTRAINT ck_pagamentos_valor_unitario CHECK (valor_unitario IS NULL OR valor_unitario >= 0);

-- Os registros atuais permanecem órfãos. Apenas o valor unitário é inferido sem
-- alterar o total legado, IDs, links ou documentos existentes.
UPDATE pagamentos
SET valor_unitario = CASE
  WHEN valor IS NULL THEN NULL
  WHEN quantidade IS NOT NULL AND quantidade > 0 THEN ROUND(valor / quantidade, 2)
  ELSE valor
END
WHERE valor_unitario IS NULL;

CREATE INDEX idx_pagamentos_compra ON pagamentos (compra_id, ordem, id)
  WHERE excluido_em IS NULL;
CREATE INDEX idx_pagamentos_orfaos ON pagamentos (projeto_id, id)
  WHERE compra_id IS NULL AND excluido_em IS NULL;

ALTER TABLE documentos_projeto ADD COLUMN compra_id BIGINT REFERENCES compras(id);
ALTER TABLE documentos_projeto ADD CONSTRAINT ck_documentos_compra_ou_item
  CHECK (NOT (compra_id IS NOT NULL AND pagamento_id IS NOT NULL));
CREATE INDEX idx_documentos_projeto_compra ON documentos_projeto (compra_id)
  WHERE excluido_em IS NULL;

COMMENT ON TABLE compras IS 'Registro pai da estrutura Compra -> Itens da Compra.';
COMMENT ON COLUMN compras.numero_nota_fiscal IS 'Quando preenchido, o documento da compra é Nota Fiscal; vazio representa Orçamento.';
COMMENT ON COLUMN pagamentos.compra_id IS 'Compra pai; nulo identifica item legado ainda não organizado.';
COMMENT ON COLUMN pagamentos.valor_unitario IS 'Valor unitário do item. O total é calculado por quantidade x valor unitário.';
COMMENT ON COLUMN documentos_projeto.compra_id IS 'Documento da Compra. pagamento_id permanece temporariamente para documentos legados dos itens.';
