import { FileJson, FileSpreadsheet, X } from 'lucide-react'
import { useState } from 'react'
import { api, jsonBody } from '../../lib/api'
import { ErrorNotice } from '../Ui'

type Props = { endpoint: string; onClose: () => void; onComplete: () => void }

const tsvExample = `Descrição\tQuantidade\tUnidade\tValor unitário\tValor desconto\tValor total
Tubo Pvc Esgoto Sn Dn 40mm X 6m\t8\tPeças\t42,321\t\t338,57
Joelho Esgoto Sn 90g Bolsa Curta Dn 40mm\t20\tPeças\t1,818\t\t36,35`

const jsonExample = `[
  {
    "descricao": "Tubo Pvc Esgoto Sn Dn 40mm X 6m",
    "quantidade": 8,
    "unidade": "Peças",
    "valor_unitario": "42,321",
    "valor_desconto": null,
    "valor_total": "338,57"
  }
]`

export function ExpenseItemsImportDialog({ endpoint, onClose, onComplete }: Props) {
  const [format, setFormat] = useState<'TSV' | 'JSON'>('TSV')
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const example = format === 'TSV' ? tsvExample : jsonExample

  const importItems = async () => {
    setLoading(true); setError('')
    try {
      await api(`${endpoint}/confirmar`, { method: 'POST', ...jsonBody({ formato: format, conteudo: content }) })
      onComplete()
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Não foi possível importar os itens.')
    } finally { setLoading(false) }
  }

  return <div className="dialog-backdrop"><section className="dialog import-dialog" role="dialog" aria-modal="true" aria-labelledby="expense-items-import-title"><header><div><small>IMPORTAÇÃO DE ITENS</small><h2 id="expense-items-import-title">Importar itens da despesa</h2></div><button onClick={onClose} aria-label="Fechar"><X /></button></header>
    {error && <ErrorNotice message={error} />}
    <div className="import-start"><div className="format-choice"><button type="button" className={format === 'TSV' ? 'selected' : ''} onClick={() => setFormat('TSV')}><FileSpreadsheet /><strong>TSV</strong><small>Colunas separadas por tabulação</small></button><button type="button" className={format === 'JSON' ? 'selected' : ''} onClick={() => setFormat('JSON')}><FileJson /><strong>JSON</strong><small>Lista estruturada de itens</small></button></div><p className="import-items-columns"><strong>Campos aceitos:</strong> Descrição, Quantidade, Unidade, Valor unitário, Valor desconto e Valor total. Deixe o total vazio para calculá-lo automaticamente.</p><label className="field import-items-textarea"><span>Cole o conteúdo em {format}</span><textarea value={content} onChange={(event) => { setContent(event.target.value); setError('') }} placeholder={example} rows={12} spellCheck={false} /></label><footer className="form-actions"><button type="button" className="app-button" onClick={onClose}>Cancelar</button><button type="button" className="app-button primary" disabled={!content.trim() || loading} onClick={() => void importItems()}>{loading ? 'Importando…' : 'Importar itens'}</button></footer></div>
  </section></div>
}
