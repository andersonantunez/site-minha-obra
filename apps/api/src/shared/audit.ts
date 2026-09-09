import type { PoolClient } from 'pg'

type AuditInput = {
  projetoId?: number | null
  usuarioId?: number | null
  acao: string
  entidade: string
  registroId?: number | null
  dadosAnteriores?: unknown
  dadosNovos?: unknown
  enderecoIp?: string | null
}

export async function recordAudit(client: PoolClient, input: AuditInput) {
  await client.query(`INSERT INTO registros_auditoria
    (projeto_id,usuario_id,acao,entidade,registro_id,dados_anteriores,dados_novos,endereco_ip)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [
    input.projetoId ?? null,
    input.usuarioId ?? null,
    input.acao,
    input.entidade,
    input.registroId ?? null,
    input.dadosAnteriores === undefined ? null : JSON.stringify(input.dadosAnteriores),
    input.dadosNovos === undefined ? null : JSON.stringify(input.dadosNovos),
    input.enderecoIp ?? null,
  ])
}
