import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool, withTransaction } from '../src/config/database.js'

const currentDir = dirname(fileURLToPath(import.meta.url))
const migrationsDir = resolve(currentDir, '../db/migrations')

async function ensureControlTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS migrations_controle (
    id BIGSERIAL PRIMARY KEY,
    nome_arquivo VARCHAR(255) NOT NULL UNIQUE,
    checksum CHAR(64) NOT NULL,
    executado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
}

async function listMigrations() {
  return (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort()
}

async function status() {
  await ensureControlTable()
  const files = await listMigrations()
  const { rows } = await pool.query<{ nome_arquivo: string }>('SELECT nome_arquivo FROM migrations_controle ORDER BY nome_arquivo')
  const applied = new Set(rows.map((row) => row.nome_arquivo))
  for (const file of files) console.log(`${applied.has(file) ? 'aplicada' : 'pendente'}  ${file}`)
}

async function up() {
  await ensureControlTable()
  const files = await listMigrations()
  const { rows } = await pool.query<{ nome_arquivo: string; checksum: string }>('SELECT nome_arquivo, checksum FROM migrations_controle')
  const applied = new Map(rows.map((row) => [row.nome_arquivo, row.checksum]))

  for (const file of files) {
    const sql = await readFile(resolve(migrationsDir, file), 'utf8')
    const checksum = createHash('sha256').update(sql).digest('hex')
    const previous = applied.get(file)
    if (previous && previous !== checksum) throw new Error(`Migration já aplicada foi alterada: ${file}`)
    if (previous) continue

    await withTransaction(async (client) => {
      await client.query(sql)
      await client.query('INSERT INTO migrations_controle (nome_arquivo, checksum) VALUES ($1,$2)', [file, checksum])
    })
    console.log(`aplicada  ${file}`)
  }
}

const command = process.argv[2] ?? 'up'
try {
  if (command === 'status') await status()
  else if (command === 'up') await up()
  else throw new Error(`Comando desconhecido: ${command}`)
} finally {
  await pool.end()
}
