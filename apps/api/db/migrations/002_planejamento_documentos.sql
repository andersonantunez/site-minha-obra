CREATE TABLE renders_projeto (
  id BIGSERIAL PRIMARY KEY,
  projeto_id BIGINT NOT NULL REFERENCES projetos(id),
  titulo VARCHAR(180) NOT NULL,
  descricao TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  tipo_origem VARCHAR(20) NOT NULL,
  url TEXT,
  caminho_arquivo TEXT,
  nome_original VARCHAR(255),
  tipo_mime VARCHAR(100),
  principal BOOLEAN NOT NULL DEFAULT FALSE,
  criado_por BIGINT NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em TIMESTAMPTZ,
  CONSTRAINT ck_renders_origem CHECK (tipo_origem IN ('ARQUIVO','LINK')),
  CONSTRAINT ck_renders_fonte CHECK (
    (tipo_origem = 'LINK' AND url IS NOT NULL AND caminho_arquivo IS NULL) OR
    (tipo_origem = 'ARQUIVO' AND caminho_arquivo IS NOT NULL)
  )
);

CREATE UNIQUE INDEX uq_render_principal_projeto ON renders_projeto (projeto_id) WHERE principal AND excluido_em IS NULL;
CREATE INDEX idx_renders_projeto ON renders_projeto (projeto_id, ordem, id) WHERE excluido_em IS NULL;

CREATE TABLE plantas_projeto (
  id BIGSERIAL PRIMARY KEY,
  projeto_id BIGINT NOT NULL REFERENCES projetos(id),
  nome VARCHAR(180) NOT NULL,
  categoria VARCHAR(30) NOT NULL,
  descricao TEXT,
  versao VARCHAR(40),
  data_documento DATE,
  ordem INTEGER NOT NULL DEFAULT 0,
  tipo_origem VARCHAR(20) NOT NULL,
  url TEXT,
  caminho_arquivo TEXT,
  nome_original VARCHAR(255),
  tipo_mime VARCHAR(100),
  criado_por BIGINT NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em TIMESTAMPTZ,
  CONSTRAINT ck_plantas_categoria CHECK (categoria IN ('ARQUITETONICO','ESTRUTURAL','ELETRICO','HIDRAULICO','CLIMATIZACAO','PAISAGISMO','INTERIORES','OUTROS')),
  CONSTRAINT ck_plantas_origem CHECK (tipo_origem IN ('ARQUIVO','LINK')),
  CONSTRAINT ck_plantas_fonte CHECK (
    (tipo_origem = 'LINK' AND url IS NOT NULL AND caminho_arquivo IS NULL) OR
    (tipo_origem = 'ARQUIVO' AND caminho_arquivo IS NOT NULL)
  )
);

CREATE INDEX idx_plantas_projeto ON plantas_projeto (projeto_id, categoria, ordem) WHERE excluido_em IS NULL;

CREATE TABLE documentos_projeto (
  id BIGSERIAL PRIMARY KEY,
  projeto_id BIGINT NOT NULL REFERENCES projetos(id),
  titulo VARCHAR(180) NOT NULL,
  categoria VARCHAR(60) NOT NULL DEFAULT 'OUTROS',
  descricao TEXT,
  tipo_origem VARCHAR(20) NOT NULL,
  url TEXT,
  caminho_arquivo TEXT,
  nome_original VARCHAR(255),
  tipo_mime VARCHAR(100),
  criado_por BIGINT NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em TIMESTAMPTZ,
  CONSTRAINT ck_documentos_projeto_origem CHECK (tipo_origem IN ('ARQUIVO','LINK')),
  CONSTRAINT ck_documentos_projeto_fonte CHECK (
    (tipo_origem = 'LINK' AND url IS NOT NULL AND caminho_arquivo IS NULL) OR
    (tipo_origem = 'ARQUIVO' AND caminho_arquivo IS NOT NULL)
  )
);

CREATE INDEX idx_documentos_projeto ON documentos_projeto (projeto_id, categoria, criado_em DESC) WHERE excluido_em IS NULL;

CREATE TABLE etapas (
  id BIGSERIAL PRIMARY KEY,
  projeto_id BIGINT NOT NULL REFERENCES projetos(id),
  nome VARCHAR(180) NOT NULL,
  descricao TEXT,
  data_inicio DATE,
  data_fim DATE,
  valor_previsto NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_executado NUMERIC(15,2) NOT NULL DEFAULT 0,
  ordem INTEGER NOT NULL DEFAULT 0,
  criado_por BIGINT NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em TIMESTAMPTZ,
  CONSTRAINT ck_etapas_periodo CHECK (data_fim IS NULL OR data_inicio IS NULL OR data_fim >= data_inicio),
  CONSTRAINT ck_etapas_valores CHECK (valor_previsto >= 0 AND valor_executado >= 0)
);

CREATE INDEX idx_etapas_projeto ON etapas (projeto_id, ordem, id) WHERE excluido_em IS NULL;

CREATE TABLE itens_orcamento (
  id BIGSERIAL PRIMARY KEY,
  projeto_id BIGINT NOT NULL REFERENCES projetos(id),
  etapa_id BIGINT REFERENCES etapas(id),
  competencia DATE NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  descricao VARCHAR(240) NOT NULL,
  observacao TEXT,
  valor NUMERIC(15,2) NOT NULL,
  criado_por BIGINT NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em TIMESTAMPTZ,
  CONSTRAINT ck_orcamento_competencia CHECK (EXTRACT(DAY FROM competencia) = 1),
  CONSTRAINT ck_orcamento_valor CHECK (valor >= 0)
);

CREATE INDEX idx_orcamento_projeto_competencia ON itens_orcamento (projeto_id, competencia) WHERE excluido_em IS NULL;
CREATE INDEX idx_orcamento_etapa ON itens_orcamento (etapa_id) WHERE excluido_em IS NULL;

CREATE TABLE importacoes (
  id BIGSERIAL PRIMARY KEY,
  projeto_id BIGINT NOT NULL REFERENCES projetos(id),
  entidade VARCHAR(40) NOT NULL,
  formato VARCHAR(10) NOT NULL,
  modo VARCHAR(15) NOT NULL,
  nome_arquivo VARCHAR(255),
  hash_arquivo CHAR(64),
  quantidade_linhas INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL,
  erros JSONB,
  criado_por BIGINT NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  concluido_em TIMESTAMPTZ,
  CONSTRAINT ck_importacoes_entidade CHECK (entidade IN ('ETAPAS','ORCAMENTO')),
  CONSTRAINT ck_importacoes_formato CHECK (formato IN ('TSV','JSON')),
  CONSTRAINT ck_importacoes_modo CHECK (modo IN ('ACRESCENTAR','SUBSTITUIR')),
  CONSTRAINT ck_importacoes_status CHECK (status IN ('PROCESSANDO','CONCLUIDA','FALHOU')),
  CONSTRAINT ck_importacoes_quantidade CHECK (quantidade_linhas >= 0)
);

CREATE INDEX idx_importacoes_projeto ON importacoes (projeto_id, criado_em DESC);

CREATE TRIGGER tg_renders_atualizado BEFORE UPDATE ON renders_projeto FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();
CREATE TRIGGER tg_plantas_atualizado BEFORE UPDATE ON plantas_projeto FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();
CREATE TRIGGER tg_documentos_projeto_atualizado BEFORE UPDATE ON documentos_projeto FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();
CREATE TRIGGER tg_etapas_atualizado BEFORE UPDATE ON etapas FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();
CREATE TRIGGER tg_orcamento_atualizado BEFORE UPDATE ON itens_orcamento FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();
