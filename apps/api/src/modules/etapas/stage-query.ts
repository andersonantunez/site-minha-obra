/**
 * Critério único para registros do cronograma que podem ser exibidos ou
 * relacionados a pagamentos. Subitens de uma etapa removida também deixam de
 * ser elegíveis, inclusive em bases que possuam dados legados inconsistentes.
 */
export function activeScheduleStageWhere(alias = 'c') {
  return `${alias}.excluido_em IS NULL AND (${alias}.parent_id IS NULL OR EXISTS (
    SELECT 1 FROM cronogramas pai_ativo
    WHERE pai_ativo.id=${alias}.parent_id
      AND pai_ativo.projeto_id=${alias}.projeto_id
      AND pai_ativo.parent_id IS NULL
      AND pai_ativo.excluido_em IS NULL
  ))`
}

/** Mantém cada etapa seguida pelos seus subitens, sempre pela ordem configurada. */
export function activeScheduleStageOrder(alias = 'c') {
  return `COALESCE((SELECT pai_ordem.ordem FROM cronogramas pai_ordem WHERE pai_ordem.id=${alias}.parent_id),${alias}.ordem),
    CASE WHEN ${alias}.parent_id IS NULL THEN 0 ELSE 1 END,
    ${alias}.ordem,${alias}.id`
}
