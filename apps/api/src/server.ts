import { createServer } from 'node:http'
import { createApp } from './app.js'
import { pool } from './config/database.js'
import { env } from './config/env.js'

const server = createServer(createApp())

server.listen(env.port, '127.0.0.1', () => {
  console.log(`MinhaObra API disponível em http://127.0.0.1:${env.port}`)
  if (!process.env.JWT_SECRET && env.nodeEnv === 'development') {
    console.warn('JWT_SECRET não configurado: uma chave temporária foi gerada para esta execução local.')
  }
})

async function shutdown(signal: string) {
  console.log(`${signal} recebido; encerrando API.`)
  server.close(async () => {
    await pool.end()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
