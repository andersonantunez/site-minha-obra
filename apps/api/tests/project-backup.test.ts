import { describe, expect, it } from 'vitest'
import { parseProjectBackup, parseProjectBackupJson, PROJECT_BACKUP_VERSION, type ProjectBackup } from '../src/modules/projetos/project-backup.schemas.js'

export function validBackup():ProjectBackup{return {backup:{
  version:PROJECT_BACKUP_VERSION,exported_at:'2026-09-17T12:00:00.000Z',source_project_id:1,warnings:[],
  project:{nome:'Casa teste',descricao:'Backup de teste',arquivado:false,endereco:null,cep:null,logradouro:null,numero:null,complemento:null,bairro:null,cidade:null,estado:null,codigo_ibge_cidade:null,latitude:null,longitude:null,data_inicio:null,previsao_termino:null,area_construida:null,area_com_laje:null,area_sem_laje:null,processo_aprovacao:null,pasta_digital:null,planta_numero:null,alvara:null,art:null,cno_obra:null,matricula_terreno:null},
  modules:{
    cronograma:[{old_id:1,parent_old_id:null,nome:'Projetos',descricao:null,cor:'#e2f5e8',data_inicio_previsto:null,data_fim_previsto:null,data_inicio:null,data_fim:null,valor_previsto:'0',valor_executado:'0',ordem:1}],
    tarefas:[],fluxo_caixa:[],
    despesas:[{old_id:2,stage_old_id:1,descricao:'Materiais',status:'PENDENTE',data_pagamento:null,forma_pagamento:null,fornecedor:null,nome_contato_fornecedor:null,contato_fornecedor:null,observacao:null,valor_desconto:'25',numero_nota_fiscal:null,data_emissao:null,data_agendamento:null,data_entrega:null,ordem:0}],
    despesa_itens:[{old_id:3,despesa_old_id:2,descricao:'Tijolos',quantidade:'3000',unidade:'Unidades',observacao:null,valor_unitario:'1.8333',valor_desconto:'0',valor_total:'5500',valor_total_manual:true,ordem:0}],
    links_cotacao:[{item_old_id:3,url:'https://example.com/cotacao'}],
    categorias:[{old_id:4,nome:'Despesas'},{old_id:5,nome:'Financiamento'}],
    documentos:[{old_id:6,despesa_old_id:2,titulo:'Nota Fiscal',descricao:null,tipo_origem:'LINK',url:'https://example.com/nf',nome_original:null,tipo_mime:null,category_old_ids:[4,5],arquivo:null,criado_em:'2026-09-17T12:00:00.000Z'}],
    participantes:[{email:'owner@example.com',papel:'PROPRIETARIO'}],permissoes_membros:[],permissoes_papeis:[],
  },
}}}
describe('contrato atual de backup',()=>{
  it('preserva despesas, itens, quatro casas, total manual e múltiplas categorias',()=>{
    const parsed=parseProjectBackup(validBackup())
    expect(parsed.backup.modules.despesa_itens[0]).toMatchObject({despesa_old_id:2,valor_unitario:'1.8333',valor_total:'5500',valor_total_manual:true})
    expect(parsed.backup.modules.documentos[0]?.category_old_ids).toEqual([4,5])
  })
  it('rejeita versão antiga',()=>{const backup=validBackup();Object.assign(backup.backup,{version:'1.0'});expect(()=>parseProjectBackup(backup)).toThrow(/Versão de backup incompatível/)})
  it('rejeita módulos antigos e documentos de itens',()=>{
    const backup=validBackup();Object.assign(backup.backup.modules,{compras:[],pagamentos:[]})
    expect(()=>parseProjectBackup(backup)).toThrow(/estrutura de backup válida/)
    const other=validBackup();Object.assign(other.backup.modules.documentos[0]!,{payment_old_id:3})
    expect(()=>parseProjectBackup(other)).toThrow(/estrutura de backup válida/)
  })
  it('rejeita IDs e categorias duplicados e referências ausentes',()=>{
    for(const mutate of [
      (b:ProjectBackup)=>{b.backup.modules.despesa_itens[0]!.despesa_old_id=999},
      (b:ProjectBackup)=>{b.backup.modules.links_cotacao[0]!.item_old_id=999},
      (b:ProjectBackup)=>{b.backup.modules.documentos[0]!.category_old_ids=[4,4]},
      (b:ProjectBackup)=>{b.backup.modules.despesas.push(b.backup.modules.despesas[0]!)},
      (b:ProjectBackup)=>{b.backup.modules.cronograma[0]!.parent_old_id=1},
    ]){const backup=validBackup();mutate(backup);expect(()=>parseProjectBackup(backup)).toThrow(/estrutura de backup válida/)}
  })
  it('rejeita JSON inválido',()=>expect(()=>parseProjectBackupJson('{')).toThrow(/JSON válido/))
})
