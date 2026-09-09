WITH nomes(ordem,nome) AS (VALUES
  (1,'Projetos, licenças e preparação'),
  (2,'Serviços preliminares e canteiro'),
  (3,'Terraplenagem'),
  (4,'Fundações'),
  (5,'Estrutura'),
  (6,'Alvenaria e vedações'),
  (7,'Cobertura'),
  (8,'Instalações elétricas e hidráulicas'),
  (9,'Impermeabilização'),
  (10,'Revestimentos e acabamentos'),
  (11,'Esquadrias, louças, metais e mobiliário'),
  (12,'Área externa, paisagismo, testes e entrega')
)
UPDATE cronogramas c SET nome=nomes.nome
FROM nomes
WHERE c.ordem=nomes.ordem AND c.parent_id IS NULL AND c.excluido_em IS NULL;

WITH nomes(ordem,nome) AS (VALUES
  (1,'Projetos, licenças e preparação'),
  (2,'Serviços preliminares e canteiro'),
  (3,'Terraplenagem'),
  (4,'Fundações'),
  (5,'Estrutura'),
  (6,'Alvenaria e vedações'),
  (7,'Cobertura'),
  (8,'Instalações elétricas e hidráulicas'),
  (9,'Impermeabilização'),
  (10,'Revestimentos e acabamentos'),
  (11,'Esquadrias, louças, metais e mobiliário'),
  (12,'Área externa, paisagismo, testes e entrega')
)
INSERT INTO cronogramas (projeto_id,parent_id,nome,descricao,valor_previsto,valor_executado,ordem,criado_por)
SELECT p.id,NULL,n.nome,NULL,0,0,n.ordem,p.proprietario_usuario_id
FROM projetos p CROSS JOIN nomes n
WHERE p.excluido_em IS NULL
  AND NOT EXISTS (SELECT 1 FROM cronogramas c WHERE c.projeto_id=p.id AND c.parent_id IS NULL AND c.ordem=n.ordem AND c.excluido_em IS NULL);
