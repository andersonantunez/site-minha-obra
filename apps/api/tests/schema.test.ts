import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

async function migration(name: string) {
  return readFile(resolve(process.cwd(), 'db/migrations', name), 'utf8')
}

describe('modelagem persistida em português', () => {
  it('mantém as tabelas principais com nomes de domínio em português', async () => {
    const sql = [
      await migration('001_identidade_projetos_rbac.sql'),
      await migration('002_planejamento_documentos.sql'),
      await migration('003_financeiro_auditoria.sql'),
      await migration('008_cronograma_hierarquico.sql'),
    ].join('\n')
    for (const table of ['usuarios','projetos','membros_projeto','convites_projeto','itens_orcamento','pagamentos','itens_pagamento','links_produtos_item_pagamento','registros_auditoria']) {
      expect(sql).toContain(`CREATE TABLE ${table}`)
    }
    expect(sql).toContain('ALTER TABLE etapas RENAME TO cronograma')
    expect(sql).toContain('parent_id BIGINT REFERENCES cronograma(id)')
    for (const forbidden of ['CREATE TABLE users','CREATE TABLE projects','CREATE TABLE payments','CREATE TABLE activity_logs']) {
      expect(sql).not.toContain(forbidden)
    }
  })

  it('vincula links exclusivamente ao subitem do pagamento', async () => {
    const sql = await migration('003_financeiro_auditoria.sql')
    const block = sql.slice(sql.indexOf('CREATE TABLE links_produtos_item_pagamento'), sql.indexOf('CREATE INDEX idx_links_produtos_item'))
    expect(block).toContain('item_pagamento_id BIGINT NOT NULL REFERENCES itens_pagamento(id)')
    expect(block).not.toMatch(/\bpagamento_id\b/)
  })

  it('usa NUMERIC e protege a data de itens pagos', async () => {
    const sql = await migration('003_financeiro_auditoria.sql')
    const currentStatusSql = await migration('017_periodo_projeto_status_pagamentos.sql')
    expect(sql).toContain('valor NUMERIC(15,2) NOT NULL')
    expect(currentStatusSql).toContain("status <> 'PAGO_AGUARDANDO_ENTREGA' OR data_pagamento IS NOT NULL")
    expect(currentStatusSql).toContain("WHEN 'FINALIZADO' THEN 'CONCLUIDO'")
    expect(currentStatusSql).toContain("WHEN 'PAGO' THEN 'PAGO_AGUARDANDO_ENTREGA'")
    expect(sql.toLowerCase()).not.toContain(' float')
  })

  it('limita o plano FREE a um projeto próprio sem limitar convites', async () => {
    const sql = await migration('001_identidade_projetos_rbac.sql')
    expect(sql).toContain("('FREE', 'Free', 1)")
    expect(sql).toContain('membros_projeto')
  })

  it('mantém permissões de papel isoladas por projeto', async () => {
    const sql = await migration('021_permissoes_papel_por_projeto.sql')
    expect(sql).toContain('CREATE TABLE permissoes_projeto_papel')
    expect(sql).toContain('PRIMARY KEY (projeto_id,papel_id,permissao_id)')
    expect(sql).toContain("'permissoes.visualizar'")
    expect(sql).toContain("'permissoes.atualizar'")
  })
})
