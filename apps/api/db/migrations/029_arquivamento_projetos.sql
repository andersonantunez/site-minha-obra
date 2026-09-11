ALTER TABLE projetos
  ADD COLUMN arquivado_em TIMESTAMPTZ;

CREATE INDEX idx_projetos_arquivamento
  ON projetos (arquivado_em, atualizado_em DESC)
  WHERE excluido_em IS NULL;
