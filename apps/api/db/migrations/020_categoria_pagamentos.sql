UPDATE documentos_projeto
SET categoria='Pagamentos'
WHERE categoria='Pagamento' AND excluido_em IS NULL;

UPDATE categorias_documento origem
SET excluido_em=NOW()
WHERE origem.nome='Pagamento' AND origem.excluido_em IS NULL
  AND EXISTS (
    SELECT 1 FROM categorias_documento destino
    WHERE destino.projeto_id=origem.projeto_id
      AND destino.nome='Pagamentos'
      AND destino.excluido_em IS NULL
  );

UPDATE categorias_documento
SET nome='Pagamentos'
WHERE nome='Pagamento' AND excluido_em IS NULL;
