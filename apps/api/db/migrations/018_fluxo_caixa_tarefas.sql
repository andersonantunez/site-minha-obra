-- Fluxo de caixa: lançamentos passam a aceitar qualquer dia e valores positivos ou negativos.
ALTER TABLE itens_orcamento DROP CONSTRAINT IF EXISTS ck_orcamento_competencia;
ALTER TABLE itens_orcamento DROP CONSTRAINT IF EXISTS ck_orcamento_valor;

ALTER TABLE importacoes DROP CONSTRAINT IF EXISTS ck_importacoes_entidade;
UPDATE importacoes SET entidade='FLUXO_CAIXA' WHERE entidade='ORCAMENTO';
ALTER TABLE importacoes ADD CONSTRAINT ck_importacoes_entidade
  CHECK (entidade IN ('ETAPAS','CRONOGRAMA','FLUXO_CAIXA','PAGAMENTOS'));

UPDATE permissoes SET modulo='fluxo_caixa',descricao=replace(descricao,'orçamento','fluxo de caixa') WHERE modulo='orcamento';

CREATE TABLE tarefas (
  id BIGSERIAL PRIMARY KEY,
  projeto_id BIGINT NOT NULL REFERENCES projetos(id),
  descricao VARCHAR(240) NOT NULL,
  observacao TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'PARADO',
  prioridade VARCHAR(10) NOT NULL DEFAULT 'BAIXA',
  criado_por BIGINT NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em TIMESTAMPTZ,
  CONSTRAINT ck_tarefas_descricao CHECK (length(trim(descricao)) >= 2),
  CONSTRAINT ck_tarefas_status CHECK (status IN ('PARADO','INICIADO','FINALIZADO')),
  CONSTRAINT ck_tarefas_prioridade CHECK (prioridade IN ('BAIXA','ALTA'))
);

CREATE INDEX idx_tarefas_projeto_status ON tarefas (projeto_id,status,id DESC) WHERE excluido_em IS NULL;
CREATE TRIGGER tg_tarefas_atualizado BEFORE UPDATE ON tarefas FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();

INSERT INTO permissoes (chave,modulo,acao,descricao) VALUES
  ('tarefas.visualizar','tarefas','visualizar','Visualizar tarefas'),
  ('tarefas.inserir','tarefas','inserir','Cadastrar tarefas'),
  ('tarefas.atualizar','tarefas','atualizar','Alterar tarefas'),
  ('tarefas.excluir','tarefas','excluir','Excluir tarefas')
ON CONFLICT (chave) DO NOTHING;

INSERT INTO permissoes_papel (papel_id,permissao_id)
SELECT pa.id,pe.id FROM papeis pa CROSS JOIN permissoes pe
WHERE pa.codigo='PROPRIETARIO' AND pe.modulo='tarefas'
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_papel (papel_id,permissao_id)
SELECT pa.id,pe.id FROM papeis pa CROSS JOIN permissoes pe
WHERE pa.codigo='ENGENHEIRO' AND pe.chave IN ('tarefas.visualizar','tarefas.inserir','tarefas.atualizar')
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_papel (papel_id,permissao_id)
SELECT pa.id,pe.id FROM papeis pa CROSS JOIN permissoes pe
WHERE pa.codigo='LEITOR' AND pe.chave='tarefas.visualizar'
ON CONFLICT DO NOTHING;
