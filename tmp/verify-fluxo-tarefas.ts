import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'
import pg from 'pg'

dotenv.config({ path: '.env' })
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
let createdTaskId: number | null = null

try {
  const access = await pool.query(`SELECT mp.usuario_id,mp.projeto_id
    FROM membros_projeto mp
    JOIN usuarios u ON u.id=mp.usuario_id
    JOIN papeis pa ON pa.id=mp.papel_id
    JOIN projetos p ON p.id=mp.projeto_id
    WHERE mp.ativo AND u.ativo AND p.excluido_em IS NULL AND pa.codigo='PROPRIETARIO'
    ORDER BY mp.id LIMIT 1`)
  if (!access.rows[0]) throw new Error('Nenhum projeto disponível para validação.')
  const { usuario_id: userId, projeto_id: projectId } = access.rows[0]
  const token = jwt.sign({ tipo: 'sessao' }, process.env.JWT_SECRET!, {
    subject: String(userId), expiresIn: '10m', issuer: 'minhaobra-api', audience: 'minhaobra-web',
  })
  const base = `http://127.0.0.1:${process.env.PORT || 3001}/api/projetos/${projectId}`
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(base + path, { ...init, headers: { ...headers, ...(init.headers || {}) } })
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${await response.text()}`)
    return response.status === 204 ? null : response.json()
  }

  const description = `Validação automática ${Date.now()}`
  const created = await request('/tarefas', { method: 'POST', body: JSON.stringify({ descricao: description, observacao: 'Detalhes iniciais', status: 'PARADO', prioridade: 'BAIXA' }) })
  createdTaskId = created.tarefa.id
  const statusUpdated = await request(`/tarefas/${createdTaskId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'FINALIZADO' }) })
  if (statusUpdated.tarefa.status !== 'FINALIZADO') throw new Error('A alteração rápida de status da tarefa não foi persistida.')
  const updated = await request(`/tarefas/${createdTaskId}`, { method: 'PUT', body: JSON.stringify({ descricao: description, observacao: 'Detalhes atualizados', status: 'INICIADO', prioridade: 'ALTA' }) })
  if (updated.tarefa.observacao !== 'Detalhes atualizados' || updated.tarefa.status !== 'INICIADO' || updated.tarefa.prioridade !== 'ALTA') throw new Error('A atualização da tarefa não foi persistida.')
  const tasks = await request(`/tarefas?busca=${encodeURIComponent(description)}`)
  if (!tasks.tarefas.some((task: { id: number }) => task.id === createdTaskId)) throw new Error('A tarefa criada não foi localizada na consulta.')

  const today = new Date().toISOString().slice(0, 10)
  const current = await request('/fluxo-caixa?porPagina=100&incluirFuturos=false')
  const future = await request('/fluxo-caixa?porPagina=100&incluirFuturos=true')
  if (current.itens.some((item: { data: string }) => item.data.slice(0, 10) > today)) throw new Error('O fluxo sem provisão contém lançamentos futuros.')
  if (future.total < current.total) throw new Error('O fluxo com provisão retornou menos lançamentos.')
  for (const response of [current, future]) {
    for (const key of ['total_entrada', 'total_saida', 'saldo_atual', 'saldo_com_provisao']) if (!(key in response.indicadores)) throw new Error(`Indicador ausente: ${key}`)
  }
  const synchronized = future.itens.filter((item: { origem: string }) => item.origem === 'PAGAMENTO')
  if (synchronized.some((item: { editavel: boolean }) => item.editavel !== false)) throw new Error('Pagamento sincronizado marcado como editável.')
  if (synchronized.some((item: { quantidade?: unknown; unidade?: unknown }) => !Object.hasOwn(item, 'quantidade') || !Object.hasOwn(item, 'unidade'))) throw new Error('Quantidade/unidade ausentes em pagamento sincronizado.')

  await request(`/tarefas/${createdTaskId}`, { method: 'DELETE' })
  createdTaskId = null
  console.log(JSON.stringify({ projectId, tarefas: 'CRUD validado', fluxoSemProvisao: current.total, fluxoComProvisao: future.total, pagamentosSincronizados: synchronized.length }))
} finally {
  if (createdTaskId) await pool.query('UPDATE tarefas SET excluido_em=NOW() WHERE id=$1', [createdTaskId])
  await pool.end()
}
