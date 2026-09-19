import { expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import { query } from '../src/config/database.js'
import { getSchedule } from '../src/modules/etapas/schedule.service.js'
import { getScheduleReport,createScheduleWorkbook,createCashFlowWorkbook } from '../src/modules/relatorios/planning-report.service.js'
vi.mock('../src/config/database.js',()=>({query:vi.fn()}))
const parent={id:1,parent_id:null,nome:'Fundação',descricao:'Execução',cor:'#8d765a',etapa_pai:null,ordem:1,etapa:'ETAPA 1 - Fundação',tipo:'Etapa',data_inicio_previsto:'2026-09-01',data_fim_previsto:null,valor_previsto:'100',data_inicio:null,data_fim:null,valor_pago:'25'}
const child={...parent,id:2,parent_id:1,nome:'Concreto',cor:'#167a45',ordem:0,valor_previsto:'60',valor_pago:'20'}
it('uses identical stage data for tree, options and ordered export without changing totals',async()=>{
 vi.mocked(query).mockImplementation(async sql=>({rows:String(sql).includes('SELECT nome,cidade,estado')?[{nome:'Obra',cidade:null,estado:null}]:[parent,child],rowCount:2,command:'SELECT',oid:0,fields:[]}) as never)
 const data=await getSchedule(1)
 const report=await getScheduleReport(1,{planned:false})
 expect(report.rows).toEqual(data.arvore.flatMap(({subitens,...p})=>[p,...subitens]))
 expect(data.etapas).toEqual(report.rows)
 const book=new ExcelJS.Workbook();await book.xlsx.load(await createScheduleWorkbook(report))
 const sheet=book.worksheets[0]!
 expect(sheet.rowCount).toBe(4);expect(sheet.columnCount).toBe(5)
 expect(sheet.getCell('C1').value).toBe('Início Real')
 expect(sheet.getCell('D1').value).toBe('Fim Real')
 expect(sheet.getCell('B2').value).toBe('ETAPA 1 - Fundação\nExecução')
 expect(sheet.getCell('B3').value).toBe('    Concreto')
 expect(sheet.getCell('B2').border.left?.color?.argb).toBe('FF8D765A')
 expect(sheet.getCell('B3').border.left?.color?.argb).toBe('FF8D765A')
 expect(sheet.getCell('E2').value).toBe(25)
 expect(sheet.getCell('B4').value).toBe('Total Valor Pago')
 const full=new ExcelJS.Workbook();await full.xlsx.load(await createScheduleWorkbook({...report,planned:true}))
 expect(full.worksheets[0]!.getCell('E2').value).toBe(100)
 expect(full.worksheets[0]!.getCell('C1').value).toBe('Início Previsto')
 expect(full.worksheets[0]!.getCell('F1').value).toBe('Início Real')
})
it('exports only the five parent cash-flow columns including supplier',async()=>{
 const report={projectId:1,project:{nome:'Obra',cidade:null,estado:null},rows:[{origem_id:3,data:'2026-09-17',descricao:'Cimento',fornecedor:'São João',detalhes:'Não exportar',valor:'-120',provisionado:false,origem:'PAGAMENTO'}]}
 const book=new ExcelJS.Workbook();await book.xlsx.load(await createCashFlowWorkbook(report))
 expect(book.worksheets.map(s=>s.name)).toEqual(['Fluxo de Caixa'])
 expect(book.worksheets[0]!.columnCount).toBe(5)
 expect(book.worksheets[0]!.getRow(2).values).toEqual([undefined,new Date('2026-09-17T12:00:00Z'),'Cimento','São João',-120,'Não'])
 expect(book.worksheets[0]!.getCell('B3').value).toBe('Total do Fluxo de Caixa')
 expect(book.worksheets[0]!.getCell('D3').value).toBe(-120)
})
