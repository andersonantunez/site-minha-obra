CREATE TABLE categorias_documento (
  id BIGSERIAL PRIMARY KEY,
  projeto_id BIGINT NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  nome VARCHAR(80) NOT NULL,
  criado_por BIGINT REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em TIMESTAMPTZ,
  CONSTRAINT ck_categorias_documento_nome CHECK (length(trim(nome)) >= 2)
);

CREATE UNIQUE INDEX uq_categorias_documento_nome_ativo
  ON categorias_documento (projeto_id, lower(nome)) WHERE excluido_em IS NULL;
CREATE INDEX idx_categorias_documento_projeto
  ON categorias_documento (projeto_id, nome) WHERE excluido_em IS NULL;
CREATE TRIGGER tg_categorias_documento_atualizado BEFORE UPDATE ON categorias_documento
  FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();

INSERT INTO categorias_documento (projeto_id,nome)
SELECT p.id, sugestao.nome
FROM projetos p
CROSS JOIN (VALUES
  ('Pagamento'),('Render'),('Planta Executiva'),('Planta Hidráulica'),
  ('Planta Elétrica'),('Planta Estrutural'),('Liberação Prefeitura'),
  ('Contrato'),('Unificação dos Terrenos'),('Consórcio'),('INSS Obras'),
  ('Financiamento Caixa'),('Consórcio Sicredi'),('Outros')
) AS sugestao(nome)
WHERE p.excluido_em IS NULL;

ALTER TABLE documentos_projeto ADD COLUMN pagamento_id BIGINT REFERENCES pagamentos(id);
ALTER TABLE documentos_projeto ADD COLUMN documento_pagamento_legado_id BIGINT;
ALTER TABLE documentos_projeto ADD COLUMN origem_acervo_tipo VARCHAR(20);
ALTER TABLE documentos_projeto ADD COLUMN origem_acervo_id BIGINT;
CREATE INDEX idx_documentos_projeto_pagamento ON documentos_projeto (pagamento_id) WHERE excluido_em IS NULL;
CREATE UNIQUE INDEX uq_documentos_projeto_pagamento_legado
  ON documentos_projeto (documento_pagamento_legado_id) WHERE documento_pagamento_legado_id IS NOT NULL;
CREATE UNIQUE INDEX uq_documentos_projeto_origem_acervo
  ON documentos_projeto (origem_acervo_tipo,origem_acervo_id) WHERE origem_acervo_tipo IS NOT NULL;

ALTER TABLE documentos_pagamento ADD COLUMN documento_projeto_id BIGINT REFERENCES documentos_projeto(id);
CREATE UNIQUE INDEX uq_documentos_pagamento_documento_projeto
  ON documentos_pagamento (documento_projeto_id) WHERE documento_projeto_id IS NOT NULL;

INSERT INTO documentos_projeto
  (projeto_id,pagamento_id,titulo,categoria,descricao,tipo_origem,url,caminho_arquivo,nome_original,tipo_mime,criado_por,criado_em,atualizado_em,documento_pagamento_legado_id)
SELECT p.projeto_id,COALESCE(dp.pagamento_id,ip.pagamento_id),dp.titulo,'Pagamento',NULL,
  dp.tipo_origem,dp.url,dp.caminho_arquivo,dp.nome_original,dp.tipo_mime,dp.criado_por,dp.criado_em,dp.atualizado_em,dp.id
FROM documentos_pagamento dp
LEFT JOIN itens_pagamento ip ON ip.id=dp.item_pagamento_id
JOIN pagamentos p ON p.id=COALESCE(dp.pagamento_id,ip.pagamento_id)
WHERE dp.excluido_em IS NULL;

UPDATE documentos_pagamento dp
SET documento_projeto_id=d.id
FROM documentos_projeto d
WHERE d.documento_pagamento_legado_id=dp.id;

INSERT INTO documentos_projeto
  (projeto_id,titulo,categoria,descricao,tipo_origem,url,caminho_arquivo,nome_original,tipo_mime,criado_por,criado_em,atualizado_em,origem_acervo_tipo,origem_acervo_id)
SELECT projeto_id,titulo,'Render',descricao,tipo_origem,url,caminho_arquivo,nome_original,tipo_mime,criado_por,criado_em,atualizado_em,'RENDER',id
FROM renders_projeto WHERE excluido_em IS NULL;

INSERT INTO documentos_projeto
  (projeto_id,titulo,categoria,descricao,tipo_origem,url,caminho_arquivo,nome_original,tipo_mime,criado_por,criado_em,atualizado_em,origem_acervo_tipo,origem_acervo_id)
SELECT projeto_id,nome,
  CASE categoria WHEN 'HIDRAULICO' THEN 'Planta Hidráulica' WHEN 'ELETRICO' THEN 'Planta Elétrica'
    WHEN 'ESTRUTURAL' THEN 'Planta Estrutural' ELSE 'Planta Executiva' END,
  descricao,tipo_origem,url,caminho_arquivo,nome_original,tipo_mime,criado_por,criado_em,atualizado_em,'PLANTA',id
FROM plantas_projeto WHERE excluido_em IS NULL;
