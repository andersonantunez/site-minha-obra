import { mkdir, writeFile } from 'node:fs/promises'
import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'
import pg from 'pg'

dotenv.config({ path: '.env' })
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
try {
  const { rows } = await pool.query(`SELECT mp.usuario_id,mp.projeto_id
    FROM membros_projeto mp JOIN projetos p ON p.id=mp.projeto_id
    WHERE mp.ativo AND p.excluido_em IS NULL ORDER BY mp.projeto_id,mp.usuario_id LIMIT 1`)
  if (!rows[0]) throw new Error('Nenhum projeto com membro encontrado para validar o relatório.')
  const token = jwt.sign({ tipo: 'sessao' }, process.env.JWT_SECRET, {
    subject: String(rows[0].usuario_id), expiresIn: '10m', issuer: 'minhaobra-api', audience: 'minhaobra-web',
  })
  const response = await fetch(`http://127.0.0.1:3002/api/projetos/${rows[0].projeto_id}/pagamentos/relatorio.pdf`, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error(`Relatório respondeu ${response.status}: ${await response.text()}`)
  await mkdir('output/pdf', { recursive: true })
  await writeFile('output/pdf/relatorio-pagamentos-exemplo.pdf', Buffer.from(await response.arrayBuffer()))
  console.log(`PDF gerado para o projeto ${rows[0].projeto_id}.`)
} finally {
  await pool.end()
}
