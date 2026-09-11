import { z } from 'zod'

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((value) => value || null)
const optionalNumber = (min: number, max: number) => z.preprocess((value) => value === '' || value === undefined ? null : value, z.coerce.number().min(min).max(max).optional().nullable())

export const projectInputSchema = z.object({
  nome: z.string().trim().min(3).max(160),
  descricao: z.string().trim().min(10).max(4_000),
  endereco: optionalText(300),
  cidade: optionalText(120),
  estado: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional().nullable().transform((value) => value || null),
  dataInicio: z.iso.date().optional().nullable(),
  previsaoTermino: z.iso.date().optional().nullable(),
  areaConstruida: z.coerce.number().positive().max(99_999_999).optional().nullable(),
  cep: z.string().trim().regex(/^\d{5}-?\d{3}$/).optional().nullable().transform((value) => value || null),
  logradouro: optionalText(300),
  numero: optionalText(30),
  complemento: optionalText(180),
  bairro: optionalText(120),
  codigoIbgeCidade: optionalText(10),
  latitude: optionalNumber(-90, 90),
  longitude: optionalNumber(-180, 180),
  areaComLaje: optionalNumber(0, 99_999_999),
  areaSemLaje: optionalNumber(0, 99_999_999),
  processoAprovacao: optionalText(80),
  pastaDigital: optionalText(80),
  plantaNumero: optionalText(80),
  alvara: optionalText(80),
  art: optionalText(80),
  cnoObra: optionalText(80),
  matriculaTerreno: optionalText(80),
}).superRefine((value, context) => {
  if (value.dataInicio && value.previsaoTermino && value.previsaoTermino < value.dataInicio) {
    context.addIssue({ code: 'custom', path: ['previsaoTermino'], message: 'A previsão deve ser posterior ao início.' })
  }
  if ((value.latitude === null) !== (value.longitude === null)) context.addIssue({ code: 'custom', path: ['latitude'], message: 'Informe latitude e longitude juntas.' })
})

export const projectArchiveSchema = z.object({
  arquivado: z.boolean(),
})
