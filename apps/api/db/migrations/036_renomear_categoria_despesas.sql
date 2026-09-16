-- Categoria visual do módulo renomeada sem recriar ou perder documentos.
UPDATE documentos_projeto
SET categoria = 'Despesas'
WHERE lower(categoria) = 'pagamentos' AND excluido_em IS NULL;

INSERT INTO documentos_projeto_categorias (documento_id,categoria_id)
SELECT vinculacao.documento_id, destino.id
FROM documentos_projeto_categorias vinculacao
JOIN categorias_documento origem ON origem.id = vinculacao.categoria_id
JOIN categorias_documento destino ON destino.projeto_id = origem.projeto_id
  AND lower(destino.nome) = 'despesas' AND destino.excluido_em IS NULL
WHERE lower(origem.nome) = 'pagamentos' AND origem.excluido_em IS NULL
ON CONFLICT DO NOTHING;

DELETE FROM documentos_projeto_categorias vinculacao
USING categorias_documento origem, categorias_documento destino
WHERE vinculacao.categoria_id = origem.id
  AND destino.projeto_id = origem.projeto_id
  AND lower(origem.nome) = 'pagamentos'
  AND lower(destino.nome) = 'despesas'
  AND origem.excluido_em IS NULL
  AND destino.excluido_em IS NULL;

UPDATE categorias_documento origem
SET excluido_em = NOW()
WHERE lower(origem.nome) = 'pagamentos' AND origem.excluido_em IS NULL
  AND EXISTS (SELECT 1 FROM categorias_documento destino
    WHERE destino.projeto_id = origem.projeto_id
      AND lower(destino.nome) = 'despesas' AND destino.excluido_em IS NULL);

UPDATE categorias_documento origem
SET nome = 'Despesas'
WHERE lower(origem.nome) = 'pagamentos' AND origem.excluido_em IS NULL;
