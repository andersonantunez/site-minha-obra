import { Download, FileJson, FileSpreadsheet, Upload, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { api, jsonBody } from '../../lib/api'
import { ErrorNotice } from '../Ui'

type Props = { endpoint: string; entityName: string; onClose: () => void; onComplete: () => void }
type Preview = { registros: Record<string, unknown>[]; erros: { linha: number; erros: string[] }[]; total: number }

const columnLabels: Record<string, string> = {
  referencia:'Referência', despesa_ref:'Despesa', etapa:'Etapa', valor_unitario:'Valor unitário', valor_desconto:'Valor desconto', valor_total:'Valor total', categorias:'Categorias', titulo:'Título', url:'URL', links_cotacao:'Links de cotação', cor:'Cor', data: 'Data', detalhes: 'Detalhes', competencia: 'Competência', ordem: 'Ordem', tipo:'Tipo', etapa_pai:'Etapa pai', nome:'Etapa / subitem', data_inicio_previsto:'Início previsto', data_fim_previsto:'Fim previsto', data_inicio:'Data de início', data_fim:'Data de fim', valor_previsto:'Valor orçado', data_pagamento: 'Data pagamento', etapa_id: 'Etapa', quantidade: 'Qtde.', unidade: 'Unidade', descricao: 'Descrição', fornecedor: 'Fornecedor', valor: 'Valor', status: 'Status', data_agendamento: 'Agendamento', data_entrega: 'Entrega', forma_pagamento: 'Forma de pagto.', observacao: 'Observações',
}
const preferredColumns = ['tipo', 'referencia', 'despesa_ref', 'descricao', 'etapa', 'status', 'fornecedor', 'quantidade', 'unidade', 'valor_unitario', 'valor_desconto', 'valor_total', 'observacao', 'titulo', 'url', 'categorias', 'links_cotacao']
const cashFlowColumns = ['data', 'descricao', 'detalhes', 'valor']
const scheduleColumns=['tipo','etapa_pai','ordem','nome','descricao','data_inicio_previsto','data_fim_previsto','valor_previsto','data_inicio','data_fim','cor']

export function ImportDialog({ endpoint, entityName, onClose, onComplete }: Props) {
  const [format, setFormat] = useState<'TSV'|'JSON'>('TSV')
  const [mode, setMode] = useState<'ACRESCENTAR'|'SUBSTITUIR'>('ACRESCENTAR')
  const [content, setContent] = useState('')
  const [filename, setFilename] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const normalizedEntity = entityName.toLowerCase()
  const isCashFlow = normalizedEntity.includes('fluxo de caixa')
  const isSchedule=normalizedEntity.includes('cronograma')
  const columns = useMemo(() => preview ? (isCashFlow ? cashFlowColumns : isSchedule?scheduleColumns:preferredColumns).filter((column) => preview.registros.some((record) => column in record)) : [], [isCashFlow,isSchedule, preview])

  const selectFile = async (file?: File) => {
    if (!file) return
    const inferred = file.name.toLowerCase().endsWith('.json') ? 'JSON' : 'TSV'
    setFormat(inferred); setFilename(file.name); setContent(await file.text()); setPreview(null); setError('')
  }
  const requestPreview = async () => {
    setLoading(true); setError('')
    try { setPreview(await api<Preview>(`${endpoint}/importacao/preview`, { method: 'POST', ...jsonBody({ formato: format, conteudo: content }) })) }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Falha ao validar arquivo.') }
    finally { setLoading(false) }
  }
  const confirm = async () => {
    setLoading(true); setError('')
    try { await api(`${endpoint}/importacao/confirmar`, { method: 'POST', ...jsonBody({ formato: format, conteudo: content, modo: mode, nomeArquivo: filename }) }); onComplete() }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Falha ao importar arquivo.') }
    finally { setLoading(false) }
  }

  return <div className="dialog-backdrop"><section className="dialog import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-dialog-title"><header><div><small>IMPORTAÇÃO ASSISTIDA</small><h2 id="import-dialog-title">Importar {entityName}</h2></div><button onClick={onClose} aria-label="Fechar"><X /></button></header>
    {error && <ErrorNotice message={error} />}
    {!preview ? <div className="import-start"><div className="format-choice"><button className={format==='TSV'?'selected':''} onClick={() => setFormat('TSV')}><FileSpreadsheet /><strong>TSV</strong><small>Colunas separadas por tabulação</small></button><button className={format==='JSON'?'selected':''} onClick={() => setFormat('JSON')}><FileJson /><strong>JSON</strong><small>Lista estruturada de registros</small></button></div><div className="sample-downloads"><span>Arquivos de exemplo</span><a href={`/api${endpoint}/importacao/modelo?formato=TSV`} download><Download /> TSV</a><a href={`/api${endpoint}/importacao/modelo?formato=JSON`} download><Download /> JSON</a></div><div className="file-picker-area"><label className="drop-file"><Upload /><strong>{filename || `Escolha um arquivo .${format.toLowerCase()}`}</strong><span>Arraste ou clique para selecionar. O conteúdo será validado antes da importação.</span><span className="app-button">Escolher ficheiro</span><input type="file" accept={format==='TSV'?'.tsv,.txt':'application/json,.json'} onChange={(event) => void selectFile(event.target.files?.[0])} /></label></div><footer className="form-actions"><button className="app-button" onClick={onClose}>Cancelar</button><button className="app-button primary" disabled={!content || loading} onClick={() => void requestPreview()}>{loading?'Validando…':'Validar e visualizar'}</button></footer></div>
    : <div className="import-preview"><div className={preview.erros.length?'preview-summary error':'preview-summary'}><div><strong>{preview.total}</strong><span>registros encontrados</span></div><b>{preview.erros.length ? `${preview.erros.length} com erro` : 'Todos válidos'}</b></div>{preview.erros.length ? <div className="import-errors">{preview.erros.slice(0,12).map((item) => <p key={item.linha}><strong>Linha {item.linha}</strong>{item.erros.join(' · ')}</p>)}</div> : <><fieldset><legend>Como deseja aplicar?</legend><label><input type="radio" checked={mode==='ACRESCENTAR'} onChange={() => setMode('ACRESCENTAR')} /> <span><strong>Acrescentar</strong><small>Manter os registros atuais.</small></span></label><label><input type="radio" checked={mode==='SUBSTITUIR'} onChange={() => setMode('SUBSTITUIR')} /> <span><strong>Substituir</strong><small>Arquivar os registros atuais e inserir estes dados.</small></span></label></fieldset><div className="preview-table-meta"><strong>Prévia dos primeiros {Math.min(preview.registros.length, 20)} registros</strong><span>Role a tabela para ver todas as colunas</span></div><div className="preview-table" tabIndex={0} aria-label="Prévia dos registros importados"><table><thead><tr>{columns.map((column) => <th key={column}>{columnLabels[column] || column.replaceAll('_',' ')}</th>)}</tr></thead><tbody>{preview.registros.slice(0,20).map((row,index) => <tr key={index}>{columns.map((column) => <td key={column}>{Array.isArray(row[column]) ? JSON.stringify(row[column]) : String(row[column] ?? '—')}</td>)}</tr>)}</tbody></table></div></>}<footer className="form-actions"><button className="app-button" onClick={() => setPreview(null)}>Voltar</button><button className="app-button primary" disabled={Boolean(preview.erros.length)||loading} onClick={() => void confirm()}>{loading?'Importando…':'Confirmar importação'}</button></footer></div>}
  </section></div>
}
