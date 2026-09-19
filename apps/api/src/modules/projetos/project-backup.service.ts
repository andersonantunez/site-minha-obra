import type { PoolClient } from 'pg'
import { withTransaction } from '../../config/database.js'
import { recordAudit } from '../../shared/audit.js'
import { AppError } from '../../shared/errors.js'
import { readStoredFile, removeStoredFile, saveUploadedFile } from '../../shared/storage.js'
import { parseProjectBackup, PROJECT_BACKUP_VERSION, type ProjectBackup } from './project-backup.schemas.js'

type DatabaseRow = Record<string, unknown>
type DocumentRow = DatabaseRow & {
  old_id: number; despesa_old_id: number | null; titulo: string; criado_em: string; descricao: string | null
  tipo_origem: 'ARQUIVO' | 'LINK'; url: string | null; caminho_arquivo: string | null
  nome_original: string | null; tipo_mime: string | null; category_old_ids: number[]
}

const projectColumns = `nome,descricao,endereco,cep,logradouro,numero,complemento,bairro,cidade,estado,codigo_ibge_cidade,
  latitude,longitude,data_inicio,previsao_termino,area_construida,area_com_laje,area_sem_laje,processo_aprovacao,
  pasta_digital,planta_numero,alvara,art,cno_obra,matricula_terreno`
const maxBackupBinaryBytes = 60 * 1024 * 1024

async function loadBackupRows(client: PoolClient, projectId: number) {
  await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
  const project = await client.query<DatabaseRow>(`SELECT ${projectColumns},(arquivado_em IS NOT NULL) AS arquivado FROM projetos WHERE id=$1 AND excluido_em IS NULL`, [projectId])
  if (!project.rows[0]) throw new AppError(404, 'Projeto não encontrado.', 'PROJETO_NAO_ENCONTRADO')
  const schedule = await client.query(`SELECT id AS old_id,parent_id AS parent_old_id,nome,descricao,cor,data_inicio_previsto,
    data_fim_previsto,data_inicio,data_fim,valor_previsto,valor_executado,ordem FROM cronogramas
    WHERE projeto_id=$1 AND excluido_em IS NULL ORDER BY parent_id NULLS FIRST,ordem,id`, [projectId])
  const tasks = await client.query(`SELECT id AS old_id,descricao,observacao,status,prioridade FROM tarefas
    WHERE projeto_id=$1 AND excluido_em IS NULL ORDER BY id`, [projectId])
  const cashFlow = await client.query(`SELECT id AS old_id,competencia AS data,descricao,observacao AS detalhes,valor
    FROM itens_orcamento WHERE projeto_id=$1 AND excluido_em IS NULL ORDER BY competencia,ordem,id`, [projectId])
  const purchases = await client.query(`SELECT (excluido_em IS NOT NULL) AS excluida,id AS old_id,etapa_id AS stage_old_id,descricao,status,data_pagamento,
    forma_pagamento,fornecedor,nome_contato_fornecedor,contato_fornecedor,observacao,valor_desconto,numero_nota_fiscal,data_emissao,
    data_agendamento,data_entrega,ordem FROM despesas d WHERE projeto_id=$1 AND (excluido_em IS NULL OR EXISTS (SELECT 1 FROM documentos_projeto doc WHERE doc.compra_id=d.id AND doc.excluido_em IS NULL) OR EXISTS (SELECT 1 FROM pagamentos i WHERE i.compra_id=d.id AND i.excluido_em IS NULL)) ORDER BY ordem,id`, [projectId])
  const payments = await client.query(`SELECT id AS old_id,compra_id AS despesa_old_id,descricao,observacao,ordem,quantidade,unidade,valor AS valor_total,valor_unitario,valor_desconto,valor_total_manual FROM pagamentos WHERE projeto_id=$1 AND excluido_em IS NULL ORDER BY ordem,id`, [projectId])
  const quoteLinks = await client.query(`SELECT l.pagamento_id AS item_old_id,l.url FROM links_cotacao_pagamento l
    JOIN pagamentos p ON p.id=l.pagamento_id WHERE p.projeto_id=$1 AND p.excluido_em IS NULL ORDER BY l.id`, [projectId])
  const categories = await client.query(`SELECT id AS old_id,nome FROM categorias_documento
    WHERE projeto_id=$1 AND excluido_em IS NULL ORDER BY nome,id`, [projectId])
  const documents = await client.query<DocumentRow>(`SELECT d.id AS old_id,d.compra_id AS despesa_old_id,d.titulo,d.criado_em,
    d.descricao,d.tipo_origem,d.url,d.caminho_arquivo,d.nome_original,d.tipo_mime,
    COALESCE(ARRAY_AGG(dc.categoria_id ORDER BY dc.categoria_id) FILTER (WHERE dc.categoria_id IS NOT NULL),'{}') AS category_old_ids
    FROM documentos_projeto d LEFT JOIN documentos_projeto_categorias dc ON dc.documento_id=d.id AND EXISTS (SELECT 1 FROM categorias_documento c WHERE c.id=dc.categoria_id AND c.excluido_em IS NULL)
    WHERE d.projeto_id=$1 AND d.excluido_em IS NULL GROUP BY d.id ORDER BY d.criado_em,d.id`, [projectId])
  const participants = await client.query(`SELECT LOWER(u.email) AS email,pa.codigo AS papel FROM membros_projeto mp
    JOIN usuarios u ON u.id=mp.usuario_id JOIN papeis pa ON pa.id=mp.papel_id
    WHERE mp.projeto_id=$1 AND mp.ativo AND NOT usuario_eh_administrador_sistema(u.id) ORDER BY u.email`, [projectId])
  const memberPermissions = await client.query(`SELECT LOWER(u.email) AS email,pe.chave,pm.permitido FROM permissoes_membro pm
    JOIN membros_projeto mp ON mp.id=pm.membro_projeto_id JOIN usuarios u ON u.id=mp.usuario_id
    JOIN permissoes pe ON pe.id=pm.permissao_id WHERE mp.projeto_id=$1 AND mp.ativo ORDER BY u.email,pe.chave`, [projectId])
  const rolePermissions = await client.query(`SELECT pa.codigo AS papel,pe.chave,ppp.permitido FROM permissoes_projeto_papel ppp
    JOIN papeis pa ON pa.id=ppp.papel_id JOIN permissoes pe ON pe.id=ppp.permissao_id
    WHERE ppp.projeto_id=$1 ORDER BY pa.codigo,pe.chave`, [projectId])
  return { project: project.rows[0], schedule: schedule.rows, tasks: tasks.rows, cashFlow: cashFlow.rows, purchases: purchases.rows,
    payments: payments.rows, quoteLinks: quoteLinks.rows, categories: categories.rows, documents: documents.rows,
    participants: participants.rows, memberPermissions: memberPermissions.rows, rolePermissions: rolePermissions.rows }
}

export async function exportProjectBackup(projectId: number): Promise<ProjectBackup> {
  const data = await withTransaction((client) => loadBackupRows(client, projectId))
  const warnings: string[] = []
  const documents = []
  let includedBinaryBytes = 0
  for (const document of data.documents) {
    let arquivo: { nome_original: string; tipo_mime: string; base64: string } | null = null
    if (document.tipo_origem === 'ARQUIVO') {
      if (!document.caminho_arquivo || !document.tipo_mime) {
        warnings.push(`O conteúdo do documento “${document.titulo}” não estava disponível e não foi incluído.`)
      } else {
        try {
          const content = await readStoredFile(document.caminho_arquivo)
          if (includedBinaryBytes + content.length > maxBackupBinaryBytes) {
            warnings.push(`O arquivo do documento “${document.titulo}” não foi incorporado porque o limite de 60 MB de anexos por backup foi atingido; os metadados foram preservados.`)
          } else {
            includedBinaryBytes += content.length
            arquivo = { nome_original: document.nome_original || document.titulo, tipo_mime: document.tipo_mime, base64: content.toString('base64') }
          }
        } catch {
          warnings.push(`O arquivo físico do documento “${document.titulo}” não foi localizado.`)
        }
      }
    }
    documents.push({ old_id: document.old_id, despesa_old_id: document.despesa_old_id, titulo: document.titulo,
      criado_em: document.criado_em, descricao: document.descricao, tipo_origem: document.tipo_origem, url: document.url,
      nome_original: document.nome_original, tipo_mime: document.tipo_mime, category_old_ids: document.category_old_ids, arquivo })
  }
  return parseProjectBackup({ backup: {
    version: PROJECT_BACKUP_VERSION, exported_at: new Date().toISOString(), source_project_id: projectId, warnings,
    project: data.project as ProjectBackup['backup']['project'],
    modules: {
      cronograma: data.schedule as ProjectBackup['backup']['modules']['cronograma'],
      tarefas: data.tasks as ProjectBackup['backup']['modules']['tarefas'],
      fluxo_caixa: data.cashFlow as ProjectBackup['backup']['modules']['fluxo_caixa'],
      despesas: data.purchases as ProjectBackup['backup']['modules']['despesas'], despesa_itens: data.payments as ProjectBackup['backup']['modules']['despesa_itens'],
      links_cotacao: data.quoteLinks as ProjectBackup['backup']['modules']['links_cotacao'],
      categorias: data.categories as ProjectBackup['backup']['modules']['categorias'], documentos: documents,
      participantes: data.participants as ProjectBackup['backup']['modules']['participantes'],
      permissoes_membros: data.memberPermissions as ProjectBackup['backup']['modules']['permissoes_membros'],
      permissoes_papeis: data.rolePermissions as ProjectBackup['backup']['modules']['permissoes_papeis'],
    },
  } })
}

async function ensureCreationAllowed(client: PoolClient, userId: number) {
  const result = await client.query<{ limite_projetos_proprios: number | null; administrador_sistema: boolean }>(`SELECT pl.limite_projetos_proprios,
    usuario_eh_administrador_sistema(u.id) AS administrador_sistema
    FROM usuarios u JOIN planos pl ON pl.id=u.plano_id WHERE u.id=$1 AND u.ativo FOR UPDATE OF u`, [userId])
  if (!result.rows[0]) throw new AppError(401, 'Usuário inválido.', 'NAO_AUTENTICADO')
  if (result.rows[0].administrador_sistema || result.rows[0].limite_projetos_proprios === null) return
  const count = await client.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM projetos
    WHERE proprietario_usuario_id=$1 AND excluido_em IS NULL AND arquivado_em IS NULL`, [userId])
  if (count.rows[0]!.total >= result.rows[0].limite_projetos_proprios) throw new AppError(409, 'Seu plano não permite criar outra obra ativa.', 'LIMITE_PLANO_FREE')
}

function mapped(map: Map<number, number>, oldId: number | null, entity: string) {
  if (oldId === null) return null
  const value = map.get(oldId)
  if (!value) throw new AppError(422, `Não foi possível reconstruir uma referência de ${entity}.`, 'BACKUP_REFERENCIA_INVALIDA')
  return value
}

export async function importProjectBackup(userId: number, backupFile: ProjectBackup, ip?: string) {
  const backup = backupFile.backup
  const createdFiles: string[] = []
  const warnings = [...backup.warnings]
  try {
    return await withTransaction(async (client) => {
      await ensureCreationAllowed(client, userId)
      const project = backup.project
      const insertedProject = await client.query<{ id: number; nome: string }>(`INSERT INTO projetos
        (proprietario_usuario_id,${projectColumns}) VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
        RETURNING id,nome`, [userId,project.nome,project.descricao,project.endereco,project.cep,project.logradouro,project.numero,
        project.complemento,project.bairro,project.cidade,project.estado,project.codigo_ibge_cidade,project.latitude,project.longitude,
        project.data_inicio,project.previsao_termino,project.area_construida,project.area_com_laje,project.area_sem_laje,
        project.processo_aprovacao,project.pasta_digital,project.planta_numero,project.alvara,project.art,project.cno_obra,project.matricula_terreno])
      const newProject = insertedProject.rows[0]!
      if(project.arquivado)await client.query('UPDATE projetos SET arquivado_em=NOW() WHERE id=$1',[newProject.id])
      const ownerMember = await client.query<{ id: number }>(`INSERT INTO membros_projeto (projeto_id,usuario_id,papel_id)
        SELECT $1,$2,id FROM papeis WHERE codigo='PROPRIETARIO' RETURNING id`, [newProject.id,userId])

      const categoryIds = new Map<number, number>()
      for (const category of backup.modules.categorias) {
        const result = await client.query<{ id: number }>(`INSERT INTO categorias_documento (projeto_id,nome,criado_por)
          VALUES ($1,$2,$3) RETURNING id`, [newProject.id,category.nome,userId])
        categoryIds.set(category.old_id,result.rows[0]!.id)
      }

      const stageIds = new Map<number, number>()
      let pending = [...backup.modules.cronograma]
      while (pending.length) {
        const ready = pending.filter((stage) => stage.parent_old_id === null || stageIds.has(stage.parent_old_id))
        if (!ready.length) throw new AppError(422, 'A hierarquia do cronograma contém uma referência circular.', 'BACKUP_HIERARQUIA_INVALIDA')
        for (const stage of ready) {
          const result = await client.query<{ id: number }>(`INSERT INTO cronogramas
            (projeto_id,parent_id,nome,descricao,cor,data_inicio_previsto,data_fim_previsto,data_inicio,data_fim,valor_previsto,valor_executado,ordem,criado_por)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`, [newProject.id,
            mapped(stageIds,stage.parent_old_id,'cronograma'),stage.nome,stage.descricao,stage.cor,stage.data_inicio_previsto,
            stage.data_fim_previsto,stage.data_inicio,stage.data_fim,stage.valor_previsto,stage.valor_executado,stage.ordem,userId])
          stageIds.set(stage.old_id,result.rows[0]!.id)
        }
        const readyIds = new Set(ready.map((stage) => stage.old_id))
        pending = pending.filter((stage) => !readyIds.has(stage.old_id))
      }

      for (const task of backup.modules.tarefas) await client.query(`INSERT INTO tarefas
        (projeto_id,descricao,observacao,status,prioridade,criado_por) VALUES ($1,$2,$3,$4,$5,$6)`,
      [newProject.id,task.descricao,task.observacao,task.status,task.prioridade,userId])

      for (const item of backup.modules.fluxo_caixa) await client.query(`INSERT INTO itens_orcamento
        (projeto_id,competencia,ordem,descricao,observacao,valor,criado_por) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [newProject.id,item.data,0,item.descricao,item.detalhes,item.valor,userId])

      const purchaseIds = new Map<number, number>()
      for (const purchase of backup.modules.despesas) {
        const result = await client.query<{ id: number }>(`INSERT INTO despesas
          (projeto_id,etapa_id,descricao,status,data_pagamento,forma_pagamento,fornecedor,nome_contato_fornecedor,
           contato_fornecedor,observacao,valor_desconto,numero_nota_fiscal,data_emissao,data_agendamento,data_entrega,ordem,criado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`, [newProject.id,
          mapped(stageIds,purchase.stage_old_id,'Despesa'),purchase.descricao,purchase.status,purchase.data_pagamento,
           purchase.forma_pagamento,purchase.fornecedor,purchase.nome_contato_fornecedor,purchase.contato_fornecedor,purchase.observacao,purchase.valor_desconto,
           purchase.numero_nota_fiscal,purchase.data_emissao,purchase.data_agendamento,purchase.data_entrega,purchase.ordem,userId])
        purchaseIds.set(purchase.old_id,result.rows[0]!.id)
        if(purchase.excluida)await client.query('UPDATE despesas SET excluido_em=NOW() WHERE id=$1',[result.rows[0]!.id])
      }

      const paymentIds = new Map<number, number>()
      for (const payment of backup.modules.despesa_itens) {
        const result = await client.query<{ id: number }>(`INSERT INTO pagamentos
          (projeto_id,compra_id,descricao,observacao,ordem,quantidade,unidade,valor,valor_unitario,valor_desconto,valor_total_manual,documentos_legados_habilitados,criado_por)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,$12) RETURNING id`,
          [newProject.id,mapped(purchaseIds,payment.despesa_old_id,'Despesa do item'),payment.descricao,payment.observacao,
           payment.ordem,payment.quantidade,payment.unidade,payment.valor_total,payment.valor_unitario,payment.valor_desconto,payment.valor_total_manual,userId])
        paymentIds.set(payment.old_id,result.rows[0]!.id)
      }
      for (const link of backup.modules.links_cotacao) await client.query(`INSERT INTO links_cotacao_pagamento
        (pagamento_id,url,criado_por) VALUES ($1,$2,$3)`, [mapped(paymentIds,link.item_old_id,'link de cotação'),link.url,userId])

      for (const document of backup.modules.documentos) {
        let stored: { relativePath: string; originalName: string; mimeType: string } | null = null
        if (document.tipo_origem === 'ARQUIVO' && !document.arquivo) {
          warnings.push(`Documento não restaurado: o arquivo de “${document.titulo}” não estava contido no backup. Os metadados permanecem disponíveis no JSON.`)
          continue
        }
        if (document.tipo_origem === 'ARQUIVO' && document.arquivo) {
          const buffer = Buffer.from(document.arquivo.base64,'base64')
          const file = { buffer, mimetype:document.arquivo.tipo_mime, originalname:document.arquivo.nome_original } as Express.Multer.File
          stored = await saveUploadedFile(newProject.id,'documentos',file)
          createdFiles.push(stored.relativePath)
        }
        const result = await client.query<{ id: number }>(`INSERT INTO documentos_projeto
          (projeto_id,compra_id,titulo,categoria,descricao,tipo_origem,url,caminho_arquivo,nome_original,tipo_mime,criado_por,criado_em)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [newProject.id,
          mapped(purchaseIds,document.despesa_old_id,'Despesa do documento'),document.titulo,document.despesa_old_id?'Despesas':'OUTROS',document.descricao,
          document.tipo_origem,document.url,stored?.relativePath||null,stored?.originalName||document.nome_original,
          stored?.mimeType||document.tipo_mime,userId,document.criado_em])
        for (const oldCategoryId of document.category_old_ids) await client.query(`INSERT INTO documentos_projeto_categorias
          (documento_id,categoria_id) VALUES ($1,$2)`, [result.rows[0]!.id,mapped(categoryIds,oldCategoryId,'categoria de documento')])
      }

      const memberIds = new Map<string, number>()
      const importerEmail = await client.query<{ email: string }>('SELECT LOWER(email) AS email FROM usuarios WHERE id=$1', [userId])
      memberIds.set(importerEmail.rows[0]!.email,ownerMember.rows[0]!.id)
      for (const participant of backup.modules.participantes) {
        const email = participant.email.toLowerCase()
        if (memberIds.has(email)) continue
        const user = await client.query<{ id: number; administrador_sistema: boolean }>(`SELECT id,usuario_eh_administrador_sistema(id) AS administrador_sistema
          FROM usuarios WHERE LOWER(email)=LOWER($1) AND ativo`, [email])
        if (!user.rows[0]) { warnings.push(`Participante não associado: ${email} não possui uma conta ativa.`); continue }
        if (user.rows[0].administrador_sistema) continue
        const member = await client.query<{ id: number }>(`INSERT INTO membros_projeto (projeto_id,usuario_id,papel_id,convidado_por)
          SELECT $1,$2,id,$3 FROM papeis WHERE codigo=$4 RETURNING id`, [newProject.id,user.rows[0].id,userId,participant.papel])
        if (!member.rows[0]) { warnings.push(`Participante não associado: papel inválido para ${email}.`); continue }
        memberIds.set(email,member.rows[0].id)
      }

      for (const permission of backup.modules.permissoes_membros) {
        const memberId = memberIds.get(permission.email.toLowerCase())
        if (!memberId || memberId === ownerMember.rows[0]!.id) continue
        await client.query(`INSERT INTO permissoes_membro (membro_projeto_id,permissao_id,permitido,atualizado_por)
          SELECT $1,id,$3,$4 FROM permissoes WHERE chave=$2 ON CONFLICT (membro_projeto_id,permissao_id)
          DO UPDATE SET permitido=EXCLUDED.permitido,atualizado_por=EXCLUDED.atualizado_por`, [memberId,permission.chave,permission.permitido,userId])
      }
      for (const permission of backup.modules.permissoes_papeis) await client.query(`INSERT INTO permissoes_projeto_papel
        (projeto_id,papel_id,permissao_id,permitido,atualizado_por)
        SELECT $1,pa.id,pe.id,$4,$5 FROM papeis pa CROSS JOIN permissoes pe WHERE pa.codigo=$2 AND pe.chave=$3
        ON CONFLICT (projeto_id,papel_id,permissao_id) DO UPDATE SET permitido=EXCLUDED.permitido,atualizado_por=EXCLUDED.atualizado_por`,
      [newProject.id,permission.papel,permission.chave,permission.permitido,userId])

      await recordAudit(client,{ projetoId:newProject.id,usuarioId:userId,acao:'PROJETO_IMPORTADO',entidade:'projetos',
        registroId:newProject.id,dadosNovos:{ versao:backup.version,projetoOrigemId:backup.source_project_id },enderecoIp:ip })
      return { projeto:newProject, avisos:warnings }
    })
  } catch (error) {
    await Promise.all(createdFiles.map((path) => removeStoredFile(path)))
    throw error
  }
}
