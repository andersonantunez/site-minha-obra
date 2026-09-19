# MinhaObra

Plataforma para acompanhar obras residenciais do orçamento à entrega. O projeto é um monorepo TypeScript com React/Vite no frontend, Express no backend e PostgreSQL.

## Requisitos

- Node.js 22 LTS ou superior;
- PostgreSQL 14 ou superior;
- banco `db_casa_dals` criado;
- credenciais OAuth Google para o domínio e as URLs locais.

## Instalação local

```powershell
Copy-Item .env.example .env
npm install
npm run db:migrate
npm run dev
```

No ambiente local atual, a aplicação usa:

- web: `http://127.0.0.1:5174`;
- API: `http://127.0.0.1:3002`;
- saúde da API: `http://127.0.0.1:3002/api/saude`.

As portas evitam conflito com o projeto Café com Sardinha. O Vite encaminha `/api` e `/uploads` para a API local.

## Configuração

Copie `.env.example` para `.env`. Não versione `.env`, chaves, senhas ou tokens.

### Google OAuth

1. Crie ou selecione um projeto no Google Cloud usando `obracasadals@gmail.com`.
2. Configure a tela de consentimento OAuth.
3. Crie um cliente do tipo Aplicativo Web.
4. Cadastre `http://localhost:5174` e `http://127.0.0.1:5174` como origens JavaScript autorizadas.
5. Preencha `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env`.

O frontend recebe apenas o Client ID. O backend valida o ID token com a biblioteca oficial do Google, normaliza o e-mail, cria/atualiza `usuarios` e emite uma sessão própria em cookie HttpOnly.

### Primeiro administrador global

O usuário precisa entrar pelo Google ao menos uma vez. Depois, execute no servidor:

```powershell
npm run admin:grant -- usuario@exemplo.com
```

Não há e-mail administrativo hardcoded. Ser administrador global não torna o usuário proprietário de nenhuma obra.

### E-mail para convites

O SMTP é opcional no desenvolvimento. Para enviar convites com Gmail, ative a autenticação em duas etapas, gere uma senha de aplicativo e configure `SMTP_USER` e `SMTP_PASSWORD`.

## Banco e migrations

Todas as estruturas persistidas usam nomes em português e `snake_case`. As migrations ficam em `apps/api/db/migrations` e possuem checksum; uma migration aplicada não pode ser editada silenciosamente.

```powershell
npm run db:status
npm run db:migrate
```

Principais grupos:

- identidade e acesso: `usuarios`, `projetos`, `membros_projeto`, `convites_projeto`, `papeis`, `permissoes`;
- planejamento: `cronogramas`, `tarefas`, `itens_orcamento`, `importacoes`;
- acervo: `documentos_projeto`, `categorias_documento`, `documentos_projeto_categorias`;
- financeiro: `despesas` (pais), `pagamentos` (itens, nome físico atual), `links_cotacao_pagamento`; documentos vinculados ao pai por `documentos_projeto.compra_id` (nome físico atual).
- plataforma: `planos`, `assinaturas`, `configuracoes_sistema`, `registros_auditoria`.

Links de cotação pertencem aos itens da despesa. Valores unitários usam `NUMERIC(15,4)`; totais finais usam duas casas. O total manual do item tem prioridade sobre o calculado; o desconto global é aplicado uma única vez na soma dos itens.

## Importação

Cronograma, Fluxo de Caixa e Despesas aceitam TSV e JSON com preview e validação integral. `ACRESCENTAR` inclui registros; `SUBSTITUIR` exige permissão de exclusão e substitui logicamente os registros do módulo dentro da mesma transação. Não é permitido substituir etapas ainda vinculadas a despesas. Qualquer erro faz rollback.

Os arquivos-modelo são gerados em `apps/api/src/shared/import-examples.ts`, disponibilizados pelos endpoints autenticados `/importacao/modelo?formato=JSON|TSV` de cada módulo e baixados pelo diálogo de importação. Não existem cópias estáticas independentes.

Despesas usa registros `DESPESA`, `ITEM` e `DOCUMENTO`. `referencia` identifica pais/itens no arquivo; `despesa_ref` associa filhos e documentos ao pai. Arrays de categorias e cotações são listas JSON, inclusive nas células TSV. Quantidade vazia permanece nula; total informado no item é manual. Os modelos antigos não são aceitos.

PDF e XLSX de Despesas preservam pais, itens, descontos, precisão unitária, cotações e documentos dos pais. O Fluxo de Caixa exporta seus lançamentos e os detalhes das despesas relacionadas; o Cronograma mantém a hierarquia e usa a mesma regra de etapas válidas do CRUD. As planilhas de Despesas e Fluxo de Caixa compartilham o mesmo mapeamento financeiro.

O backup completo de projeto é JSON versão `2.0`, com módulos `cronograma`, `tarefas`, `fluxo_caixa`, `despesas`, `despesa_itens`, `links_cotacao`, `categorias`, `documentos`, `participantes` e permissões. Importar cria nova obra, novos IDs e vínculos remapeados, sem criar usuários. Pais excluídos referenciados por documentos ativos são preservados com seu estado de exclusão. Arquivos disponíveis podem ser incorporados em Base64 até 60 MB; anexos indisponíveis permanecem descritos no JSON e geram avisos de não restauração. Não se aceita a versão antiga.

## Uploads

Arquivos são validados por limite, extensão, MIME e assinatura básica. Os nomes físicos são aleatórios e o download exige autenticação, vínculo com o projeto e permissão. O diretório local configurado por `UPLOAD_DIR` não é versionado e pode ser substituído futuramente por storage em nuvem.

## Gantt e massa de homologação

Dados da Obra apresenta o Gantt como último painel. Ele compartilha a consulta e o cache do CRUD Cronograma (`/projetos/:id/cronograma`), com hierarquia inicialmente recolhida, barras paralelas previsto/realizado, escala mensal ou semanal e linha de Hoje. Atividades em andamento são desenhadas até hoje sem gravar uma data de conclusão. Indicadores contam subitens e etapas sem subitens, evitando dupla contagem de pais e filhos.

Para acrescentar uma massa fictícia à base local de desenvolvimento, execute a partir da raiz:

```powershell
npx tsx apps/api/scripts/seedScheduleDemo.ts 1
```

Troque `1` pelo ID da obra. O script preenche datas ausentes nas 12 etapas padrão existentes e em seus subitens, acrescentando quatro subitens por etapa, sem criar novas etapas pai. IDs, nomes, cores, vínculos, datas já registradas e valores orçados dos pais são preservados. Os novos subitens distribuem apenas o orçamento disponível da etapa. Há situações de antecipação, conclusão no prazo, atraso e execução em andamento. A massa anterior com etapas duplicadas de Homologação é removida logicamente; todas as alterações são auditadas. Novas execuções não duplicam subitens; bases de produção e conexões não locais são recusadas.

## Qualidade

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Mais detalhes de modelagem e segurança estão em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).
