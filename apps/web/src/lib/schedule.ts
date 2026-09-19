import { queryOptions } from '@tanstack/react-query'
import { api } from './api'

export type ScheduleItem={id:number;parent_id:number|null;nome:string;descricao:string|null;cor:string;data_inicio_previsto:string|null;data_fim_previsto:string|null;data_inicio:string|null;data_fim:string|null;valor_previsto:string;valor_pago:string;ordem:number}
export type ScheduleStage=ScheduleItem&{subitens:ScheduleItem[]}
export type ScheduleResponse={etapas:ScheduleItem[];arvore:ScheduleStage[];total:number;totalRegistros:number}
export const EMPTY_SCHEDULE:ScheduleResponse={etapas:[],arvore:[],total:0,totalRegistros:0}
export const scheduleQueryOptions=(projectId:string)=>queryOptions({
 queryKey:['etapas',projectId,'cronograma'],
 enabled:Boolean(projectId),
 refetchOnMount:'always',
 queryFn:()=>api<ScheduleResponse>(`/projetos/${projectId}/cronograma`),
})
