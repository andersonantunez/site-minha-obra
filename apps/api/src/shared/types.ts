export type ProjectAccess = {
  projetoId: number
  membroProjetoId: number
  usuarioId: number
  papel: string
  proprietario: boolean
  permissoes: Set<string>
}

declare global {
  namespace Express {
    interface Request {
      usuarioId?: number
      acessoProjeto?: ProjectAccess
    }
  }
}

export {}
