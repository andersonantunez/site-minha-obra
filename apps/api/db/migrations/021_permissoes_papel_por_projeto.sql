ALTER TABLE permissoes
  ADD COLUMN configuravel BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE permissoes
SET configuravel=FALSE
WHERE chave IN ('projeto.visualizar','projeto.atualizar','auditoria.visualizar');

INSERT INTO permissoes (chave,modulo,acao,descricao) VALUES
  ('visao_geral.visualizar','visao_geral','visualizar','Visualizar a Visão Geral'),
  ('etapas.exportar','etapas','exportar','Exportar o Cronograma'),
  ('orcamento.exportar','fluxo_caixa','exportar','Exportar o Fluxo de Caixa'),
  ('pagamentos.exportar','pagamentos','exportar','Exportar pagamentos'),
  ('categorias.visualizar','categorias','visualizar','Visualizar categorias de documentos'),
  ('categorias.inserir','categorias','inserir','Cadastrar categorias de documentos'),
  ('categorias.atualizar','categorias','atualizar','Alterar categorias de documentos'),
  ('categorias.excluir','categorias','excluir','Excluir categorias de documentos'),
  ('configuracoes.visualizar','configuracoes','visualizar','Visualizar configurações do projeto'),
  ('configuracoes.atualizar','configuracoes','atualizar','Alterar configurações do projeto'),
  ('permissoes.visualizar','permissoes','visualizar','Visualizar permissões por papel'),
  ('permissoes.atualizar','permissoes','atualizar','Alterar permissões por papel')
ON CONFLICT (chave) DO NOTHING;

INSERT INTO permissoes_papel (papel_id,permissao_id)
SELECT pa.id,pe.id
FROM papeis pa CROSS JOIN permissoes pe
WHERE pa.codigo='PROPRIETARIO' AND pe.configuravel
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_papel (papel_id,permissao_id)
SELECT pa.id,pe.id
FROM papeis pa CROSS JOIN permissoes pe
WHERE pa.codigo IN ('ENGENHEIRO','LEITOR')
  AND pe.chave IN ('visao_geral.visualizar','configuracoes.visualizar')
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_papel (papel_id,permissao_id)
SELECT pa.id,pe.id
FROM papeis pa
JOIN permissoes_papel legado ON legado.papel_id=pa.id
JOIN permissoes permissao_legada ON permissao_legada.id=legado.permissao_id
JOIN permissoes pe ON pe.chave=CASE
  WHEN permissao_legada.chave='documentos.visualizar' THEN 'categorias.visualizar'
  WHEN permissao_legada.chave='documentos.inserir' THEN 'categorias.inserir'
  WHEN permissao_legada.chave='documentos.atualizar' THEN 'categorias.atualizar'
  WHEN permissao_legada.chave='documentos.excluir' THEN 'categorias.excluir'
END
WHERE permissao_legada.chave IN ('documentos.visualizar','documentos.inserir','documentos.atualizar','documentos.excluir')
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_papel (papel_id,permissao_id)
SELECT pa.id,exportacao.id
FROM papeis pa
JOIN permissoes_papel visualizacao ON visualizacao.papel_id=pa.id
JOIN permissoes origem ON origem.id=visualizacao.permissao_id
JOIN permissoes exportacao ON exportacao.chave=CASE
  WHEN origem.chave='etapas.visualizar' THEN 'etapas.exportar'
  WHEN origem.chave='orcamento.visualizar' THEN 'orcamento.exportar'
  WHEN origem.chave='pagamentos.visualizar' THEN 'pagamentos.exportar'
END
WHERE origem.chave IN ('etapas.visualizar','orcamento.visualizar','pagamentos.visualizar')
ON CONFLICT DO NOTHING;

CREATE TABLE permissoes_projeto_papel (
  projeto_id BIGINT NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  papel_id BIGINT NOT NULL REFERENCES papeis(id) ON DELETE CASCADE,
  permissao_id BIGINT NOT NULL REFERENCES permissoes(id) ON DELETE CASCADE,
  permitido BOOLEAN NOT NULL,
  atualizado_por BIGINT NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (projeto_id,papel_id,permissao_id)
);

CREATE INDEX idx_permissoes_projeto_papel_consulta
  ON permissoes_projeto_papel (projeto_id,papel_id);

CREATE TRIGGER tg_permissoes_projeto_papel_atualizado
  BEFORE UPDATE ON permissoes_projeto_papel
  FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();
