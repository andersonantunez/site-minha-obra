-- Um total informado pelo usuário prevalece sobre a multiplicação arredondada
-- do valor unitário, preservando valores exatos em casos de dízima.
ALTER TABLE pagamentos
  ADD COLUMN IF NOT EXISTS valor_total_manual BOOLEAN NOT NULL DEFAULT FALSE;

-- Os totais existentes são preservados durante a transição. Ao editar o valor
-- unitário, a aplicação volta automaticamente ao cálculo quantidade × unitário.
UPDATE pagamentos
SET valor_total_manual = TRUE
WHERE compra_id IS NOT NULL AND valor IS NOT NULL;

COMMENT ON COLUMN pagamentos.valor_total_manual IS
  'Indica que valor contém o total informado manualmente para o item.';
