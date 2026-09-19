import {expect,it} from 'vitest'
import {activityState,dateDay,ganttRange} from './gantt'
import type {ScheduleItem} from './schedule'
const today=dateDay('2026-09-17')!
const base:ScheduleItem={id:1,parent_id:null,nome:'Fundação',descricao:null,cor:'#ba3f4a',ordem:1,valor_previsto:'100',valor_pago:'0',data_inicio_previsto:'2026-09-10',data_fim_previsto:'2026-09-25',data_inicio:null,data_fim:null}
it('identifies an overdue unstarted activity without creating actual dates',()=>{
 const state=activityState(base,today)
 expect(state.label).toBe('Não iniciada com atraso');expect(state.delay).toBe(7)
 expect(state.actualStart).toBeNull();expect(state.actualEnd).toBeNull()
})
it('uses real completion to distinguish early, on-time and late completion',()=>{
 expect(activityState({...base,data_inicio:'2026-09-10',data_fim:'2026-09-14'},today)).toMatchObject({completed:true,late:false,early:11})
 const laterToday=dateDay('2026-10-01')!
 expect(activityState({...base,data_inicio:'2026-09-10',data_fim:'2026-09-25'},laterToday).label).toBe('Concluída no prazo')
 expect(activityState({...base,data_inicio:'2026-09-10',data_fim:'2026-09-30'},laterToday)).toMatchObject({completed:true,late:true,delay:5})
})
it('preserves an open real end and calculates ongoing start and end delays',()=>{
 const state=activityState({...base,data_inicio:'2026-09-12'},today)
 expect(state).toMatchObject({ongoing:true,actualEnd:null,startDelay:2,endDelay:0,delay:2})
 expect(activityState({...base,data_inicio:'2026-09-10',data_fim_previsto:'2026-09-15'},today)).toMatchObject({ongoing:true,endDelay:2,late:true})
})
it('does not infer late dates when the plan is absent',()=>{
 expect(activityState({...base,data_inicio_previsto:null,data_fim_previsto:null},today)).toMatchObject({late:false,delay:0})
 expect(activityState({...base,data_inicio_previsto:'2026-09-20'},today).label).toBe('Não iniciada')
})
it('handles invalid or future actual dates instead of fabricating a period',()=>{
 expect(activityState({...base,data_fim:'2026-09-14'},today).invalid).toBe(true)
 expect(activityState({...base,data_inicio:'2026-10-01'},today).invalid).toBe(true)
 expect(activityState({...base,data_inicio:'2026-09-15',data_fim:'2026-09-14'},today).invalid).toBe(true)
 expect(dateDay('2026-02-30')).toBeNull()
})
it('includes the complete schedule and today in full-month timeline bounds',()=>{
 const range=ganttRange([{...base,data_fim_previsto:'2027-02-10'}],today)
 expect(range.start).toBe(dateDay('2026-09-01'))
 expect(range.end).toBe(dateDay('2027-03-01'))
 expect(range.months).toHaveLength(6)
 expect(ganttRange([],today).months).toHaveLength(1)
})
