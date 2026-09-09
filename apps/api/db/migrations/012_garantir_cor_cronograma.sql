DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['cronograma', 'cronogramas'] LOOP
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = relation_name AND relkind IN ('r', 'p')) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS cor VARCHAR(7) NOT NULL DEFAULT ''#8d765a''', relation_name);
      EXECUTE format('UPDATE %I SET cor = ''#8d765a'' WHERE cor IS NULL', relation_name);
    END IF;
  END LOOP;
END $$;
