import type { ImportFormat } from './importParser.js'

export const importExamples = {
  despesas: [
    {tipo:'DESPESA',referencia:'despesa-1',descricao:'Materiais para alvenaria',status:'PENDENTE',fornecedor:'Fornecedor exemplo',observacao:'Entrega no endereço da obra',valor_desconto:25,numero_nota_fiscal:'NF-123',data_emissao:'2026-09-10'},
    {tipo:'ITEM',referencia:'item-1',despesa_ref:'despesa-1',descricao:'Tijolos',quantidade:3000,unidade:'Unidades',valor_unitario:1.8333,valor_desconto:0,valor_total:5500,links_cotacao:['https://fornecedor.example/cotacao/tijolos']},
    {tipo:'ITEM',referencia:'item-2',despesa_ref:'despesa-1',descricao:'Frete',quantidade:null,unidade:null,valor_unitario:150,valor_desconto:10,valor_total:null,links_cotacao:[]},
    {tipo:'DOCUMENTO',despesa_ref:'despesa-1',titulo:'Nota Fiscal 123',url:'https://fornecedor.example/documentos/nf-123',categorias:['Despesas','Financiamento']},
  ],
  'fluxo-caixa': [
    {data:'2026-09-01',descricao:'Aporte para a obra',detalhes:'Transferência do proprietário',valor:10000},
    {data:'2026-09-05',descricao:'Tarifa bancária',detalhes:null,valor:-25.5},
  ],
  cronograma: [
    {tipo:'ETAPA',etapa_pai:null,ordem:1,nome:'Projetos e licenças',descricao:'Preparação da obra',cor:'#e2f5e8',data_inicio_previsto:'2026-09-01',data_fim_previsto:'2026-09-30',valor_previsto:5000,data_inicio:null,data_fim:null},
    {tipo:'SUBITEM',etapa_pai:'Projetos e licenças',ordem:1,nome:'Alvará municipal',descricao:'Taxas e documentação',cor:'#e2f5e8',data_inicio_previsto:'2026-09-01',data_fim_previsto:'2026-09-15',valor_previsto:3000,data_inicio:null,data_fim:null},
    {tipo:'SUBITEM',etapa_pai:'Projetos e licenças',ordem:2,nome:'Projeto arquitetônico',descricao:null,cor:'#e2f5e8',data_inicio_previsto:'2026-09-01',data_fim_previsto:'2026-09-30',valor_previsto:2000,data_inicio:null,data_fim:null},
  ],
} as const

export function importExample(entity:keyof typeof importExamples, format:ImportFormat) {
  const rows=importExamples[entity]
  if(format==='JSON')return JSON.stringify(rows,null,2)
  const fields=[...new Set(rows.flatMap(row=>Object.keys(row)))]
  const serialize=(value:unknown)=>value===null||value===undefined?'':Array.isArray(value)||typeof value==='object'?JSON.stringify(value):String(value)
  return [fields.join('\t'),...rows.map(row=>fields.map(field=>serialize((row as Record<string,unknown>)[field])).join('\t'))].join('\n')+'\n'
}

