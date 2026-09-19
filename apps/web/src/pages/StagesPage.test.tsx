// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StagesPage } from './StagesPage'
import { api } from '../lib/api'
vi.mock('../lib/api',()=>({api:vi.fn(),jsonBody:vi.fn()}))
vi.mock('../lib/projectAccess',()=>({useProjectAccess:()=>({can:()=>false})}))
afterEach(cleanup)
it('opens schedule with old expense options in cache and refetches on SPA reentry',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:30_000}}})
 client.setQueryData(['etapas','1'],{etapas:[]})
 client.setQueryData(['etapas','1','opcoes-despesas'],{etapas:[]})
 const row={id:1,parent_id:null,nome:'Fundação',descricao:null,cor:'#8d765a',ordem:1,data_inicio:null,data_fim:null,valor_pago:'0',valor_previsto:'100',data_inicio_previsto:null,data_fim_previsto:null,subitens:[]}
 vi.mocked(api).mockResolvedValue({etapas:[row],arvore:[row],total:1,totalRegistros:1})
 const tree=<QueryClientProvider client={client}><MemoryRouter initialEntries={['/projetos/1/cronograma']}><Routes><Route path="/projetos/:projetoId/cronograma" element={<StagesPage/>}/></Routes></MemoryRouter></QueryClientProvider>
 const view=render(tree)
 expect(await screen.findByText('ETAPA 1 - Fundação')).toBeTruthy()
 expect(screen.getByText('ETAPA 1 - Fundação').closest('tr')?.getAttribute('style')).toContain('--stage-color: #8d765a')
 fireEvent.click(screen.getByRole('button',{name:'Expandir etapa'}))
 expect(screen.getByText('Nenhum subitem cadastrado nesta etapa.')).toBeTruthy()
 view.unmount();render(tree)
 expect(await screen.findByText('ETAPA 1 - Fundação')).toBeTruthy()
 expect(vi.mocked(api)).toHaveBeenCalledTimes(2)
})
