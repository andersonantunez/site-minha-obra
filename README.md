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
- planejamento: `etapas`, `itens_orcamento`, `importacoes`;
- acervo: `renders_projeto`, `plantas_projeto`, `documentos_projeto`;
- financeiro: `pagamentos`, `itens_pagamento`, `documentos_pagamento`, `links_produtos_item_pagamento`;
- plataforma: `planos`, `assinaturas`, `configuracoes_sistema`, `registros_auditoria`.

Os links de pesquisa pertencem exclusivamente a um subitem de pagamento. Valores financeiros usam `NUMERIC(15,2)`.

## Importação

Etapas e orçamento aceitam TSV e JSON com preview, validação integral e os modos `ACRESCENTAR` e `SUBSTITUIR`. O modo substituir arquiva os registros atuais dentro da mesma transação; qualquer erro preserva os dados anteriores.

Arquivos completos para download estão em `apps/web/public/examples` e também aparecem no diálogo de importação.

## Uploads

Arquivos são validados por limite, extensão, MIME e assinatura básica. Os nomes físicos são aleatórios e o download exige autenticação, vínculo com o projeto e permissão. O diretório local configurado por `UPLOAD_DIR` não é versionado e pode ser substituído futuramente por storage em nuvem.

## Qualidade

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Mais detalhes de modelagem e segurança estão em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).
