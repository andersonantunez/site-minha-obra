import { Download, FileJson, Upload, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { ErrorNotice } from './Ui'

type ImportResult = { projeto: { id: number; nome: string }; avisos: string[] }

export function ProjectBackupActions({ projectId }: { projectId: string }) {
  const [open,setOpen]=useState(false)
  const [file,setFile]=useState<File|null>(null)
  const [projectName,setProjectName]=useState('')
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(false)
  const [result,setResult]=useState<ImportResult|null>(null)

  const selectFile=async(selected?:File)=>{
    setFile(null);setProjectName('');setResult(null);setError('')
    if(!selected)return
    if(!selected.name.toLowerCase().endsWith('.json')){setError('Selecione um arquivo com extensão .json.');return}
    try{
      const parsed=JSON.parse(await selected.text()) as {backup?:{version?:unknown;project?:{nome?:unknown}}}
      if(parsed.backup?.version!=='1.0')throw new Error('Versão incompatível. Este sistema aceita backups na versão 1.0.')
      if(typeof parsed.backup.project?.nome!=='string'||!parsed.backup.project.nome.trim())throw new Error('O arquivo não contém os dados obrigatórios do projeto.')
      setFile(selected);setProjectName(parsed.backup.project.nome)
    }catch(reason){setError(reason instanceof SyntaxError?'O arquivo não contém um JSON válido.':reason instanceof Error?reason.message:'Não foi possível validar o arquivo.')}
  }

  const importBackup=async()=>{
    if(!file)return
    if(!window.confirm(`Uma nova obra será criada a partir do backup de “${projectName}”. Deseja continuar?`))return
    const form=new FormData();form.set('arquivo',file)
    setLoading(true);setError('')
    try{setResult(await api<ImportResult>(`/projetos/${projectId}/backup/importar`,{method:'POST',body:form}))}
    catch(reason){setError(reason instanceof Error?reason.message:'Não foi possível importar o projeto.')}
    finally{setLoading(false)}
  }

  return <div className="heading-actions project-backup-actions">
    <a className="app-button" href={`/api/projetos/${projectId}/backup`} download><Download/>Exportar projeto</a>
    <button type="button" className="app-button" onClick={()=>{setOpen(true);setError('');setResult(null)}}><Upload/>Importar projeto</button>
    {open&&<div className="dialog-backdrop"><section className="dialog project-backup-dialog" role="dialog" aria-modal="true" aria-labelledby="project-backup-title"><header><div><small>IMPORTAÇÃO DE BACKUP</small><h2 id="project-backup-title">Importar projeto</h2></div><button type="button" onClick={()=>setOpen(false)} aria-label="Fechar"><X/></button></header>
      <div className="project-backup-content">
        {error&&<ErrorNotice message={error}/>} {!result?<><p>Selecione um backup JSON gerado pelo MinhaObra. A importação criará uma nova obra e não alterará o projeto atual.</p><label className="drop-file"><FileJson/><strong>{file?.name||'Escolha um arquivo .json'}</strong><span>{projectName?`Projeto identificado: ${projectName}`:'O conteúdo será validado antes da importação.'}</span><span className="app-button">Escolher arquivo</span><input type="file" accept="application/json,.json" onChange={event=>void selectFile(event.target.files?.[0])}/></label><footer className="form-actions"><button type="button" className="app-button" onClick={()=>setOpen(false)}>Cancelar</button><button type="button" className="app-button primary" disabled={!file||loading} onClick={()=>void importBackup()}>{loading?'Importando…':'Criar nova obra'}</button></footer></>:<div className="project-backup-success"><FileJson/><strong>Obra criada com sucesso</strong><p>{result.projeto.nome}</p>{result.avisos.length>0&&<div><strong>Avisos da importação</strong>{result.avisos.map((warning,index)=><small key={index}>{warning}</small>)}</div>}<footer className="form-actions"><button type="button" className="app-button" onClick={()=>setOpen(false)}>Fechar</button><Link className="app-button primary" to={`/app/projetos/${result.projeto.id}`}>Acessar projeto</Link></footer></div>}
      </div>
    </section></div>}
  </div>
}
