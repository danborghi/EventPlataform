# Event Platform

O projeto usa um monorepo TypeScript. O Next.js cuida da experiência web; o NestJS é a única fonte de verdade para autenticação, autorização, preço, estoque, pagamento e validação; PostgreSQL e Prisma mantêm o estado e as invariantes críticas.

## Estado atual

**MVP completo em preparação para entrega.** Estão implementados e validados:

- pnpm workspace e Turborepo;
- Next.js 16 com App Router, Tailwind CSS e direção visual inicial;
- NestJS 11 com prefixo `/api/v1`;
- Prisma 7, schema completo, migration inicial e seed idempotente;
- PostgreSQL via instalação nativa ou Docker Compose;
- autenticação Bearer JWT com login, identidade atual, papéis e ownership;
- catálogo TMDB server-side com busca, now-playing, detalhe, timeout e erros normalizados;
- `GET /api/v1/health/live` e `GET /api/v1/health/ready`;
- marketplace, reserva temporária, pagamento simulado idempotente e estoque atômico;
- carteira, QR assinado, compartilhamento sem PII e portaria com consumo único;
- OpenAPI/Swagger, headers de segurança, Jest, Playwright, Axe e CI com PostgreSQL real;
- imagens Docker, migrations de release e smoke test para web/API.

Os Marcos 1 a 7 estão concluídos. No Marco 8, qualidade, documentação e preparação de deploy estão prontas; a publicação e o smoke remoto dependem apenas da escolha do ambiente de hospedagem.

## Requisitos locais

- Node.js 24 LTS;
- pnpm 11;
- PostgreSQL 17 ou superior instalado localmente, ou Docker Desktop com suporte a Docker Compose.

## Configuração

Na raiz do repositório, prepare as variáveis:

```powershell
pnpm install
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
```

Para iniciar o PostgreSQL pelo Docker:

```powershell
docker compose up -d
```

Também é possível usar uma instalação nativa acessível em `localhost:5432`. Nesse caso, crie o usuário e o banco indicados em `apps/api/.env`, ou ajuste `DATABASE_URL` para as credenciais locais.

Com o banco disponível:

```powershell
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

Serviços:

| Serviço    | Endereço                                    |
| ---------- | ------------------------------------------- |
| Web        | `http://localhost:3000`                     |
| API        | `http://localhost:3333/api/v1`              |
| API live   | `http://localhost:3333/api/v1/health/live`  |
| API ready  | `http://localhost:3333/api/v1/health/ready` |
| Swagger UI | `http://localhost:3333/api/docs`            |
| OpenAPI    | `http://localhost:3333/api/docs-json`       |
| PostgreSQL | `localhost:5432`                            |

Interface do organizador: `http://localhost:3000/organizer`.

`health/live` confirma que o processo está ativo. `health/ready` consulta o PostgreSQL e retorna 503 enquanto o banco não estiver acessível.

O Swagger UI e seu JSON são gerados pela própria aplicação a partir das rotas e DTOs. O contrato narrativo e as regras de domínio continuam em `docs/API_CONTRACT.md`.

Autenticação:

| Método | Endpoint             | Função                        |
| ------ | -------------------- | ----------------------------- |
| POST   | `/api/v1/auth/login` | Emite access token JWT        |
| GET    | `/api/v1/auth/me`    | Retorna o usuário autenticado |

`JWT_SECRET` deve ter pelo menos 32 caracteres e permanecer somente no servidor. `JWT_EXPIRES_IN_SECONDS` usa `3600` por padrão neste projeto. `AUTH_LOGIN_RATE_LIMIT` e `AUTH_LOGIN_RATE_WINDOW_MS` controlam a proteção de login, com padrão de 5 tentativas por minuto para cada IP/e-mail.

Catálogo TMDB (somente organizador autenticado):

| Método | Endpoint                                    | Função                 |
| ------ | ------------------------------------------- | ---------------------- |
| GET    | `/api/v1/catalog/movies?q=...&page=1`       | Busca filmes           |
| GET    | `/api/v1/catalog/movies/now-playing?page=1` | Lista filmes em cartaz |
| GET    | `/api/v1/catalog/movies/:externalId`        | Detalha um filme       |

Preencha `TMDB_API_READ_TOKEN` em `apps/api/.env` com o API Read Access Token da sua conta TMDB. A credencial é enviada pelo NestJS como Bearer e nunca chega ao browser. Sem ela, a API continua disponível, mas as rotas acima respondem 502 `CATALOG_UNAVAILABLE`.

Eventos do organizador:

| Método | Endpoint                                    | Função                         |
| ------ | ------------------------------------------- | ------------------------------ |
| GET    | `/api/v1/organizer/events`                  | Lista os próprios eventos      |
| POST   | `/api/v1/organizer/events`                  | Cria rascunho a partir da TMDB |
| GET    | `/api/v1/organizer/events/:eventId`         | Exibe evento e indicadores     |
| PATCH  | `/api/v1/organizer/events/:eventId`         | Edita somente um rascunho      |
| POST   | `/api/v1/organizer/events/:eventId/publish` | Publica de forma idempotente   |

A criação exige a TMDB para obter um snapshot confiável. Depois de persistido, consultar, editar ou publicar o evento não depende da disponibilidade do catálogo externo.

O access token do organizador é mantido apenas em `sessionStorage`, sendo descartado ao encerrar a sessão do navegador. A tela inclui estados de carregamento, vazio, erro e sucesso, além de bloquear edição após a publicação.

Ingressos (cliente autenticado, exceto o link público):

| Método | Endpoint                                | Função                          |
| ------ | --------------------------------------- | ------------------------------- |
| GET    | `/api/v1/tickets/me`                    | Lista os ingressos do cliente   |
| GET    | `/api/v1/tickets/:ticketId`             | Exibe um ingresso próprio       |
| GET    | `/api/v1/tickets/:ticketId/qr`          | Emite o token assinado do QR    |
| POST   | `/api/v1/tickets/:ticketId/share-links` | Cria e substitui o link ativo   |
| DELETE | `/api/v1/tickets/:ticketId/share-link`  | Revoga o link ativo             |
| GET    | `/api/v1/tickets/shared/:shareToken`    | Abre o ingresso público sem PII |

Defina `QR_SIGNING_SECRET` com pelo menos 32 caracteres aleatórios e diferentes de `JWT_SECRET`. `APP_PUBLIC_URL` define a origem usada nos links compartilhados. O token completo do link nunca é persistido; somente seu hash SHA-256 fica no PostgreSQL. A carteira está disponível em `http://localhost:3000/tickets`.

Portaria (somente usuário `GATE`):

| Método | Endpoint                                | Função                                   |
| ------ | --------------------------------------- | ---------------------------------------- |
| GET    | `/api/v1/gate/events?q=...`             | Lista eventos disponíveis para a estação |
| POST   | `/api/v1/gate/events/:eventId/validate` | Valida e consome o ingresso atomicamente |

A estação está disponível em `http://localhost:3000/gate`. A câmera é ativada somente por ação explícita e retorna automaticamente à entrada manual quando permissão ou dispositivo não estão disponíveis. Câmera e texto enviam o mesmo campo `code`; somente o NestJS verifica a assinatura e executa `VALID -> USED`. O QR completo nunca é registrado: tentativas usam apenas um fingerprint SHA-256 curto para auditoria.

## Contas de demonstração

Depois de executar o seed:

| Papel       | E-mail                  | Senha      |
| ----------- | ----------------------- | ---------- |
| Organizador | `organizer@example.com` | `Test@123` |
| Cliente 1   | `client1@example.com`   | `Test@123` |
| Cliente 2   | `client2@example.com`   | `Test@123` |
| Portaria    | `gate@example.com`      | `Test@123` |

O seed também cria um evento publicado futuro e um rascunho. Ele não chama a TMDB: usa snapshots determinísticos para continuar funcionando offline.

## Comandos

| Comando                  | Função                                    |
| ------------------------ | ----------------------------------------- |
| `pnpm dev`               | Inicia web e API em modo desenvolvimento  |
| `pnpm build`             | Gera Prisma Client e compila os pacotes   |
| `pnpm lint`              | Executa ESLint em todos os pacotes        |
| `pnpm typecheck`         | Verifica TypeScript sem emitir arquivos   |
| `pnpm test`              | Executa testes unitários                  |
| `pnpm test:e2e:web`      | Executa o fluxo completo no Chromium      |
| `pnpm smoke`             | Verifica web, health e OpenAPI publicados |
| `pnpm format:check`      | Valida formatação                         |
| `pnpm db:generate`       | Gera Prisma Client                        |
| `pnpm db:migrate`        | Aplica migrations de desenvolvimento      |
| `pnpm db:migrate:deploy` | Aplica migrations já versionadas          |
| `pnpm db:seed`           | Semeia contas e eventos de demonstração   |

Antes do primeiro teste de navegador, instale o Chromium gerenciado pelo Playwright com `pnpm --filter @event-platform/e2e test:install`. O fluxo E2E usa as contas do seed e cria um ingresso real no banco configurado; na CI ele roda em um PostgreSQL descartável.

## Estrutura

```text
apps/
  api/        NestJS, Prisma e PostgreSQL
  e2e/        configuração Playwright
  web/        Next.js e Tailwind CSS
packages/
  contracts/  tipos públicos sem lógica de domínio
docs/         requisitos, arquitetura, contrato REST e ADRs
```

## Documentação de engenharia

- [Requisitos do produto](docs/PRODUCT_REQUIREMENTS.md)
- [Arquitetura](docs/ARCHITECTURE.md)
- [Modelo de dados](docs/DATABASE_MODEL.md)
- [Contrato REST](docs/API_CONTRACT.md)
- [Direção visual](docs/DESIGN_DIRECTION.md)
- [Plano de desenvolvimento](docs/DEVELOPMENT_PLAN.md)
- [Deploy e smoke test](docs/DEPLOYMENT.md)
- [Revisão de qualidade](docs/QUALITY_REVIEW.md)
- [Backlog rastreável](docs/BACKLOG.md)
- [Uso de IA](docs/AI_USAGE.md)
- [Decisões de produto](docs/OPEN_QUESTIONS.md)
- [Registros de decisão](docs/decisions/)

## Escopo intencionalmente adiado

Mapa de assentos, pagamento real, reembolso/cancelamento após venda aprovada, login social, recuperação de senha, e-mail, revenda, transferência de titularidade, cupons, recomendação, microserviços e infraestrutura distribuída não pertencem ao MVP. Reservas ainda pendentes continuam canceláveis com devolução única de estoque; vendas aprovadas são finais conforme o ADR 007.

## Processo e autoria

IA é usada como ferramenta de análise, documentação, implementação supervisionada e revisão. As escolhas de produto, arquitetura, escopo e linguagem visual permanecem explícitas e versionadas em [docs/AI_USAGE.md](docs/AI_USAGE.md).
