CREATE OR REPLACE FUNCTION definir_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE planos (
  id BIGSERIAL PRIMARY KEY,
  codigo VARCHAR(30) NOT NULL UNIQUE,
  nome VARCHAR(80) NOT NULL,
  limite_projetos_proprios INTEGER,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_planos_limite CHECK (limite_projetos_proprios IS NULL OR limite_projetos_proprios >= 0)
);

INSERT INTO planos (codigo, nome, limite_projetos_proprios) VALUES
  ('FREE', 'Free', 1),
  ('PRO', 'Pro', NULL),
  ('BUSINESS', 'Business', NULL);

CREATE TABLE usuarios (
  id BIGSERIAL PRIMARY KEY,
  plano_id BIGINT NOT NULL REFERENCES planos(id),
  google_sub VARCHAR(255) UNIQUE,
  nome VARCHAR(160) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  foto_url TEXT,
  administrador_sistema BOOLEAN NOT NULL DEFAULT FALSE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_acesso_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_usuarios_email_normalizado ON usuarios (LOWER(email));
CREATE INDEX idx_usuarios_plano_id ON usuarios (plano_id);

CREATE TABLE projetos (
  id BIGSERIAL PRIMARY KEY,
  proprietario_usuario_id BIGINT NOT NULL REFERENCES usuarios(id),
  nome VARCHAR(160) NOT NULL,
  descricao TEXT NOT NULL,
  endereco VARCHAR(300),
  cidade VARCHAR(120),
  estado CHAR(2),
  data_inicio DATE,
  previsao_termino DATE,
  area_construida NUMERIC(12,2),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em TIMESTAMPTZ,
  CONSTRAINT ck_projetos_periodo CHECK (previsao_termino IS NULL OR data_inicio IS NULL OR previsao_termino >= data_inicio),
  CONSTRAINT ck_projetos_area CHECK (area_construida IS NULL OR area_construida > 0),
  CONSTRAINT ck_projetos_estado CHECK (estado IS NULL OR estado ~ '^[A-Z]{2}$')
);

CREATE INDEX idx_projetos_proprietario_ativos ON projetos (proprietario_usuario_id) WHERE excluido_em IS NULL;

CREATE TABLE papeis (
  id BIGSERIAL PRIMARY KEY,
  codigo VARCHAR(60) NOT NULL UNIQUE,
  nome VARCHAR(100) NOT NULL,
  descricao VARCHAR(300),
  protegido BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO papeis (codigo, nome, descricao, protegido) VALUES
  ('PROPRIETARIO', 'Proprietário', 'Responsável pelo projeto e por sua administração.', TRUE),
  ('ENGENHEIRO', 'Engenheiro', 'Profissional com acesso operacional à obra.', TRUE),
  ('LEITOR', 'Somente leitura', 'Pode consultar informações autorizadas.', TRUE);

CREATE TABLE permissoes (
  id BIGSERIAL PRIMARY KEY,
  chave VARCHAR(120) NOT NULL UNIQUE,
  modulo VARCHAR(60) NOT NULL,
  acao VARCHAR(40) NOT NULL,
  descricao VARCHAR(240) NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_permissoes_modulo_acao UNIQUE (modulo, acao)
);

INSERT INTO permissoes (chave, modulo, acao, descricao) VALUES
  ('projeto.visualizar', 'projeto', 'visualizar', 'Visualizar o projeto'),
  ('projeto.atualizar', 'projeto', 'atualizar', 'Alterar dados do projeto'),
  ('etapas.visualizar', 'etapas', 'visualizar', 'Visualizar etapas'),
  ('etapas.inserir', 'etapas', 'inserir', 'Cadastrar etapas'),
  ('etapas.atualizar', 'etapas', 'atualizar', 'Alterar etapas'),
  ('etapas.excluir', 'etapas', 'excluir', 'Excluir etapas'),
  ('orcamento.visualizar', 'orcamento', 'visualizar', 'Visualizar orçamento'),
  ('orcamento.inserir', 'orcamento', 'inserir', 'Cadastrar orçamento'),
  ('orcamento.atualizar', 'orcamento', 'atualizar', 'Alterar orçamento'),
  ('orcamento.excluir', 'orcamento', 'excluir', 'Excluir orçamento'),
  ('pagamentos.visualizar', 'pagamentos', 'visualizar', 'Visualizar pagamentos'),
  ('pagamentos.inserir', 'pagamentos', 'inserir', 'Cadastrar pagamentos'),
  ('pagamentos.atualizar', 'pagamentos', 'atualizar', 'Alterar pagamentos'),
  ('pagamentos.excluir', 'pagamentos', 'excluir', 'Excluir pagamentos'),
  ('documentos.visualizar', 'documentos', 'visualizar', 'Visualizar documentos, renders e plantas'),
  ('documentos.inserir', 'documentos', 'inserir', 'Cadastrar documentos, renders e plantas'),
  ('documentos.atualizar', 'documentos', 'atualizar', 'Alterar documentos, renders e plantas'),
  ('documentos.excluir', 'documentos', 'excluir', 'Excluir documentos, renders e plantas'),
  ('membros.visualizar', 'membros', 'visualizar', 'Visualizar participantes'),
  ('membros.convidar', 'membros', 'convidar', 'Convidar participantes'),
  ('membros.atualizar', 'membros', 'atualizar', 'Alterar papéis e permissões'),
  ('membros.excluir', 'membros', 'excluir', 'Remover participantes'),
  ('auditoria.visualizar', 'auditoria', 'visualizar', 'Visualizar o histórico do projeto');

CREATE TABLE permissoes_papel (
  papel_id BIGINT NOT NULL REFERENCES papeis(id) ON DELETE CASCADE,
  permissao_id BIGINT NOT NULL REFERENCES permissoes(id) ON DELETE CASCADE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (papel_id, permissao_id)
);

INSERT INTO permissoes_papel (papel_id, permissao_id)
SELECT pa.id, pe.id FROM papeis pa CROSS JOIN permissoes pe WHERE pa.codigo = 'PROPRIETARIO';

INSERT INTO permissoes_papel (papel_id, permissao_id)
SELECT pa.id, pe.id FROM papeis pa CROSS JOIN permissoes pe
WHERE pa.codigo = 'ENGENHEIRO' AND pe.chave IN (
  'projeto.visualizar','etapas.visualizar','etapas.inserir','etapas.atualizar',
  'orcamento.visualizar','orcamento.inserir','orcamento.atualizar',
  'pagamentos.visualizar','pagamentos.inserir','pagamentos.atualizar',
  'documentos.visualizar','documentos.inserir','documentos.atualizar','membros.visualizar','auditoria.visualizar'
);

INSERT INTO permissoes_papel (papel_id, permissao_id)
SELECT pa.id, pe.id FROM papeis pa CROSS JOIN permissoes pe
WHERE pa.codigo = 'LEITOR' AND pe.acao = 'visualizar';

CREATE TABLE membros_projeto (
  id BIGSERIAL PRIMARY KEY,
  projeto_id BIGINT NOT NULL REFERENCES projetos(id),
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id),
  papel_id BIGINT NOT NULL REFERENCES papeis(id),
  convidado_por BIGINT REFERENCES usuarios(id),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_membros_projeto_usuario UNIQUE (projeto_id, usuario_id)
);

CREATE INDEX idx_membros_projeto_usuario ON membros_projeto (usuario_id, projeto_id) WHERE ativo;
CREATE INDEX idx_membros_projeto_projeto ON membros_projeto (projeto_id) WHERE ativo;

CREATE TABLE permissoes_membro (
  membro_projeto_id BIGINT NOT NULL REFERENCES membros_projeto(id) ON DELETE CASCADE,
  permissao_id BIGINT NOT NULL REFERENCES permissoes(id) ON DELETE CASCADE,
  permitido BOOLEAN NOT NULL,
  atualizado_por BIGINT NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (membro_projeto_id, permissao_id)
);

CREATE TABLE convites_projeto (
  id BIGSERIAL PRIMARY KEY,
  projeto_id BIGINT NOT NULL REFERENCES projetos(id),
  email VARCHAR(254) NOT NULL,
  papel_id BIGINT NOT NULL REFERENCES papeis(id),
  token_hash CHAR(64) NOT NULL UNIQUE,
  expira_em TIMESTAMPTZ NOT NULL,
  aceito_em TIMESTAMPTZ,
  cancelado_em TIMESTAMPTZ,
  criado_por BIGINT NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_convites_estado CHECK (aceito_em IS NULL OR cancelado_em IS NULL)
);

CREATE UNIQUE INDEX uq_convites_pendentes_email
  ON convites_projeto (projeto_id, LOWER(email))
  WHERE aceito_em IS NULL AND cancelado_em IS NULL;
CREATE INDEX idx_convites_projeto ON convites_projeto (projeto_id, criado_em DESC);

CREATE TABLE assinaturas (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id),
  plano_id BIGINT NOT NULL REFERENCES planos(id),
  status VARCHAR(30) NOT NULL DEFAULT 'ATIVA',
  inicio_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fim_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_assinaturas_status CHECK (status IN ('ATIVA','CANCELADA','EXPIRADA')),
  CONSTRAINT ck_assinaturas_periodo CHECK (fim_em IS NULL OR fim_em >= inicio_em)
);

CREATE INDEX idx_assinaturas_usuario ON assinaturas (usuario_id, status);

CREATE TRIGGER tg_planos_atualizado BEFORE UPDATE ON planos FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();
CREATE TRIGGER tg_usuarios_atualizado BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();
CREATE TRIGGER tg_projetos_atualizado BEFORE UPDATE ON projetos FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();
CREATE TRIGGER tg_papeis_atualizado BEFORE UPDATE ON papeis FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();
CREATE TRIGGER tg_membros_atualizado BEFORE UPDATE ON membros_projeto FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();
CREATE TRIGGER tg_permissoes_membro_atualizado BEFORE UPDATE ON permissoes_membro FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();
CREATE TRIGGER tg_convites_atualizado BEFORE UPDATE ON convites_projeto FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();
CREATE TRIGGER tg_assinaturas_atualizado BEFORE UPDATE ON assinaturas FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();
