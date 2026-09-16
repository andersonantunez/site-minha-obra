-- O item conserva quatro casas no valor unitario; o valor final do item e da
-- compra continua monetario, arredondado apenas ao fim do calculo.
ALTER TABLE pagamentos
  ALTER COLUMN valor_unitario TYPE NUMERIC(15,4)
  USING valor_unitario::NUMERIC(15,4);

COMMENT ON COLUMN pagamentos.valor_unitario IS
  'Valor unitario do item com quatro casas decimais. O total e calculado com a precisao integral e apresentado em centavos.';
