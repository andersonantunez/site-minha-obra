import { z } from 'zod'

export const systemVariableSchema = z.object({
  chave: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{2,99}$/, 'Use letras minúsculas, números e sublinhado.'),
  valor: z.json(),
  descricao: z.string().trim().min(3).max(300),
})
