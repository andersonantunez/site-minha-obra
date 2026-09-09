# Arquitetura do MinhaObra

## Diagnostico inicial

O diretório `minha-obra` estava vazio em 31/08/2026. Não havia código, banco, migrations, autenticação ou estruturas parciais a preservar. A solução nasce como monorepo npm com dois aplicativos independentes:

- `apps/web`: React, Vite, TypeScript, React Router e TanStack Query;
- `apps/api`: Node.js, Express, TypeScript e PostgreSQL por meio de `pg`;
- `apps/api/db/migrations`: migrations SQL versionadas e executadas em ordem;
- `apps/api/src/modules`: módulos de domínio com rotas, services e repositories quando a complexidade justificar;
- `apps/api/src/shared`: autenticação, autorização, validação, banco, erros, uploads e auditoria.

## Decisões de domínio

1. `usuarios` representa a identidade global autenticada pelo Google.
2. `projetos` representa cada obra e é a unidade de isolamento de dados.
3. O acesso não é concedido por um `projeto_id` vindo do navegador. O backend sempre confirma a associação em `membros_projeto` e resolve a permissão efetiva.
4. O proprietário é registrado em `projetos.proprietario_usuario_id` e também como membro com papel `PROPRIETARIO`.
5. O plano FREE limita apenas projetos próprios ativos; convites aceitos não consomem essa cota.
6. Papéis fornecem permissões-padrão e `permissoes_membro` permite exceções granulares. Permissões essenciais do proprietário são protegidas no backend.
7. Pagamentos são agregadores; seus valores e estados operacionais pertencem aos `itens_pagamento`, evitando duplicar totais no pai.
8. Links de produtos pertencem exclusivamente a `itens_pagamento`. A loja é derivada da URL e não é persistida nesta versão.
9. Posição financeira e dashboards usam consultas agregadas no PostgreSQL; o React não baixa todos os registros para recalcular totais.
10. Valores monetários usam `NUMERIC(15,2)` e são serializados como texto/centavos nas fronteiras que exigem precisão.
11. Entidades operacionais importantes usam `excluido_em`; links de pesquisa podem ser removidos fisicamente com registro em auditoria.
12. Uploads ficam atrás de um serviço de armazenamento. A primeira implementação usa disco local, preservando uma interface substituível por armazenamento em nuvem.

## Módulos e responsabilidades

- Autenticação: valida credencial Google no servidor, cria/atualiza usuário e emite token próprio de sessão.
- Projetos: criação, seleção, atualização, cota do plano e contexto do projeto.
- Acesso: membros, convites, papéis e permissões efetivas.
- Projeto: renders, plantas e documentos.
- Planejamento: etapas, orçamento, importação e consolidações.
- Financeiro: pagamentos pai-filho, anexos, links de pesquisa, indicadores e relatório.
- Administração: visão global para `administrador_sistema`.
- Auditoria: registro centralizado de mutações relevantes.

## Modelo relacional

```text
usuarios --< projetos (proprietario_usuario_id)
usuarios --< membros_projeto >-- projetos
                       |-- papel
                       `-- permissoes_membro >-- permissoes
papeis --< permissoes_papel >-- permissoes
projetos --< convites_projeto
projetos --< renders_projeto
projetos --< plantas_projeto
projetos --< documentos_projeto
projetos --< etapas
projetos --< itens_orcamento >-- etapas
projetos --< pagamentos >-- etapas
pagamentos --< itens_pagamento
itens_pagamento --< links_produtos_item_pagamento
pagamentos/itens_pagamento --< documentos_pagamento
projetos --< registros_auditoria >-- usuarios
```

## Segurança

- Token Google é validado pela biblioteca oficial no backend; `email` enviado pelo cliente nunca autentica o usuário.
- Todas as rotas privadas exigem token de sessão assinado.
- Middlewares de projeto carregam associação e permissões do banco.
- SQL é parametrizado; payloads são validados por Zod.
- URLs aceitam apenas `http:` e `https:`.
- Uploads usam allowlist de MIME/extensão, tamanho máximo e nome aleatório.
- Erros de produção não expõem stack trace.
- Administrador global e proprietário do projeto são papéis independentes.

## Evolução prevista

A modelagem permite acrescentar fornecedores, contratos, medições, diário de obra, histórico de preços, tarefas, notificações e armazenamento em nuvem sem migrar dados para tabelas paralelas.
