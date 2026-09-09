import { FileDown, FileSpreadsheet, X } from 'lucide-react'
import { useState } from 'react'

export function ExportAction({ title, pdfUrl, xlsxUrl }: { title: string; pdfUrl: string; xlsxUrl: string }) {
  const [open,setOpen]=useState(false)
  return <>
    <button type="button" className="app-button" onClick={()=>setOpen(true)}><FileDown />Exportar</button>
    {open&&<div className="dialog-backdrop"><section className="dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title"><header><div><small>EXPORTAÇÃO</small><h2 id="export-dialog-title">Exportar {title}</h2></div><button onClick={()=>setOpen(false)} aria-label="Fechar"><X /></button></header><div className="export-options"><p>Escolha o formato do relatório completo.</p><a href={pdfUrl} target="_blank" rel="noreferrer" onClick={()=>setOpen(false)}><FileDown /><span><strong>PDF</strong><small>Documento pronto para visualizar e imprimir.</small></span></a><a href={xlsxUrl} onClick={()=>setOpen(false)}><FileSpreadsheet /><span><strong>XLSX</strong><small>Planilha para consultar e trabalhar com os dados.</small></span></a></div><footer className="form-actions"><button type="button" className="app-button" onClick={()=>setOpen(false)}>Cancelar</button></footer></section></div>}
  </>
}
