# Deploy e smoke test

## Componentes

A entrega possui três processos: `web` (Next.js), `api` (NestJS) e PostgreSQL. O NestJS deve ser publicado em uma origem acessível pelo navegador; essa origem, acrescida de `/api/v1`, é compilada no front-end por `NEXT_PUBLIC_API_URL`.

## Variáveis obrigatórias

| Variável              | Destino   | Observação                                                 |
| --------------------- | --------- | ---------------------------------------------------------- |
| `DATABASE_URL`        | API       | PostgreSQL com TLS no provedor quando disponível           |
| `JWT_SECRET`          | API       | segredo aleatório com 32 ou mais caracteres                |
| `QR_SIGNING_SECRET`   | API       | segredo diferente do JWT, também com 32 ou mais caracteres |
| `TMDB_API_READ_TOKEN` | API       | token server-side da TMDB                                  |
| `CORS_ORIGIN`         | API       | origem HTTPS exata do web, sem barra final                 |
| `APP_PUBLIC_URL`      | API       | mesma origem pública usada nos links compartilhados        |
| `NEXT_PUBLIC_API_URL` | build web | origem HTTPS da API com `/api/v1`                          |

Nunca use os valores de demonstração ou da CI em produção. Dados de cartão não fazem parte dessas variáveis porque não são enviados nem persistidos.

## Release

1. Construa as imagens de `Dockerfile.api` e `Dockerfile.web`.
2. Antes de trocar o tráfego da API, execute `pnpm --filter @event-platform/api db:migrate:deploy` com a mesma `DATABASE_URL` da release.
3. Inicie a API e aguarde `GET /api/v1/health/ready` responder `200`.
4. Inicie o web com `NEXT_PUBLIC_API_URL` definido no build.
5. Execute o smoke test abaixo e só então conclua a promoção.

Para validar as imagens localmente, crie um arquivo `.env.production.local` ignorado pelo Git com as variáveis exigidas e execute:

```powershell
docker compose --env-file .env.production.local -f docker-compose.production.yml build
docker compose --env-file .env.production.local -f docker-compose.production.yml run --rm api pnpm --filter @event-platform/api db:migrate:deploy
docker compose --env-file .env.production.local -f docker-compose.production.yml up -d
pnpm smoke
```

## Smoke test

O script verifica web, liveness, readiness e o documento OpenAPI. Para um ambiente remoto:

```powershell
$env:SMOKE_WEB_URL='https://eventos.exemplo.com'
$env:SMOKE_API_URL='https://api.eventos.exemplo.com'
pnpm smoke
```

Depois do smoke técnico, valide manualmente uma compra simulada e uma leitura na portaria usando contas exclusivas de homologação. Não execute o seed de demonstração em produção.

## Rollback

- reverta primeiro web e API para as imagens anteriores;
- migrations devem ser retrocompatíveis com a release anterior; não use `migrate reset`;
- preserve o volume/banco e investigue pelos `requestId` dos erros, sem registrar tokens, QR completo ou PII desnecessária.
