import { describe, expect, it } from 'vitest'
import { parseProjectBackup, parseProjectBackupJson, PROJECT_BACKUP_VERSION, type ProjectBackup } from '../src/modules/projetos/project-backup.schemas.js'

const validBackup = () => ({ backup: {
  version: PROJECT_BACKUP_VERSION, exported_at: '2026-09-11T12:00:00.000Z', source_project_id: 10, warnings: [],
  project: { nome:'Casa teste',descricao:'Backup de teste',endereco:null,cep:null,logradouro:null,numero:null,complemento:null,
    bairro:null,cidade:null,estado:null,codigo_ibge_cidade:null,latitude:null,longitude:null,data_inicio:null,
    previsao_termino:null,area_construida:null,area_com_laje:null,area_sem_laje:null,processo_aprovacao:null,
    pasta_digital:null,planta_numero:null,alvara:null,art:null,cno_obra:null,matricula_terreno:null },
  modules: { cronograma:[{old_id:1,parent_old_id:null,nome:'Etapa 1',descricao:null,cor:'#167a45',data_inicio_previsto:null,
    data_fim_previsto:null,data_inicio:null,data_fim:null,valor_previsto:'0',valor_executado:'0',ordem:1}], tarefas:[],
    fluxo_caixa:[], compras:[] as ProjectBackup['backup']['modules']['compras'], pagamentos:[{old_id:2,stage_old_id:1,descricao:'Pagamento',fornecedor:null,contato_fornecedor:null,
      nome_contato_fornecedor:null,observacao:null,ordem:1,quantidade:null,unidade:null,chave_pix:null,valor:null,
      status:'PENDENTE',forma_pagamento:null,data_pagamento:null,data_agendamento:null,data_entrega:null}],
    links_cotacao:[],categorias:[{old_id:3,nome:'Pagamentos'}],documentos:[] as ProjectBackup['backup']['modules']['documentos'],
    participantes:[{email:'proprietario@example.com',papel:'PROPRIETARIO'}],permissoes_membros:[],permissoes_papeis:[] },
} })

describe('backup completo de projeto', () => {
  it('aceita a versão atual e referências internas válidas', () => {
    const parsed = parseProjectBackup(validBackup())
    expect(parsed.backup.modules.pagamentos[0]?.stage_old_id).toBe(1)
    expect(parsed.backup.modules.compras).toEqual([])
  })

  it('continua aceitando backups anteriores que ainda não possuíam Compras', () => {
    const legacy: unknown = structuredClone(validBackup())
    delete (legacy as { backup: { modules: { compras?: unknown } } }).backup.modules.compras
    expect(parseProjectBackup(legacy).backup.modules.compras).toEqual([])
  })

  it('rejeita versão incompatível com mensagem específica', () => {
    const backup=validBackup();backup.backup.version='2.0' as '1.0'
    expect(()=>parseProjectBackup(backup)).toThrowError(/Versão de backup incompatível/)
  })

  it('rejeita JSON inválido', () => {
    expect(()=>parseProjectBackupJson('{"backup":')).toThrowError(/JSON válido/)
  })

  it('rejeita referências para etapas ausentes', () => {
    const backup=validBackup();backup.backup.modules.pagamentos[0]!.stage_old_id=999
    expect(()=>parseProjectBackup(backup)).toThrowError(/estrutura de backup válida/)
  })

  it('preserva a relação Compra, item e documento no formato de backup', () => {
    const backup = validBackup()
    backup.backup.modules.compras = [{ old_id:4,stage_old_id:1,descricao:'Compra principal',status:'PENDENTE',data_pagamento:null,
      forma_pagamento:null,fornecedor:'Fornecedor',nome_contato_fornecedor:null,contato_fornecedor:null,observacao:null,valor_desconto:null,
      numero_nota_fiscal:null,data_emissao:null,data_agendamento:null,data_entrega:null,ordem:1 }]
    Object.assign(backup.backup.modules.pagamentos[0]!, { purchase_old_id:4,valor_unitario:'10.00' })
    backup.backup.modules.documentos = [{ old_id:5,payment_old_id:null,purchase_old_id:4,titulo:'Orçamento',categoria:'Pagamentos',
      descricao:null,tipo_origem:'LINK',url:'https://example.com/orcamento',nome_original:null,tipo_mime:null,category_old_ids:[3],arquivo:null }]
    const parsed = parseProjectBackup(backup)
    expect(parsed.backup.modules.pagamentos[0]?.purchase_old_id).toBe(4)
    expect(parsed.backup.modules.documentos[0]?.purchase_old_id).toBe(4)
  })
})
