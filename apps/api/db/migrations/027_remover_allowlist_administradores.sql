DELETE FROM configuracoes_sistema
WHERE chave = 'administradores';

CREATE OR REPLACE FUNCTION usuario_eh_administrador_sistema(p_usuario_id BIGINT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM usuarios u
    WHERE u.id = p_usuario_id
      AND u.ativo
      AND u.administrador_sistema
  )
$$;
