ALTER TABLE etapas RENAME TO cronograma;

ALTER TABLE cronograma
  ADD COLUMN parent_id BIGINT REFERENCES cronograma(id),
  ADD CONSTRAINT ck_cronograma_parent_diferente CHECK (parent_id IS NULL OR parent_id <> id);

CREATE INDEX idx_cronograma_parent
  ON cronograma (parent_id, ordem, id)
  WHERE excluido_em IS NULL;

ALTER TABLE importacoes DROP CONSTRAINT ck_importacoes_entidade;
ALTER TABLE importacoes ADD CONSTRAINT ck_importacoes_entidade
  CHECK (entidade IN ('ETAPAS','CRONOGRAMA','ORCAMENTO','PAGAMENTOS'));

COMMENT ON TABLE cronograma IS 'Cronograma hierarquico da obra: etapas possuem parent_id nulo e subitens apontam para a etapa pai.';
COMMENT ON COLUMN cronograma.parent_id IS 'Etapa pai do subitem. Nulo identifica uma etapa principal.';
