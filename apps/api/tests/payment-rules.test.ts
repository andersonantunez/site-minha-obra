import { describe, expect, it } from 'vitest'
import { moveItemsSchema, paymentSchema, purchaseItemSchema, purchaseSchema } from '../src/modules/pagamentos/payment.schemas.js'
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

  it('valida a Compra sem persistir classificação de documento', () => {
    const budget = purchaseSchema.parse({ descricao: 'Compra de materiais', etapa_id: 1 })
    const invoice = purchaseSchema.parse({ descricao: 'Compra faturada', etapa_id: 1, numero_nota_fiscal: 'NF-123' })
    expect(budget.numero_nota_fiscal).toBeNull()
    expect(invoice.numero_nota_fiscal).toBe('NF-123')
    expect(budget).not.toHaveProperty('classificacao')
    expect(invoice).not.toHaveProperty('classificacao')
  })

  it('valida item com quantidade e valor unitário, sem dados do fornecedor', () => {
    const item = purchaseItemSchema.parse({ descricao: 'Tubo PVC', quantidade: '2', unidade: 'Unidades', valor_unitario: '12.50', links_cotacao: ['https://loja.example/item'] })
    expect(item.quantidade).toBe(2)
    expect(item.valor_unitario).toBe(12.5)
    expect(item).not.toHaveProperty('fornecedor')
    expect(item).not.toHaveProperty('documentos')
    expect(purchaseItemSchema.parse({ descricao: 'Item sem quantidade', valor_unitario: '1,2345' }).quantidade).toBeNull()
  })

  it('exige etapa para criar uma Compra', () => {
    expect(purchaseSchema.safeParse({ descricao: 'Compra sem etapa' }).success).toBe(false)
    expect(purchaseSchema.safeParse({ descricao: 'Compra com etapa', etapa_id: 1 }).success).toBe(true)
  })

  it('aceita total manual e descontos independentes no item e na compra', () => {
    const item = purchaseItemSchema.parse({ descricao: 'Tijolos', quantidade: '3000', valor_unitario: '1,8333', valor_desconto: '10,00', valor_total: '5.500,00' })
    const purchase = purchaseSchema.parse({ descricao: 'Compra de tijolos', etapa_id: 1, observacao: 'Entrega parcial', valor_desconto: '25,00' })
    expect(item.valor_total).toBe(5500)
    expect(item.valor_desconto).toBe(10)
    expect(purchase.valor_desconto).toBe(25)
    expect(purchase.observacao).toBe('Entrega parcial')
  })

  it('remove IDs repetidos ao mover vários itens', () => {
    expect(moveItemsSchema.parse({ item_ids: [7,7,8], compra_id: 2 }).item_ids).toEqual([7,8])
  })

  it('aceita o prefixo visual +55 sem telefone em um campo opcional', () => {
    expect(purchaseSchema.parse({ descricao: 'Compra sem telefone', etapa_id: 1, contato_fornecedor: '+55 ' }).contato_fornecedor).toBeNull()
  })
})
