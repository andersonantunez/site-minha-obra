// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {ScheduleGantt} from './ScheduleGantt'
import {api} from '../lib/api'
import type {ScheduleItem} from '../lib/schedule'
vi.mock('../lib/api',()=>({api:vi.fn()}))
afterEach(cleanup)
it('starts collapsed, expands children with parent colors and displays existing dates on click',async()=>{
 const parent:ScheduleItem={id:1,parent_id:null,nome:'Fundação',descricao:null,cor:'#ba3f4a',ordem:1,valor_previsto:'100',valor_pago:'0',data_inicio_previsto:'2026-09-10',data_fim_previsto:'2026-09-25',data_inicio:null,data_fim:null}
 const child={...parent,id:2,parent_id:1,nome:'Escavação',cor:'#8d765a'}
 vi.mocked(api).mockResolvedValue({etapas:[parent,child],arvore:[{...parent,subitens:[child]}],total:1,totalRegistros:2})
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
 render(<QueryClientProvider client={client}><ScheduleGantt projectId="1"/></QueryClientProvider>)
 const expand=await screen.findByRole('button',{name:'Expandir Fundação'})
 expect(screen.queryByText('Escavação')).toBeNull()
 fireEvent.click(expand)
 const name=screen.getByText('Escavação')
 expect(name.closest('.gantt-row')?.getAttribute('style')).toContain('--gantt-color: #ba3f4a')
 fireEvent.click(name)
 expect(screen.getByRole('heading',{name:'Escavação'})).toBeTruthy()
 expect(screen.getByText('10/09/2026')).toBeTruthy()
 expect(screen.getByText('Início real')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Fechar detalhes da atividade'}))
 fireEvent.click(screen.getByRole('button',{name:'Recolher Fundação'}))
 expect(screen.queryByText('Escavação')).toBeNull()
 expect(client.getQueryData(['etapas','1','cronograma'])).toBeTruthy()
})
