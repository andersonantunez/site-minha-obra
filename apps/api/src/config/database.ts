import pg, { type PoolClient, type QueryResultRow } from 'pg'
import { env } from './env.js'

const { Pool, types } = pg

// NUMERIC permanece string para nunca introduzir erro de ponto flutuante.
types.setTypeParser(20, (value) => Number.parseInt(value, 10))

export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: env.nodeEnv === 'test' ? 4 : 15,
  idleTimeoutMillis: 30_000,
})

export function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  return pool.query<T>(text, values)
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
