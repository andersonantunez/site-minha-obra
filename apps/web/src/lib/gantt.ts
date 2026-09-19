import type { ScheduleItem } from './schedule'

const DAY=86_400_000
export function localToday(){
 const now=new Date()
 return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
}
export function dateDay(value:string|null):number|null{
 if(!value)return null
 const date=value.slice(0,10)
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null
 const time=Date.parse(`${date}T00:00:00Z`)
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===date?time/DAY:null
}
export function dayDate(day:number){return new Date(day*DAY).toISOString().slice(0,10)}
export function activityState(row:ScheduleItem,today:number){
 const plannedStart=dateDay(row.data_inicio_previsto),plannedEnd=dateDay(row.data_fim_previsto)
 const actualStart=dateDay(row.data_inicio),actualEnd=dateDay(row.data_fim)
 const invalid=Boolean((plannedStart!==null&&plannedEnd!==null&&plannedEnd<plannedStart)||(actualStart!==null&&actualEnd!==null&&actualEnd<actualStart)||(actualStart!==null&&actualStart>today)||(actualEnd!==null&&(actualStart===null||actualEnd>today)))
 const startDelay=plannedStart!==null?Math.max(0,(actualStart??today)-plannedStart):0
 const endDelay=plannedEnd!==null&&actualStart!==null?Math.max(0,(actualEnd??today)-plannedEnd):0
 const completed=actualStart!==null&&actualEnd!==null&&!invalid
 const ongoing=actualStart!==null&&actualEnd===null&&!invalid
 const delay=completed?endDelay:Math.max(startDelay,endDelay)
 const early=completed&&plannedEnd!==null?Math.max(0,plannedEnd-actualEnd):0
 const label=invalid?'Datas inconsistentes':completed?endDelay?'Concluída com atraso':early?'Concluída antes do prazo':plannedEnd!==null?'Concluída no prazo':'Concluída':ongoing?delay?'Em andamento com atraso':'Em andamento':delay?'Não iniciada com atraso':'Não iniciada'
 const delayBasis=completed||endDelay>=startDelay?'fim':'início'
 return {plannedStart,plannedEnd,actualStart,actualEnd,completed,ongoing,late:!invalid&&delay>0,delay:invalid?0:delay,startDelay,endDelay,early,label,invalid,delayBasis}
}
export function ganttRange(rows:ScheduleItem[],today:number){
 const days=rows.flatMap(row=>[row.data_inicio_previsto,row.data_fim_previsto,row.data_inicio,row.data_fim].map(dateDay)).filter((day):day is number=>day!==null)
 const first=new Date(Math.min(today,...days)*DAY),last=new Date(Math.max(today,...days)*DAY)
 const start=Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),1)/DAY
 const end=Date.UTC(last.getUTCFullYear(),last.getUTCMonth()+1,1)/DAY
 const months:{day:number;end:number;label:string}[]=[]
 const cursor=new Date(start*DAY)
 while(cursor.getTime()/DAY<end){
  const day=cursor.getTime()/DAY,label=cursor.toLocaleDateString('pt-BR',{month:'short',year:'numeric',timeZone:'UTC'})
  cursor.setUTCMonth(cursor.getUTCMonth()+1)
  months.push({day,end:cursor.getTime()/DAY,label})
 }
 return {start,end,months}
}
