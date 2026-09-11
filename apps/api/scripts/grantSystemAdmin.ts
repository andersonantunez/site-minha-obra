import { pool, query } from '../src/config/database.js'

const userId = Number(process.argv[2])

if (!Number.isSafeInteger(userId) || userId <= 0) {
  console.error('Uso: npm run admin:grant -- ID_DO_USUARIO')
  process.exitCode = 1
} else {
  try {
    const { rows } = await query<{ id: number; nome: string; email: string }>(
      `UPDATE usuarios
       SET administrador_sistema=TRUE, atualizado_em=NOW()
       WHERE id=$1 AND ativo
       RETURNING id,nome,email`,
      [userId],
    )
    const usuario = rows[0]
    if (!usuario) {
      console.error('Usuário não encontrado ou inativo.')
      process.exitCode = 1
    } else {
      console.log(`Permissão de administrador concedida a ${usuario.nome} <${usuario.email}> (ID ${usuario.id}).`)
    }
  } finally {
    await pool.end()
  }
}
