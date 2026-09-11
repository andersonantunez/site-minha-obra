import { describe, expect, it } from 'vitest'
import { paymentSchema } from '../src/modules/pagamentos/payment.schemas.js'
import { normalizePaymentStatus, PAYMENT_STATUS_VALUES } from '../src/modules/pagamentos/payment-status.js'

const base = { descricao: 'Impermeabilização', valor: 2500, status: 'EM_NEGOCIACAO' }

describe('regras do pagamento', () => {
  it('aceita pagamento sem entidade de subitem', () => {
    expect(paymentSchema.safeParse({ descricao: 'Teste', valor: 100 }).success).toBe(true)
  })

  it('aceita pagamento sem valor informado', () => {
    expect(paymentSchema.parse({ descricao: 'Teste' }).valor).toBeNull()
    expect(paymentSchema.parse({ descricao: 'Teste', valor: '' }).valor).toBeNull()
    expect(paymentSchema.parse({ descricao: 'Teste', valor: null }).valor).toBeNull()
  })

  it('aceita observações detalhadas', () => {
    const result = paymentSchema.safeParse({ ...base, observacao: 'Manta 10 m² | Aplicação completa' })
    expect(result.success).toBe(true)
  })

  it('aceita os quatro status na ordem oficial e exige data para pagamento aguardando entrega', () => {
    expect(PAYMENT_STATUS_VALUES).toEqual(['PENDENTE','EM_NEGOCIACAO','PAGO_AGUARDANDO_ENTREGA','CONCLUIDO'])
    expect(paymentSchema.safeParse({ ...base, status: 'PENDENTE' }).success).toBe(true)
    expect(paymentSchema.safeParse({ ...base, status: 'CONCLUIDO' }).success).toBe(true)
    expect(paymentSchema.safeParse({ ...base, status: 'PAGO_AGUARDANDO_ENTREGA' }).success).toBe(false)
    expect(paymentSchema.safeParse({ ...base, status: 'PAGO_AGUARDANDO_ENTREGA', data_pagamento: '2026-08-31', forma_pagamento: 'PIX' }).success).toBe(true)
  })

  it('normaliza os status legados durante importações', () => {
    expect(normalizePaymentStatus('FINALIZADO')).toBe('CONCLUIDO')
    expect(normalizePaymentStatus('PAGO')).toBe('PAGO_AGUARDANDO_ENTREGA')
    expect(normalizePaymentStatus('PARADO')).toBe('PENDENTE')
  })

  it('não aceita valor negativo', () => {
    expect(paymentSchema.safeParse({ ...base, valor: -1 }).success).toBe(false)
  })
})
