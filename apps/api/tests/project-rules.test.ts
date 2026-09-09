import { describe, expect, it } from 'vitest'
import { projectInputSchema } from '../src/modules/projetos/project.schemas.js'

const project = { nome: 'Casa 189', descricao: 'Projeto residencial completo.' }

describe('período previsto do projeto', () => {
  it('aceita período completo e datas opcionais', () => {
    expect(projectInputSchema.safeParse(project).success).toBe(true)
    expect(projectInputSchema.safeParse({ ...project, dataInicio: '2026-09-01', previsaoTermino: '2027-01-31' }).success).toBe(true)
  })

  it('recusa previsão de fim anterior ao início', () => {
    const result = projectInputSchema.safeParse({ ...project, dataInicio: '2027-02-01', previsaoTermino: '2027-01-31' })
    expect(result.success).toBe(false)
  })
})
