import {query,pool} from '../apps/api/src/config/database.js'
try {
 const result=await query(`UPDATE cronogramas c SET data_inicio=p.data_inicio FROM cronogramas p
  WHERE c.parent_id=p.id AND c.projeto_id=1 AND c.descricao LIKE $1 AND p.descricao LIKE $1
  AND c.data_inicio<p.data_inicio AND (c.data_fim IS NULL OR c.data_fim>=p.data_inicio) RETURNING c.id`,['[CRONOGRAMA_DEMO_V1]%'])
 console.log(JSON.stringify({datasDemoAjustadas:result.rowCount}))
}finally{await pool.end()}
