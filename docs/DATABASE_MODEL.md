# Modelo de dados

## 1. Convenções

- IDs: UUID gerado pelo banco ou pela aplicação de forma consistente.
- Datas: `timestamptz`, persistidas em UTC.
- Dinheiro: inteiro em centavos (`integer`), nunca ponto flutuante.
- Nomes Prisma em camelCase e colunas PostgreSQL em snake_case via mapping.
- `createdAt` e `updatedAt` nas entidades mutáveis.
- Índices e constraints são parte do modelo, mesmo quando exigem SQL na migration.

## 2. Entidades

### User

| Campo                 | Tipo      | Regra                           |
| --------------------- | --------- | ------------------------------- |
| id                    | UUID      | PK                              |
| name                  | string    | 2..100                          |
| email                 | string    | normalizado, unique             |
| passwordHash          | string    | nunca retornado                 |
| role                  | UserRole  | `ORGANIZER`, `CUSTOMER`, `GATE` |
| createdAt / updatedAt | timestamp | auditoria                       |

### Event

| Campo             | Tipo        | Regra                               |
| ----------------- | ----------- | ----------------------------------- |
| id                | UUID        | PK                                  |
| organizerId       | UUID        | FK User                             |
| externalProvider  | enum        | inicialmente `TMDB`                 |
| externalId        | string      | ID no provedor                      |
| sourceTitle       | string      | título original do snapshot TMDB    |
| title             | string      | título comercial do evento          |
| description       | text        | snapshot editável antes de publicar |
| posterUrl         | string?     | URL normalizada                     |
| runtimeMinutes    | int?        | snapshot                            |
| startsAt          | timestamptz | deve estar no futuro ao publicar    |
| endsAt            | timestamptz | posterior a `startsAt`              |
| timezone          | string      | IANA, ex. `America/Sao_Paulo`       |
| venueName         | string      | obrigatório                         |
| address           | string      | obrigatório                         |
| city              | string      | obrigatório                         |
| priceCents        | int         | `>= 100` no MVP                     |
| capacity          | int         | `> 0`                               |
| availableQuantity | int         | `0..capacity`                       |
| status            | EventStatus | `DRAFT`, `PUBLISHED`, `CANCELED`    |

Índices: `(status, startsAt)`, `(organizerId, createdAt)` e busca textual inicial por título/cidade/local. Para o MVP, busca pode usar `ILIKE`; full-text só entra mediante necessidade medida.

### Reservation

| Campo               | Tipo              | Regra                    |
| ------------------- | ----------------- | ------------------------ |
| id                  | UUID              | PK                       |
| customerId          | UUID              | FK User                  |
| eventId             | UUID              | FK Event                 |
| quantity            | int               | `1..6`                   |
| unitPriceCents      | int               | snapshot do evento       |
| totalPriceCents     | int               | calculado pelo servidor  |
| status              | ReservationStatus | estado do checkout       |
| expiresAt           | timestamptz       | criação + 10 min         |
| inventoryReleasedAt | timestamptz?      | prova de devolução única |

Estados: `PENDING_PAYMENT`, `PAID`, `DECLINED`, `EXPIRED`, `CANCELED`.

No contrato v1, `CANCELED` é alcançado somente a partir de `PENDING_PAYMENT`. Uma reserva `PAID` não transita para cancelada e seu estoque não é recomposto.

### Payment

| Campo          | Tipo          | Regra                               |
| -------------- | ------------- | ----------------------------------- |
| id             | UUID          | PK                                  |
| reservationId  | UUID          | FK e unique                         |
| amountCents    | int           | igual ao total da reserva           |
| status         | PaymentStatus | `APPROVED`, `DECLINED`              |
| idempotencyKey | string        | unique por cliente/ação             |
| requestHash    | string        | detecta reuso com payload diferente |
| createdAt      | timestamp     | auditoria                           |

Uma reserva tem no máximo um resultado de pagamento no MVP. Após recusa, o cliente cria nova reserva para tentar novamente.

### Ticket

| Campo         | Tipo         | Regra                       |
| ------------- | ------------ | --------------------------- |
| id            | UUID         | PK                          |
| reservationId | UUID         | FK Reservation              |
| customerId    | UUID         | FK User                     |
| eventId       | UUID         | FK Event                    |
| sequence      | int          | 1..quantity                 |
| status        | TicketStatus | `VALID`, `USED`, `CANCELED` |
| qrNonceHash   | string       | hash do nonce atual         |
| usedAt        | timestamptz? | preenchido junto de `USED`  |
| validatedById | UUID?        | FK User portaria            |

Constraint unique: `(reservationId, sequence)`. Ela impede emissão duplicada mesmo sob retry.

### ShareLink

| Campo     | Tipo         | Regra                                  |
| --------- | ------------ | -------------------------------------- |
| id        | UUID         | PK                                     |
| ticketId  | UUID         | FK Ticket                              |
| tokenHash | string       | unique, SHA-256                        |
| expiresAt | timestamptz  | após o encerramento estimado do evento |
| revokedAt | timestamptz? | revogação explícita                    |

Índice unique parcial: `(ticketId) WHERE revokedAt IS NULL`. Ele garante no máximo um link ativo por ingresso mesmo sob chamadas concorrentes.

### TicketValidation

| Campo            | Tipo             | Regra                                   |
| ---------------- | ---------------- | --------------------------------------- |
| id               | UUID             | PK                                      |
| ticketId         | UUID?            | nullable para token inválido            |
| eventId          | UUID             | evento selecionado na portaria          |
| gateUserId       | UUID             | FK User                                 |
| tokenFingerprint | string           | hash curto para correlação, nunca token |
| result           | ValidationResult | resultado público                       |
| createdAt        | timestamptz      | auditoria                               |

Resultados: `VALID`, `INVALID`, `ALREADY_USED`, `WRONG_EVENT`.

## 3. Relações

```text
User (ORGANIZER) 1 --- N Event
User (CUSTOMER)  1 --- N Reservation
Event            1 --- N Reservation
Reservation      1 --- 0..1 Payment
Reservation      1 --- N Ticket
Ticket           1 --- N ShareLink
Ticket           1 --- N TicketValidation
User (GATE)      1 --- N TicketValidation
```

## 4. Invariantes

1. `0 <= availableQuantity <= capacity`.
2. Cliente, preço unitário e total vêm do servidor.
3. Evento publicado não troca filme, capacidade, preço, local ou data no MVP; correções exigem regra explícita.
4. Apenas reserva pendente e não expirada pode ser paga.
5. Estoque é devolvido no máximo uma vez, comprovado por transição condicional e `inventoryReleasedAt`.
6. Reserva paga possui exatamente `quantity` ingressos.
7. Um ingresso só transita `VALID -> USED` uma vez.
8. `usedAt` e `validatedById` são preenchidos na mesma transação da validação.
9. O share token e o nonce não são persistidos em texto puro.
10. `sourceTitle` identifica o filme; `title` pode descrever a sessão sem perder a origem.
11. `endsAt > startsAt`; QR e compartilhamento expiram após a janela operacional do evento.

## 5. Seed obrigatório

| Papel       | E-mail                  | Senha de demonstração |
| ----------- | ----------------------- | --------------------- |
| Organizador | `organizer@example.com` | `Test@123`            |
| Cliente 1   | `client1@example.com`   | `Test@123`            |
| Cliente 2   | `client2@example.com`   | `Test@123`            |
| Portaria    | `gate@example.com`      | `Test@123`            |

O seed também cria um evento publicado futuro com estoque e um rascunho. Deve ser idempotente e identificado como dado de demonstração.
