ALTER TABLE configuracoes_sistema
  ALTER COLUMN valor TYPE JSONB USING to_jsonb(valor);

COMMENT ON TABLE configuracoes_sistema IS 'Variáveis globais do sistema, acessíveis exclusivamente por administradores do sistema.';
COMMENT ON COLUMN configuracoes_sistema.valor IS 'Valor JSON que pode conter texto, número, booleano, lista, objeto ou null.';
