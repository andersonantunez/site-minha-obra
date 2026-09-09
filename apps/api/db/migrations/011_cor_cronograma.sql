ALTER TABLE cronogramas ADD COLUMN cor VARCHAR(7) NOT NULL DEFAULT '#8d765a';
WITH ordered AS (
  SELECT id, ARRAY['#167a45','#bd7012','#176e9b','#ba3f4a','#68449c','#087f72','#927d10','#a05427'] AS colors,
    ROW_NUMBER() OVER (PARTITION BY projeto_id ORDER BY ordem, id) - 1 AS position
  FROM cronogramas WHERE parent_id IS NULL AND excluido_em IS NULL
)
UPDATE cronogramas c SET cor = ordered.colors[(ordered.position % 8) + 1] FROM ordered WHERE c.id = ordered.id;
ALTER TABLE cronogramas ADD CONSTRAINT ck_cronogramas_cor CHECK (cor ~ '^#[0-9A-Fa-f]{6}$');
