ALTER TABLE cronogramas
  ADD COLUMN data_inicio_previsto DATE,
  ADD COLUMN data_fim_previsto DATE;

ALTER TABLE cronogramas DROP CONSTRAINT IF EXISTS ck_cronogramas_periodo_previsto;
ALTER TABLE cronogramas ADD CONSTRAINT ck_cronogramas_periodo_previsto
  CHECK (data_fim_previsto IS NULL OR data_inicio_previsto IS NULL OR data_fim_previsto >= data_inicio_previsto);

COMMENT ON COLUMN cronogramas.data_inicio_previsto IS 'Data planejada para início da etapa ou subitem.';
COMMENT ON COLUMN cronogramas.data_fim_previsto IS 'Data planejada para conclusão da etapa ou subitem.';
