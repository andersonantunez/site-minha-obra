import type ExcelJS from 'exceljs'

export const reportMoney = (value: string | number | null, decimals = 2) => value === null ? '—' : new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', minimumFractionDigits:decimals, maximumFractionDigits:decimals }).format(Number(value))
export const reportDate = (value: string | Date | null) => !value ? '—' : (value instanceof Date ? value.toISOString() : String(value)).slice(0,10).split('-').reverse().join('/')
export const spreadsheetNumber = (value: string | number | null) => value === null ? null : Number(value)
export const spreadsheetDate = (value: string | Date | null) => !value ? null : new Date(`${(value instanceof Date ? value.toISOString() : String(value)).slice(0,10)}T12:00:00Z`)
export function styleReportSheet(sheet: ExcelJS.Worksheet) {
  sheet.getRow(1).height=24
  sheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF303732'}};cell.alignment={vertical:'middle',horizontal:'center'}})
  sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:sheet.columnCount}}
  sheet.eachRow((row,index)=>{if(index>1)row.alignment={vertical:'top',wrapText:true}})
}
