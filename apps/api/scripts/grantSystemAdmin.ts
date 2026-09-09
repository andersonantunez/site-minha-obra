import { pool, query } from '../src/config/database.js'

const email = String(process.argv[2] || '').trim().toLowerCase()

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Uso: npm run admin:grant -- usuario@exemplo.com')
  process.exitCode = 1
} else {
  try {
    const { rows } = await query<{ id: number; nome: string; email: string }>(
      `UPDATE usuarios
       SET administrador_sistema=TRUE, atualizado_em=NOW()
       WHERE LOWER(email)=$1 AND ativo
       RETURNING id,nome,email`,
      [email],
    )
    const usuario = rows[0]
    if (!usuario) {
      console.error('Usuário não encontrado. Ele deve entrar pelo Google ao menos uma vez antes desta operação.')
      process.exitCode = 1
    } else {
      console.log(`Permissão de administrador concedida a ${usuario.nome} <${usuario.email}> (ID ${usuario.id}).`)
    }
  } finally {
    await pool.end()
  }
}
