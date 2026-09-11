ALTER TABLE pagamentos
  ALTER COLUMN valor DROP NOT NULL,
  ALTER COLUMN valor DROP DEFAULT;

COMMENT ON COLUMN pagamentos.valor IS 'Valor do pagamento quando informado; nulo significa valor ainda não definido.';
