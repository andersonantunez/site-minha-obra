CREATE TABLE documentos_projeto_categorias (
  documento_id BIGINT NOT NULL REFERENCES documentos_projeto(id) ON DELETE CASCADE,
  categoria_id BIGINT NOT NULL REFERENCES categorias_documento(id) ON DELETE RESTRICT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (documento_id, categoria_id)
);

CREATE INDEX idx_documentos_projeto_categorias_categoria
  ON documentos_projeto_categorias (categoria_id, documento_id);

-- Preserva os vínculos existentes, inclusive categorias criadas manualmente antes
-- da existência do cadastro de categorias por projeto.
INSERT INTO categorias_documento (projeto_id, nome)
SELECT DISTINCT d.projeto_id, trim(d.categoria)
FROM documentos_projeto d
WHERE d.excluido_em IS NULL
  AND trim(COALESCE(d.categoria, '')) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM categorias_documento c
    WHERE c.projeto_id = d.projeto_id
      AND lower(c.nome) = lower(trim(d.categoria))
      AND c.excluido_em IS NULL
  );

INSERT INTO documentos_projeto_categorias (documento_id, categoria_id)
SELECT d.id, c.id
FROM documentos_projeto d
JOIN categorias_documento c
  ON c.projeto_id = d.projeto_id
 AND lower(c.nome) = lower(trim(d.categoria))
 AND c.excluido_em IS NULL
WHERE d.excluido_em IS NULL
  AND trim(COALESCE(d.categoria, '')) <> ''
ON CONFLICT DO NOTHING;
