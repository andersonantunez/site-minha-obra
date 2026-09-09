ALTER TABLE pagamentos
  ADD COLUMN quantidade NUMERIC(15,3),
  ADD COLUMN unidade VARCHAR(40),
  ADD COLUMN chave_pix VARCHAR(255),
  ADD COLUMN valor NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN status VARCHAR(25) NOT NULL DEFAULT 'EM_NEGOCIACAO',
  ADD COLUMN forma_pagamento VARCHAR(25),
  ADD COLUMN data_pagamento DATE,
  ADD COLUMN data_agendamento DATE,
  ADD COLUMN data_entrega DATE;

ALTER TABLE pagamentos
  ADD CONSTRAINT ck_pagamentos_quantidade CHECK (quantidade IS NULL OR quantidade >= 0),
  ADD CONSTRAINT ck_pagamentos_valor CHECK (valor >= 0),
  ADD CONSTRAINT ck_pagamentos_status CHECK (status IN ('PAGO','EM_NEGOCIACAO','PARADO')),
  ADD CONSTRAINT ck_pagamentos_forma CHECK (forma_pagamento IS NULL OR forma_pagamento IN ('PIX','CARTAO','DINHEIRO','BOLETO','TRANSFERENCIA','OUTRO'));

ALTER TABLE itens_pagamento
  ADD COLUMN quantidade NUMERIC(15,3),
  ADD COLUMN unidade VARCHAR(40);

UPDATE pagamentos p SET
  valor = legado.valor,
  status = legado.status,
  forma_pagamento = legado.forma_pagamento,
  data_pagamento = legado.data_pagamento
FROM (
  SELECT pagamento_id,
    COALESCE(SUM(valor),0)::numeric(15,2) AS valor,
    CASE WHEN BOOL_AND(status='PAGO') THEN 'PAGO'
         WHEN BOOL_OR(status='PARADO') THEN 'PARADO'
         ELSE 'EM_NEGOCIACAO' END AS status,
    MAX(forma_pagamento) FILTER (WHERE forma_pagamento IS NOT NULL) AS forma_pagamento,
    MAX(data_pagamento) FILTER (WHERE data_pagamento IS NOT NULL) AS data_pagamento
  FROM itens_pagamento WHERE excluido_em IS NULL GROUP BY pagamento_id
) legado WHERE legado.pagamento_id=p.id;

CREATE TABLE links_cotacao_pagamento (
  id BIGSERIAL PRIMARY KEY,
  pagamento_id BIGINT NOT NULL REFERENCES pagamentos(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  criado_por BIGINT NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_links_cotacao_pagamento_url UNIQUE (pagamento_id,url),
  CONSTRAINT ck_links_cotacao_url_http CHECK (url ~* '^https?://')
);

CREATE INDEX idx_links_cotacao_pagamento ON links_cotacao_pagamento (pagamento_id);

INSERT INTO links_cotacao_pagamento (pagamento_id,url,criado_por,criado_em)
SELECT DISTINCT ip.pagamento_id,lp.url,lp.criado_por,lp.criado_em
FROM links_produtos_item_pagamento lp
JOIN itens_pagamento ip ON ip.id=lp.item_pagamento_id
ON CONFLICT (pagamento_id,url) DO NOTHING;
