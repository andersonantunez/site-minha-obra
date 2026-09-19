import { describe,it,expect } from 'vitest'
import ExcelJS from 'exceljs'
import { importExample } from '../src/shared/import-examples.js'
import { parseExpenseImport } from '../src/modules/despesas/expense-import.service.js'
import { createExpenseWorkbook, expenseCrudProjection, expenseFinancialSummary, type ExpenseReport } from '../src/modules/despesas/expense-report.service.js'
import { parseSchedule } from '../src/modules/etapas/stage.routes.js'
import { parseEntries } from '../src/modules/orcamento/budget.routes.js'
import { expenseItemTotalSql,expenseTotalSql } from '../src/modules/despesas/expense-financial.js'
describe('Contrato atual de transferências',()=>{
 for(const format of ['JSON','TSV'] as const){
  it('modelo cronograma '+format,()=>{expect(parseSchedule(format,importExample('cronograma',format)).erros).toEqual([])})
  it('modelo fluxo '+format,async()=>{expect((await parseEntries(format,importExample('fluxo-caixa',format))).erros).toEqual([])})
 }
 it('fluxo rejeita valor vazio',async()=>{expect((await parseEntries('JSON',JSON.stringify([{data:'2026-09-17',descricao:'Teste',valor:null}]))).erros).toHaveLength(1)})
 for(const format of ['JSON','TSV'] as const)it('modelo despesas '+format,()=>{
  const parsed=parseExpenseImport(format,importExample('despesas',format))
  expect(parsed.erros).toEqual([])
  expect(parsed.registros).toHaveLength(4)
  const item=parsed.registros.find(r=>r.tipo==='ITEM')
  expect(item).toMatchObject({valor_unitario:1.8333,valor_total:5500,quantidade:3000})
 })
 it('rejeita referência inexistente e campos antigos',()=>{
  const rows=JSON.parse(importExample('despesas','JSON'))
  rows[1].despesa_ref='inexistente'
  expect(parseExpenseImport('JSON',JSON.stringify(rows)).erros.length).toBeGreaterThan(0)
  rows[0].classificacao='NOTA_FISCAL'
  expect(parseExpenseImport('JSON',JSON.stringify(rows)).erros.length).toBeGreaterThan(0)
 })
 it('valida URL e listas JSON',()=>{
  const rows=JSON.parse(importExample('despesas','JSON'))
  rows[1].links_cotacao=['invalid']
  expect(parseExpenseImport('JSON',JSON.stringify(rows)).erros.length).toBeGreaterThan(0)
  rows[1].links_cotacao='loja a,loja b'
  expect(parseExpenseImport('JSON',JSON.stringify(rows)).erros.length).toBeGreaterThan(0)
 })
 it('preserva desconto global e total manual na fonte SQL',()=>{
  expect(expenseItemTotalSql()).toContain('valor_total_manual')
  expect(expenseTotalSql()).toContain('valor_desconto')
 })
 it('XLSX preserva precisão, ausência de quantidade e vínculo pai',async()=>{
  const item={id:3,despesa_id:2,descricao:'Tijolos',quantidade:null,unidade:null,observacao:null,valor_unitario:'1.8333',valor_desconto:'0',valor_total:'5500',valor_total_manual:true,links_cotacao:[{id:1,url:'https://example.com'}]}
  const report:ExpenseReport={projeto:{nome:'Teste',cidade:null,estado:null},itens_sem_despesa:[],despesas:[{id:2,descricao:'Materiais',etapa_id:null,etapa:null,status:'PENDENTE',fornecedor:null,nome_contato_fornecedor:null,contato_fornecedor:null,forma_pagamento:null,data_pagamento:null,numero_nota_fiscal:null,data_emissao:null,data_agendamento:null,data_entrega:null,observacao:null,valor_desconto:'25',valor_total:'5475',documento:'Orçamento',itens:[item],documentos:[]}]}
  const buffer=await createExpenseWorkbook(1,report)
  const book=new ExcelJS.Workbook();await book.xlsx.load(buffer)
  expect(book.worksheets.map(s=>s.name)).toEqual(['Despesas'])
  const sheet=book.getWorksheet('Despesas')!
  expect(sheet.getCell('A3').value).toBe('Materiais')
  expect(sheet.getCell('G3').value).toBe(5475)
  expect(sheet.getCell('A6').value).toBe('Tijolos')
  expect(sheet.getCell('B6').value).toBeNull()
  expect(sheet.getCell('D6').value).toBe(1.8333)
  expect(sheet.getCell('D6').numFmt).toBe('R$ #,##0.0000')
  expect(sheet.getCell('F6').value).toBe(5500)
  const crud=expenseCrudProjection(report)
  expect(crud.despesas[0]).toMatchObject({descricao:'Materiais',valor_total:'5475',quantidade_documentos:0})
  expect(crud.despesas[0]!.itens[0]).toMatchObject({descricao:'Tijolos',valor_total:'5500',ordem:0})
 })
})

it('summarizes only filtered parent expenses by payment state',()=>{
 const report:ExpenseReport={projeto:{nome:'Teste',cidade:null,estado:null},itens_sem_despesa:[],despesas:[
  {id:1,descricao:'Aguardando',etapa_id:null,etapa:null,status:'PENDENTE',fornecedor:null,nome_contato_fornecedor:null,contato_fornecedor:null,forma_pagamento:null,data_pagamento:null,numero_nota_fiscal:null,data_emissao:null,data_agendamento:null,data_entrega:null,observacao:null,valor_desconto:null,valor_total:'100',documento:'Orçamento',itens:[],documentos:[]},
  {id:2,descricao:'Pago',etapa_id:null,etapa:null,status:'CONCLUIDO',fornecedor:null,nome_contato_fornecedor:null,contato_fornecedor:null,forma_pagamento:null,data_pagamento:null,numero_nota_fiscal:null,data_emissao:null,data_agendamento:null,data_entrega:null,observacao:null,valor_desconto:null,valor_total:'250',documento:'Orçamento',itens:[],documentos:[]},
 ]}
 expect(expenseFinancialSummary(report)).toEqual({aguardando:100,pago:250})
})
