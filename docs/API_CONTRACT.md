# Contrato REST v1

Status: **baseline para implementação**. Mudanças exigem atualização deste arquivo, OpenAPI, contratos compartilhados e consumidores.

## 1. Convenções

- Base URL: `/api/v1`.
- JSON em camelCase.
- Datas em ISO 8601 com offset; respostas normalizadas para UTC.
- Dinheiro em centavos.
- Autenticação: `Authorization: Bearer <accessToken>`.
- Paginação: `page` começa em 1; `pageSize` padrão 12 e máximo 50.
- IDs internos são UUID, tratados como strings.
- Resposta sem corpo usa HTTP 204.
- Campos desconhecidos em comandos são rejeitados.
- OpenAPI JSON: `/api/docs-json`; interface Swagger: `/api/docs`.

Resposta paginada:

```json
{
  "data": [],
  "meta": { "page": 1, "pageSize": 12, "total": 0, "totalPages": 0 }
}
```

Erro:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Revise os campos informados.",
    "details": { "fields": { "quantity": ["Deve ser entre 1 e 6."] } },
    "requestId": "req_01..."
  }
}
```

## 2. Tipos públicos principais

```ts
type UserRole = 'ORGANIZER' | 'CUSTOMER' | 'GATE';
type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELED';
type ReservationStatus =
  'PENDING_PAYMENT' | 'PAID' | 'DECLINED' | 'EXPIRED' | 'CANCELED';
type TicketStatus = 'VALID' | 'USED' | 'CANCELED';
type ValidationResult = 'VALID' | 'INVALID' | 'ALREADY_USED' | 'WRONG_EVENT';
```

`PublicEvent`:

```json
{
  "id": "uuid",
  "sourceTitle": "Interstellar",
  "title": "Interstellar - Sessão Especial",
  "description": "...",
  "posterUrl": "https://image.tmdb.org/...",
  "runtimeMinutes": 169,
  "startsAt": "2026-09-12T23:30:00.000Z",
  "endsAt": "2026-09-13T02:30:00.000Z",
  "timezone": "America/Sao_Paulo",
  "venueName": "Cine Teatro Londrina",
  "address": "Rua ...",
  "city": "Londrina",
  "priceCents": 3500,
  "availableQuantity": 120,
  "status": "PUBLISHED"
}
```

## 3. Health

### `GET /health/live`

Processo ativo. Retorna 200 sem consultar dependências.

### `GET /health/ready`

Retorna 200 quando PostgreSQL está acessível; 503 caso contrário.

## 4. Autenticação

### `POST /auth/login`

Público.

Validações: `email` deve ser válido e ter no máximo 255 caracteres; `password` deve ter entre 8 e 128 caracteres. Campos desconhecidos são rejeitados.

```json
{ "email": "client1@example.com", "password": "Test@123" }
```

200:

```json
{
  "accessToken": "jwt",
  "expiresIn": 3600,
  "user": {
    "id": "uuid",
    "name": "Cliente Um",
    "email": "client1@example.com",
    "role": "CUSTOMER"
  }
}
```

Erros: 400 `VALIDATION_ERROR`; 401 `INVALID_CREDENTIALS`; 429 `RATE_LIMITED`.

O login aceita por padrão até 5 tentativas em 60 segundos para cada combinação de IP e e-mail normalizado. Limite e janela são configuráveis no servidor. A resposta 429 usa o mesmo envelope público e não informa se a conta existe.

### `GET /auth/me`

Autenticado. Retorna o objeto `user` atual após recarregar identidade e papel do banco. Erros: 401 `UNAUTHENTICATED`.

## 5. Catálogo TMDB

Somente `ORGANIZER`. O API Read Access Token da TMDB fica no servidor. As consultas usam idioma `pt-BR`, região `BR` quando aplicável e nunca devolvem a credencial ao consumidor.

### `GET /catalog/movies?q={query}&page={page}`

`q` é obrigatório, tem 2..100 caracteres e é normalizado com `trim`. `page` é opcional, assume 1 e aceita inteiros de 1 a 500.

200:

```json
{
  "data": [
    {
      "externalProvider": "TMDB",
      "externalId": "157336",
      "title": "Interstellar",
      "originalTitle": "Interstellar",
      "overview": "...",
      "posterUrl": "https://image.tmdb.org/...",
      "releaseDate": "2014-11-05"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

### `GET /catalog/movies/now-playing?page={page}`

Mesmo item resumido e envelope paginado. `page` segue os mesmos limites e a consulta é regionalizada para o Brasil.

### `GET /catalog/movies/:externalId`

`externalId` aceita somente um inteiro positivo. A resposta 200 mantém os campos resumidos e acrescenta os campos normalizados:

```json
{
  "externalProvider": "TMDB",
  "externalId": "157336",
  "title": "Interestelar",
  "originalTitle": "Interstellar",
  "overview": "...",
  "posterUrl": "https://image.tmdb.org/t/p/w500/poster.jpg",
  "releaseDate": "2014-11-05",
  "runtimeMinutes": 169,
  "genres": ["Drama", "Ficção científica"]
}
```

Erros comuns: 401 `UNAUTHENTICATED`; 403 `FORBIDDEN`; 404 `CATALOG_ITEM_NOT_FOUND`; 502 `CATALOG_UNAVAILABLE`; 504 `CATALOG_TIMEOUT`. Token ausente, resposta inválida e falhas comuns da dependência resultam em 502 sem impedir a inicialização dos demais módulos da API.

## 6. Eventos públicos

### `GET /events`

Público. Exibe somente publicados, não cancelados e futuros.

Query:

- `q`: busca por título, local ou cidade;
- `city`: filtro exato normalizado (diferencial);
- `from` / `to`: intervalo ISO (diferencial);
- `page` / `pageSize`;
- ordenação fixa inicial: `startsAt asc`.

200: envelope paginado de `PublicEvent` resumido.

### `GET /events/:eventId`

Público. 200 `PublicEvent`; 404 `EVENT_NOT_FOUND` para evento inexistente, rascunho ou não publicável.

## 7. Eventos do organizador

Todos exigem `ORGANIZER` e ownership.

### `GET /organizer/events?status={status}&page={page}`

Lista somente eventos do usuário atual, incluindo rascunhos e cancelados. `status` aceita `DRAFT`, `PUBLISHED` ou `CANCELED`; `page` assume 1, aceita 1..500 e a resposta usa 20 itens por página.

### `POST /organizer/events`

O servidor recarrega o item da TMDB e cria o snapshot; não confia em título/pôster enviados pelo browser.

```json
{
  "externalProvider": "TMDB",
  "externalId": "157336",
  "title": "Interstellar - Sessão Especial",
  "startsAt": "2026-09-12T20:30:00-03:00",
  "endsAt": "2026-09-12T23:30:00-03:00",
  "timezone": "America/Sao_Paulo",
  "venueName": "Cine Teatro Londrina",
  "address": "Rua Exemplo, 100",
  "city": "Londrina",
  "capacity": 120,
  "priceCents": 3500
}
```

201: evento com `status: "DRAFT"` e `availableQuantity === capacity`. `sourceTitle`, `description`, `posterUrl` e `runtimeMinutes` são copiados do detalhe recarregado pelo servidor; nenhum snapshot enviado pelo browser é aceito.

Validações: título 2..120; capacidade 1..100000; preço 100..100000000; timezone IANA; início futuro; término posterior ao início.

Erros: 404 `CATALOG_ITEM_NOT_FOUND`; 422 `INVALID_EVENT_SCHEDULE`; 502/504 para catálogo.

### `GET /organizer/events/:eventId`

Retorna detalhes e indicadores simples calculados pelo servidor. `reservedQuantity` soma reservas `PENDING_PAYMENT` ainda válidas e `soldQuantity` soma reservas `PAID`.

### `PATCH /organizer/events/:eventId`

Somente rascunho. Aceita subconjunto de:

```json
{
  "startsAt": "2026-09-12T20:30:00-03:00",
  "endsAt": "2026-09-12T23:30:00-03:00",
  "timezone": "America/Sao_Paulo",
  "venueName": "Novo local",
  "address": "Novo endereço",
  "city": "Londrina",
  "capacity": 150,
  "priceCents": 4000
}
```

200: evento atualizado. Alterar `capacity` também redefine `availableQuantity`, operação segura porque somente rascunhos sem reservas podem ser editados. A transição usa condição `status = DRAFT` no banco. Erros: 403 `FORBIDDEN`; 404 `EVENT_NOT_FOUND`; 409 `EVENT_NOT_EDITABLE`; 422 `INVALID_EVENT_SCHEDULE`.

### `POST /organizer/events/:eventId/publish`

Sem corpo. Valida completude, fuso IANA, data futura e término posterior ao início. A transição usa condição `status = DRAFT` no banco; repetição em evento já publicado é idempotente e retorna 200 sem nova alteração.

Erros: 409 `EVENT_NOT_PUBLISHABLE`; 422 `INVALID_EVENT_SCHEDULE`.

O contrato v1 não oferece cancelamento de evento publicado. Conforme o ADR 007, uma venda aprovada é final no MVP; não existe reembolso simulado nem cancelamento de evento vendido.

## 8. Reservas

Exigem `CUSTOMER`.

### `POST /reservations`

```json
{ "eventId": "uuid", "quantity": 2 }
```

201:

```json
{
  "id": "uuid",
  "event": { "id": "uuid", "title": "Interstellar", "startsAt": "..." },
  "quantity": 2,
  "unitPriceCents": 3500,
  "totalPriceCents": 7000,
  "status": "PENDING_PAYMENT",
  "expiresAt": "2026-08-10T18:10:00.000Z"
}
```

Preço e total nunca são aceitos no corpo. A redução de estoque ocorre na mesma transação da criação.

Erros: 404 `EVENT_NOT_FOUND`; 409 `EVENT_NOT_AVAILABLE`; 409 `INSUFFICIENT_INVENTORY`; 422 `INVALID_QUANTITY`.

### `GET /reservations/:reservationId`

Somente dono. Retorna a reserva; quando paga, inclui IDs dos ingressos. Uma reserva expirada é reconciliada antes da resposta.

Erros: 404 `RESERVATION_NOT_FOUND`.

### `POST /reservations/:reservationId/cancel`

Cancela somente reserva `PENDING_PAYMENT`, devolvendo estoque atomically. É idempotente para a mesma reserva já cancelada.

Erros: 404 `RESERVATION_NOT_FOUND`; 409 `RESERVATION_NOT_CANCELABLE`.

Reservas `PAID`, `DECLINED` ou `EXPIRED` não são canceláveis. Em particular, uma reserva paga não devolve estoque e seus ingressos permanecem ativos.

## 9. Pagamento simulado

### `POST /reservations/:reservationId/payment`

Exige `CUSTOMER`, ownership e header `Idempotency-Key` (8..128 caracteres).

```json
{ "simulationResult": "APPROVED" }
```

200 aprovado:

```json
{
  "payment": { "id": "uuid", "status": "APPROVED", "amountCents": 7000 },
  "reservation": { "id": "uuid", "status": "PAID" },
  "tickets": [
    { "id": "uuid", "sequence": 1, "status": "VALID" },
    { "id": "uuid", "sequence": 2, "status": "VALID" }
  ]
}
```

200 recusado:

```json
{
  "payment": { "id": "uuid", "status": "DECLINED", "amountCents": 7000 },
  "reservation": { "id": "uuid", "status": "DECLINED" },
  "tickets": []
}
```

Erros: 400 `IDEMPOTENCY_KEY_REQUIRED`; 404 `RESERVATION_NOT_FOUND`; 409 `IDEMPOTENCY_KEY_REUSED`; 409 `RESERVATION_EXPIRED`; 409 `RESERVATION_NOT_PAYABLE`.

## 10. Ingressos

Exigem `CUSTOMER` e ownership, exceto link compartilhado.

### `GET /tickets/me?page={page}&status={status}`

Lista ingressos do cliente com resumo do evento, ordenados por evento futuro primeiro.

### `GET /tickets/:ticketId`

Retorna ingresso, evento e, quando usado, `usedAt`. Não retorna segredos de assinatura.

### `GET /tickets/:ticketId/qr`

200:

```json
{
  "code": "v1.<payload>.<signature>",
  "expiresAt": "2026-09-13T05:30:00.000Z"
}
```

O cliente renderiza `code` como QR. Erros: 404 `TICKET_NOT_FOUND`; 409 `TICKET_NOT_ACTIVE`.

### `POST /tickets/:ticketId/share-links`

Cria novo link e revoga o anterior ativo no MVP.

201:

```json
{
  "url": "https://app.example.com/tickets/shared/random-token",
  "expiresAt": "2026-09-13T05:30:00.000Z"
}
```

### `DELETE /tickets/:ticketId/share-link`

Revoga o link ativo. Retorna 204 mesmo quando não existe link ativo.

### `GET /tickets/shared/:shareToken`

Público, sujeito a rate limit. Retorna somente título, pôster, data/local, sequência, status e `qr.code`. Não retorna nome/e-mail do cliente.

Erros deliberadamente indistinguíveis: 404 `SHARED_TICKET_NOT_FOUND` para token inexistente, expirado ou revogado.

## 11. Portaria

Exige `GATE`.

### `GET /gate/events?q={query}`

Lista eventos publicados futuros/próximos necessários para selecionar o contexto de validação.

```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Interstellar",
      "startsAt": "2026-09-12T23:30:00.000Z",
      "endsAt": "2026-09-13T02:20:00.000Z",
      "timezone": "America/Sao_Paulo",
      "venueName": "Cine Teatro",
      "city": "Londrina"
    }
  ]
}
```

### `POST /gate/events/:eventId/validate`

O campo `code` é idêntico para câmera e entrada manual.
O endpoint limita cada IP a 120 tentativas por minuto no MVP.

```json
{ "code": "v1.<payload>.<signature>" }
```

200 válido:

```json
{
  "result": "VALID",
  "validatedAt": "2026-09-12T23:14:00.000Z",
  "ticket": { "id": "uuid", "sequence": 1 },
  "event": { "id": "uuid", "title": "Interstellar", "startsAt": "..." }
}
```

200 já usado:

```json
{
  "result": "ALREADY_USED",
  "usedAt": "2026-09-12T23:14:00.000Z",
  "event": { "id": "uuid", "title": "Interstellar" }
}
```

200 inválido ou evento errado:

```json
{ "result": "INVALID" }
```

```json
{ "result": "WRONG_EVENT" }
```

Resultados de domínio usam 200 para a estação continuar o fluxo sem tratar ingressos comuns como falha de transporte. Erros HTTP ficam reservados a autenticação, autorização, validação do request e indisponibilidade.

## 12. Matriz de acesso

| Recurso                         | Público | Organizer | Customer | Gate |
| ------------------------------- | ------: | --------: | -------: | ---: |
| Eventos publicados              |     Sim |       Sim |      Sim |  Sim |
| Catálogo / gerenciar eventos    |     Não |       Sim |      Não |  Não |
| Reservas / pagamento            |     Não |       Não |      Sim |  Não |
| Meus ingressos / compartilhar   |     Não |       Não |      Sim |  Não |
| Link compartilhado              |     Sim |       Sim |      Sim |  Sim |
| Seleção e validação na portaria |     Não |       Não |      Não |  Sim |

## 13. Códigos de erro transversais

| HTTP    | Code                                | Uso                                    |
| ------- | ----------------------------------- | -------------------------------------- |
| 400     | `VALIDATION_ERROR`                  | Corpo/query inválido                   |
| 401     | `UNAUTHENTICATED`                   | Token ausente/inválido                 |
| 403     | `FORBIDDEN`                         | Papel ou ownership incorreto           |
| 404     | `*_NOT_FOUND`                       | Recurso ausente ou oculto              |
| 409     | `*_NOT_*`, `INSUFFICIENT_INVENTORY` | Conflito de estado                     |
| 429     | `RATE_LIMITED`                      | Limite excedido                        |
| 500     | `INTERNAL_ERROR`                    | Falha inesperada sem detalhes internos |
| 502/504 | `CATALOG_*`                         | Falha da TMDB                          |
