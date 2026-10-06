CREATE TABLE tipos_documento (
  id BIGSERIAL PRIMARY KEY,
  projeto_id BIGINT NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  nome VARCHAR(80) NOT NULL,
  criado_por BIGINT REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em TIMESTAMPTZ,
  CONSTRAINT ck_tipos_documento_nome CHECK (length(trim(nome)) >= 2)
);

CREATE UNIQUE INDEX uq_tipos_documento_nome_ativo ON tipos_documento (projeto_id, lower(nome)) WHERE excluido_em IS NULL;
CREATE INDEX idx_tipos_documento_projeto ON tipos_documento (projeto_id, nome) WHERE excluido_em IS NULL;
CREATE TRIGGER tg_tipos_documento_atualizado BEFORE UPDATE ON tipos_documento FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();

INSERT INTO tipos_documento (projeto_id,nome)
SELECT p.id,tipo.nome
FROM projetos p CROSS JOIN (VALUES
  ('Contrato'),('Orçamento'),('Nota Fiscal'),('Comprovante'),('Documento Técnico'),('Outros')
) AS tipo(nome)
WHERE p.excluido_em IS NULL;

ALTER TABLE documentos_projeto ADD COLUMN tipo_documento_id BIGINT REFERENCES tipos_documento(id) ON DELETE RESTRICT;

UPDATE documentos_projeto d
SET tipo_documento_id=t.id
FROM tipos_documento t
WHERE t.projeto_id=d.projeto_id AND lower(t.nome)=lower('Outros') AND d.tipo_documento_id IS NULL;

ALTER TABLE documentos_projeto ALTER COLUMN tipo_documento_id SET NOT NULL;
CREATE INDEX idx_documentos_projeto_tipo_documento ON documentos_projeto (tipo_documento_id) WHERE excluido_em IS NULL;
