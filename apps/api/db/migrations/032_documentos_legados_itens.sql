ALTER TABLE pagamentos
  ADD COLUMN documentos_legados_habilitados BOOLEAN NOT NULL DEFAULT FALSE;

-- Todos os registros presentes no momento da transição são itens legados. A
-- marca mantém sua interface de documentos até a organização manual terminar.
UPDATE pagamentos SET documentos_legados_habilitados = TRUE;

COMMENT ON COLUMN pagamentos.documentos_legados_habilitados IS
  'Permite temporariamente consultar e reorganizar documentos do pagamento legado; itens novos permanecem sem documentos.';
