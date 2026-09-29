ALTER TABLE despesas DROP CONSTRAINT ck_despesas_categoria;

ALTER TABLE despesas
  ADD CONSTRAINT ck_despesas_categoria
  CHECK (categoria IS NULL OR categoria IN ('MAO_DE_OBRA','MATERIAL_CONSTRUCAO','DOCUMENTACAO','FRETE','OUTROS'));

COMMENT ON COLUMN despesas.categoria IS 'Classificação financeira: MAO_DE_OBRA, MATERIAL_CONSTRUCAO, DOCUMENTACAO, FRETE ou OUTROS.';
