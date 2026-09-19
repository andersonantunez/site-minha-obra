// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {MemoryRouter,Route,Routes} from 'react-router-dom'
import {BudgetPage} from './BudgetPage'
import {api} from '../lib/api'
vi.mock('../lib/api',()=>({api:vi.fn(),jsonBody:vi.fn()}))
vi.mock('../lib/projectAccess',()=>({useProjectAccess:()=>({can:()=>true})}))
afterEach(cleanup)
it('keeps actions in the seventh column and preserves editing and expanded details',async()=>{
 const item={id:'MANUAL-1',origem:'MANUAL',origem_id:1,payment_record_type:null,data:'2026-09-17',descricao:'Aporte',fornecedor:'Fornecedor com nome extenso',detalhes:'Observação de teste',valor:'100.00',editavel:true,provisionado:false}
 vi.mocked(api).mockResolvedValue({itens:[item],total:1,indicadores:{total_entrada:'100',total_saida:'0',saldo_atual:'100',saldo_com_provisao:'100'}})
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
 render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/projetos/1/fluxo-caixa']}><Routes><Route path="/projetos/:projetoId/fluxo-caixa" element={<BudgetPage/>}/></Routes></MemoryRouter></QueryClientProvider>)
 const edit=await screen.findByTitle('Editar lançamento')
 const row=edit.closest('tr')!
 expect(row.cells.length).toBe(7)
 expect(edit.closest('td')!.cellIndex).toBe(6)
 expect(screen.getByTitle('Excluir lançamento').closest('td')).toBe(edit.closest('td'))
 expect(row.cells[3]!.textContent).toBe(item.fornecedor)
 fireEvent.click(edit)
 expect(screen.getByRole('heading',{name:'Editar lançamento'})).toBeTruthy()
 expect(screen.getByDisplayValue('Aporte')).toBeTruthy()
 expect(document.querySelector('.cash-flow-details-row')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Cancelar'}))
 fireEvent.click(screen.getByTitle('Expandir despesa'))
 expect(screen.getByText('Observação de teste').closest('td')!.colSpan).toBe(7)
})
