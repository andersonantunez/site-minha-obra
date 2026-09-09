ALTER TABLE cronograma RENAME TO cronogramas;

-- Compatibilidade com integrações antigas que ainda consultam o nome singular.
-- A view simples continua sendo atualizável para as rotas legadas.
CREATE VIEW cronograma AS SELECT * FROM cronogramas;

COMMENT ON TABLE cronogramas IS 'Cronogramas hierárquicos da obra: etapas possuem parent_id nulo e subitens apontam para a etapa pai.';
