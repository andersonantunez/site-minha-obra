CREATE TABLE pagamentos (
  id BIGSERIAL PRIMARY KEY,
  projeto_id BIGINT NOT NULL REFERENCES projetos(id),
  etapa_id BIGINT REFERENCES etapas(id),
  descricao VARCHAR(240) NOT NULL,
  fornecedor VARCHAR(180),
  observacao TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  criado_por BIGINT NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em TIMESTAMPTZ
);

CREATE INDEX idx_pagamentos_projeto ON pagamentos (projeto_id, ordem, id) WHERE excluido_em IS NULL;
CREATE INDEX idx_pagamentos_etapa ON pagamentos (etapa_id) WHERE excluido_em IS NULL;

CREATE TABLE itens_pagamento (
  id BIGSERIAL PRIMARY KEY,
  pagamento_id BIGINT NOT NULL REFERENCES pagamentos(id),
  descricao VARCHAR(240) NOT NULL,
  valor NUMERIC(15,2) NOT NULL,
  status VARCHAR(25) NOT NULL DEFAULT 'EM_NEGOCIACAO',
  forma_pagamento VARCHAR(25),
  data_pagamento DATE,
  ordem INTEGER NOT NULL DEFAULT 0,
  criado_por BIGINT NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em TIMESTAMPTZ,
  CONSTRAINT ck_itens_pagamento_valor CHECK (valor >= 0),
  CONSTRAINT ck_itens_pagamento_status CHECK (status IN ('PAGO','EM_NEGOCIACAO','PARADO')),
  CONSTRAINT ck_itens_pagamento_forma CHECK (forma_pagamento IS NULL OR forma_pagamento IN ('PIX','CARTAO','DINHEIRO')),
  CONSTRAINT ck_itens_pagamento_pago_data CHECK (status <> 'PAGO' OR data_pagamento IS NOT NULL)
);

CREATE INDEX idx_itens_pagamento_pagamento ON itens_pagamento (pagamento_id, ordem, id) WHERE excluido_em IS NULL;
CREATE INDEX idx_itens_pagamento_status ON itens_pagamento (status, data_pagamento) WHERE excluido_em IS NULL;

CREATE TABLE links_produtos_item_pagamento (
  id BIGSERIAL PRIMARY KEY,
  item_pagamento_id BIGINT NOT NULL REFERENCES itens_pagamento(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  criado_por BIGINT NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_links_produto_item_url UNIQUE (item_pagamento_id, url),
  CONSTRAINT ck_links_produto_url_http CHECK (url ~* '^https?://')
);

CREATE INDEX idx_links_produtos_item ON links_produtos_item_pagamento (item_pagamento_id);

CREATE TABLE documentos_pagamento (
  id BIGSERIAL PRIMARY KEY,
  pagamento_id BIGINT REFERENCES pagamentos(id),
  item_pagamento_id BIGINT REFERENCES itens_pagamento(id),
  titulo VARCHAR(180) NOT NULL,
  categoria VARCHAR(40) NOT NULL DEFAULT 'OUTROS',
  tipo_origem VARCHAR(20) NOT NULL,
  url TEXT,
  caminho_arquivo TEXT,
  nome_original VARCHAR(255),
  tipo_mime VARCHAR(100),
  criado_por BIGINT NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em TIMESTAMPTZ,
  CONSTRAINT ck_documentos_pagamento_alvo CHECK ((pagamento_id IS NOT NULL)::INTEGER + (item_pagamento_id IS NOT NULL)::INTEGER = 1),
  CONSTRAINT ck_documentos_pagamento_origem CHECK (tipo_origem IN ('ARQUIVO','LINK')),
  CONSTRAINT ck_documentos_pagamento_fonte CHECK (
    (tipo_origem = 'LINK' AND url IS NOT NULL AND caminho_arquivo IS NULL) OR
    (tipo_origem = 'ARQUIVO' AND caminho_arquivo IS NOT NULL)
  )
);

CREATE INDEX idx_documentos_pagamento_pai ON documentos_pagamento (pagamento_id) WHERE excluido_em IS NULL;
CREATE INDEX idx_documentos_pagamento_item ON documentos_pagamento (item_pagamento_id) WHERE excluido_em IS NULL;

CREATE TABLE registros_auditoria (
  id BIGSERIAL PRIMARY KEY,
  projeto_id BIGINT REFERENCES projetos(id),
  usuario_id BIGINT REFERENCES usuarios(id),
  acao VARCHAR(60) NOT NULL,
  entidade VARCHAR(80) NOT NULL,
  registro_id BIGINT,
  dados_anteriores JSONB,
  dados_novos JSONB,
  endereco_ip INET,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_auditoria_projeto_data ON registros_auditoria (projeto_id, criado_em DESC);
CREATE INDEX idx_auditoria_usuario_data ON registros_auditoria (usuario_id, criado_em DESC);
CREATE INDEX idx_auditoria_entidade_registro ON registros_auditoria (entidade, registro_id);

CREATE TABLE configuracoes_sistema (
  id BIGSERIAL PRIMARY KEY,
  chave VARCHAR(100) NOT NULL UNIQUE,
  valor TEXT,
  descricao VARCHAR(300) NOT NULL,
  atualizado_por BIGINT REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER tg_pagamentos_atualizado BEFORE UPDATE ON pagamentos FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();
CREATE TRIGGER tg_itens_pagamento_atualizado BEFORE UPDATE ON itens_pagamento FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();
CREATE TRIGGER tg_links_produtos_atualizado BEFORE UPDATE ON links_produtos_item_pagamento FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();
CREATE TRIGGER tg_documentos_pagamento_atualizado BEFORE UPDATE ON documentos_pagamento FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();
CREATE TRIGGER tg_configuracoes_sistema_atualizado BEFORE UPDATE ON configuracoes_sistema FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();
