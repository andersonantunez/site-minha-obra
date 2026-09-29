ALTER TABLE projetos
  ADD COLUMN orcamento_mao_obra NUMERIC(15,2),
  ADD COLUMN orcamento_materiais NUMERIC(15,2),
  ADD CONSTRAINT ck_projetos_orcamento_mao_obra CHECK (orcamento_mao_obra IS NULL OR orcamento_mao_obra >= 0),
  ADD CONSTRAINT ck_projetos_orcamento_materiais CHECK (orcamento_materiais IS NULL OR orcamento_materiais >= 0);

ALTER TABLE despesas
  ADD COLUMN categoria VARCHAR(30),
  ADD CONSTRAINT ck_despesas_categoria CHECK (categoria IS NULL OR categoria IN ('MAO_DE_OBRA','MATERIAL_CONSTRUCAO'));

CREATE INDEX idx_despesas_projeto_categoria
  ON despesas (projeto_id,categoria)
  WHERE excluido_em IS NULL;

COMMENT ON COLUMN projetos.orcamento_mao_obra IS 'Valor inicial previsto para despesas de mão de obra.';
COMMENT ON COLUMN projetos.orcamento_materiais IS 'Valor inicial previsto para despesas de materiais.';
COMMENT ON COLUMN despesas.categoria IS 'Classificação financeira: MAO_DE_OBRA ou MATERIAL_CONSTRUCAO.';
