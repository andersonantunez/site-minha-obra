import {query,pool} from '../apps/api/src/config/database.js'
try {
 console.log(JSON.stringify((await query('SELECT p.id,p.nome,(SELECT COUNT(*)::int FROM cronogramas c WHERE c.projeto_id=p.id AND c.excluido_em IS NULL) AS registros FROM projetos p WHERE p.excluido_em IS NULL ORDER BY p.id')).rows))
 console.log(JSON.stringify((await query('SELECT id,nome,descricao,cor,parent_id,ordem,data_inicio_previsto,data_fim_previsto,data_inicio,data_fim,valor_previsto FROM cronogramas WHERE projeto_id=1 AND excluido_em IS NULL AND (descricao IS NULL OR descricao NOT LIKE $1) ORDER BY ordem,id',['[CRONOGRAMA_DEMO_V1]%'])).rows))
 console.log(JSON.stringify((await query("SELECT conrelid::regclass AS tabela,pg_get_constraintdef(oid) AS regra FROM pg_constraint WHERE confrelid='cronogramas'::regclass")).rows))
 console.log(JSON.stringify((await query("SELECT table_name,column_name FROM information_schema.columns WHERE table_name IN ('projetos','cronogramas') ORDER BY table_name,ordinal_position")).rows))
} finally {await pool.end()}
