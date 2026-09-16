-- Cada item legado ativo passa a ter uma Compra pai propria. A rotina e
-- idempotente: somente itens sem compra_id recebem um novo registro pai.
-- Nenhum documento, link, ID de item ou outro relacionamento e movimentado.
DO $$
DECLARE
  item RECORD;
  compra_id_criada BIGINT;
BEGIN
  FOR item IN
    SELECT p.*
    FROM pagamentos p
    WHERE p.excluido_em IS NULL
      AND p.compra_id IS NULL
    ORDER BY p.id
    FOR UPDATE
  LOOP
    INSERT INTO compras (
      projeto_id, etapa_id, descricao, status, data_pagamento,
      forma_pagamento, fornecedor, nome_contato_fornecedor,
      contato_fornecedor, data_agendamento, data_entrega, ordem,
      criado_por, criado_em, atualizado_em
    ) VALUES (
      item.projeto_id,
      item.etapa_id,
      item.descricao,
      item.status,
      item.data_pagamento,
      item.forma_pagamento,
      item.fornecedor,
      item.nome_contato_fornecedor,
      item.contato_fornecedor,
      item.data_agendamento,
      item.data_entrega,
      item.ordem,
      item.criado_por,
      item.criado_em,
      item.atualizado_em
    )
    RETURNING id INTO compra_id_criada;

    UPDATE pagamentos
    SET compra_id = compra_id_criada
    WHERE id = item.id
      AND compra_id IS NULL;
  END LOOP;
END $$;

COMMENT ON COLUMN pagamentos.compra_id IS
  'Compra pai do item. Os itens existentes receberam uma compra individual na migracao 033 e podem ser agrupados manualmente depois.';
