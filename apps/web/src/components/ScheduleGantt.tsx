import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ErrorNotice, EmptyState } from './Ui'
import { scheduleQueryOptions, type ScheduleItem } from '../lib/schedule'
import { activityState, dateDay, dayDate, ganttRange, localToday } from '../lib/gantt'
import { formatDate } from '../lib/format'

export function ScheduleGantt({projectId}:{projectId:string}){
 const {data,error,isPending}=useQuery(scheduleQueryOptions(projectId))
 const [expanded,setExpanded]=useState<Set<number>>(new Set())
 const [scale,setScale]=useState<'month'|'week'>('month')
 const [selected,setSelected]=useState<ScheduleItem|null>(null)
 const [todayDate,setTodayDate]=useState(localToday)
 const viewport=useRef<HTMLDivElement>(null)
 useEffect(()=>{
  const refresh=()=>setTodayDate(localToday())
  const timer=window.setInterval(refresh,60_000)
  window.addEventListener('focus',refresh)
  return ()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh)}
 },[])
 if(error)return <section className="dashboard-panel gantt-panel"><h2>Execução da obra</h2><ErrorNotice message={error.message}/></section>
 if(isPending)return <section className="dashboard-panel gantt-panel" aria-busy="true"><h2>Execução da obra</h2><p>Carregando cronograma…</p></section>
 if(!data?.arvore.length)return <section className="dashboard-panel gantt-panel"><h2>Execução da obra</h2><EmptyState title="Cronograma não cadastrado" description="Cadastre etapas e datas no Cronograma para acompanhar previsto e realizado."/></section>

 const today=dateDay(todayDate)!,range=ganttRange(data.etapas,today)
 const pixels=scale==='week'?12:Math.max(4,960/(range.end-range.start))
 const width=(range.end-range.start)*pixels,position=(day:number)=>(day-range.start)*pixels
 const rowGrid={gridTemplateColumns:`var(--gantt-name-width) ${width}px`}
 const timelineGrid={width:`calc(var(--gantt-name-width) + ${width}px)`}
 const weekDays=scale==='week'?Array.from({length:Math.ceil(range.end-range.start)},(_,index)=>range.start+index).filter(day=>new Date(day*86_400_000).getUTCDay()===1):[]
 const activities=data.arvore.flatMap(stage=>stage.subitens.length?stage.subitens:[stage])
 const states=activities.map(row=>activityState(row,today))
 const indicators=[['Concluídas',states.filter(state=>state.completed).length],['Em andamento',states.filter(state=>state.ongoing).length],['Atrasadas',states.filter(state=>state.late).length],['Não iniciadas',states.filter(state=>!state.completed&&!state.ongoing&&!state.invalid).length]]
 const rows=data.arvore.flatMap(stage=>[{row:stage,color:stage.cor,children:stage.subitens.length},...(expanded.has(stage.id)?stage.subitens.map(row=>({row,color:stage.cor,children:0})):[])])
 const toggle=(id:number)=>setExpanded(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next})
 const gridLines=()=> <>{weekDays.map(day=><i key={`week-${day}`} className="gantt-week-line" style={{left:position(day)}} aria-hidden="true"/>)}{range.months.map(month=><i key={month.day} className="gantt-month-line" style={{left:position(month.day)}} aria-hidden="true"/>)}</>
 const todayLine=()=> <i className="gantt-today-line" style={{left:position(today)}} aria-hidden="true"/>
 const details=(row:ScheduleItem)=>{
  const state=activityState(row,today)
  return [`Etapa/Subitem: ${row.nome}`,`Início previsto: ${formatDate(row.data_inicio_previsto)}`,`Fim previsto: ${formatDate(row.data_fim_previsto)}`,`Início real: ${formatDate(row.data_inicio)}`,`Fim real: ${formatDate(row.data_fim)}`,`Situação: ${state.label}`,...(state.delay?[`Atraso: ${state.delay} dia(s)`]:[]),...(state.early?[`Antecipação: ${state.early} dia(s)`]:[])].join('\n')
 }
 const active=selected?data.etapas.find(row=>row.id===selected.id):null
 const activeState=active?activityState(active,today):null
 return <section className="dashboard-panel gantt-panel">
  <header className="gantt-heading"><div><span>PLANEJAMENTO × EXECUÇÃO</span><h2>Cronograma da obra</h2><p>Compare períodos previstos e reais; expanda as etapas para identificar os subitens.</p></div><div className="gantt-controls"><label>Escala <select value={scale} onChange={event=>setScale(event.target.value as 'month'|'week')}><option value="month">Mês</option><option value="week">Semana</option></select></label><button className="app-button" onClick={()=>viewport.current?.scrollTo({left:Math.max(0,position(today)-((viewport.current.clientWidth-(viewport.current.querySelector('.gantt-name')?.getBoundingClientRect().width??280))/2)),behavior:'smooth'})}>Hoje</button><button className="app-button" onClick={()=>setExpanded(expanded.size?new Set():new Set(data.arvore.map(stage=>stage.id)))}>{expanded.size?'Recolher etapas':'Expandir etapas'}</button></div></header>
  <div className="gantt-indicators">{indicators.map(([label,value])=><div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
  <p className="gantt-counter-note">Indicadores consideram subitens e etapas sem subitens. Atrasadas também podem estar concluídas ou em andamento.</p>
  <div className="gantt-legend"><span><i className="gantt-legend-planned"/>P · Previsto</span><span><i className="gantt-legend-actual"/>R · Realizado</span><span>⚠ Atrasado</span><span>● Em andamento até hoje</span><span>✓ Concluído</span></div>
  <div className="gantt-scroll" ref={viewport} tabIndex={0} role="region" aria-label="Linha do tempo do Cronograma, com rolagem horizontal">
   <div className="gantt-grid" style={timelineGrid}>
    <div className="gantt-axis gantt-row" style={rowGrid}><div className="gantt-name">Etapa / Subitem</div><div className="gantt-axis-time">{range.months.map(month=><div className="gantt-month" key={month.day} style={{left:position(month.day),width:(month.end-month.day)*pixels}}>{month.label}</div>)}{weekDays.map(day=><span className="gantt-week" key={day} style={{left:position(day)}}>{formatDate(dayDate(day)).slice(0,5)}</span>)}{todayLine()}<span className="gantt-today-label" style={{left:position(today)}}>Hoje · {formatDate(todayDate)}</span></div></div>
    {rows.map(({row,color,children})=>{
     const state=activityState(row,today),child=row.parent_id!==null
     const planned=state.plannedStart!==null&&state.plannedEnd!==null&&state.plannedEnd>=state.plannedStart
     const actual=state.actualStart!==null&&state.actualStart<=today&&(state.actualEnd===null||(state.actualEnd>=state.actualStart&&state.actualEnd<=today))
     return <div key={row.id} className={`gantt-row ${child?'gantt-child':'gantt-parent'}`} style={{...rowGrid,'--gantt-color':color} as CSSProperties}>
      <div className="gantt-name">{!child&&children>0?<button className="gantt-expand" onClick={()=>toggle(row.id)} aria-label={`${expanded.has(row.id)?'Recolher':'Expandir'} ${row.nome}`} aria-expanded={expanded.has(row.id)}>{expanded.has(row.id)?<ChevronDown/>:<ChevronRight/>}</button>:<span className="gantt-indent"/>}<button className="gantt-name-detail" onClick={()=>setSelected(row)} title={details(row)}><strong>{!child?`${row.ordem}. `:''}{row.nome}</strong><small>{state.invalid?'⚠ ':state.late?'⚠ ':state.completed?'✓ ':state.ongoing?'● ':'○ '}{state.label}{state.delay?` · ${state.delay}d`:state.early?` · ${state.early}d de antecipação`:''}</small></button></div>
      <div className="gantt-timeline">{gridLines()}{todayLine()}
       {planned?<button className={`gantt-bar gantt-planned ${state.late&&!actual?'gantt-late':''}`} style={{left:position(state.plannedStart!),width:(state.plannedEnd!-state.plannedStart!+1)*pixels}} title={details(row)} aria-label={`Previsto: ${details(row)}`} onClick={()=>setSelected(row)}>P{state.late&&!actual?' ⚠':''}</button>:<span className="gantt-no-dates">Sem período previsto completo</span>}
       {actual&&<button className={`gantt-bar gantt-actual ${state.ongoing?'gantt-ongoing':''} ${state.late?'gantt-late':''}`} style={{left:position(state.actualStart!),width:((state.actualEnd??today)-state.actualStart!+1)*pixels}} title={details(row)} aria-label={`Realizado: ${details(row)}`} onClick={()=>setSelected(row)}>R{state.late?' ⚠':state.completed?' ✓':''}{state.ongoing&&<span className="gantt-progress-dot"/>}</button>}
      </div>
     </div>
    })}
   </div>
  </div>
  {active&&activeState&&<aside className="gantt-details" aria-live="polite"><button className="gantt-detail-close" onClick={()=>setSelected(null)} aria-label="Fechar detalhes da atividade"><X/></button><h3>{active.nome}</h3><p>{activeState.label}</p><dl><div><dt>Início previsto</dt><dd>{formatDate(active.data_inicio_previsto)}</dd></div><div><dt>Fim previsto</dt><dd>{formatDate(active.data_fim_previsto)}</dd></div><div><dt>Início real</dt><dd>{formatDate(active.data_inicio)}</dd></div><div><dt>Fim real</dt><dd>{formatDate(active.data_fim)}</dd></div>{activeState.delay>0&&<div><dt>Atraso</dt><dd>{activeState.delay} dias{` em relação ao ${activeState.delayBasis} previsto`}</dd></div>}{activeState.early>0&&<div><dt>Antecipação</dt><dd>{activeState.early} dias</dd></div>}</dl>{activeState.ongoing&&<small>O período realizado vai até hoje; o fim real permanece não informado.</small>}{activeState.invalid&&<small>Confira as datas desta atividade no Cronograma.</small>}</aside>}
 </section>
}
