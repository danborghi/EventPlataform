# Arquitetura

## 1. Visão geral

O sistema é um monorepo TypeScript com duas aplicações e contratos compartilhados:

```text
Browser
  |
  | HTTPS / JSON
  v
Next.js (apps/web)
  |
  | REST
  v
NestJS (apps/api)
  |-- Auth
  |-- Catalog
  |-- Events
  |-- Reservations
  |-- Payments
  |-- Tickets
  `-- Gate
  |
  | Prisma
  v
PostgreSQL

NestJS Catalog ---> TMDB API
```

O Next.js entrega interface e estado de apresentação. Ele não duplica regras de negócio nem acessa o banco. O NestJS é a única autoridade para autenticação, autorização, preço, estoque, pagamento, emissão e validação.

## 2. Estrutura alvo

```text
apps/
  api/
    src/
      auth/
      catalog/
      events/
      reservations/
      payments/
      tickets/
      gate/
      common/
    prisma/
  web/
    src/
      app/
      components/
      features/
      lib/
  e2e/
packages/
  contracts/
docs/
  decisions/
```

Módulos podem depender de contratos e portas públicas de outro módulo, nunca de detalhes internos. A primeira versão pode usar Prisma diretamente em services pequenos; repositories são introduzidos quando isolam uma consulta transacional ou melhoram testabilidade, não como camada cerimonial.

## 3. Fronteiras dos módulos

| Módulo       | Responsabilidade                                  | Não faz                                |
| ------------ | ------------------------------------------------- | -------------------------------------- |
| Auth         | Login, JWT, identidade e papéis                   | Cadastro público, recuperação de senha |
| Catalog      | Adaptar busca/detalhe da TMDB                     | Persistir catálogo completo            |
| Events       | Snapshot do filme, rascunho, publicação, listagem | Controlar reservas/pagamentos          |
| Reservations | Segurar e devolver inventário                     | Aprovar pagamento                      |
| Payments     | Simular resultado e coordenar emissão             | Receber/processar cartão               |
| Tickets      | Consultar ingresso, QR e compartilhamento         | Consumir ingresso na portaria          |
| Gate         | Verificar token e consumir ingresso atomically    | Editar ou reemitir ingresso            |

## 4. Autenticação e autorização

- `POST /auth/login` recebe e-mail/senha e devolve access token curto e dados mínimos do usuário.
- O MVP usa Bearer JWT. Renovação de token pode ser adicionada depois se o prazo permitir.
- A interface do organizador mantém o access token em `sessionStorage`: a sessão sobrevive a reloads na mesma aba e é descartada ao encerrar a sessão do navegador. O MVP não persiste JWT em cookie ou armazenamento duradouro.
- `JwtAuthGuard` valida assinatura e expiração, usa apenas `sub` como identidade do token e recarrega o usuário do PostgreSQL; `RolesGuard` valida o papel atual `ORGANIZER`, `CUSTOMER` ou `GATE`.
- Ownership é regra separada: um organizador só altera os próprios eventos; um cliente só lê suas reservas e ingressos.
- Senhas usam bcrypt com custo 12 no seed. Login usa comparação constante inclusive para e-mails desconhecidos, reduzindo diferença observável de tempo.
- Login limita por padrão 5 tentativas por minuto para cada combinação de IP e e-mail normalizado. O MVP usa armazenamento em memória porque opera em uma instância; uma implantação horizontal exigirá storage compartilhado antes de escalar a API.

## 5. Integração TMDB

O browser nunca chama a TMDB diretamente. `CatalogModule`:

1. recebe a busca;
2. chama a API v3 da TMDB com `fetch` nativo, Bearer API Read Access Token e timeout configurável de 5 segundos;
3. normaliza somente campos usados pela UI;
4. devolve erro de dependência estável quando necessário.

Busca e detalhe usam `pt-BR`; now-playing também envia a região `BR`. URLs de pôster são montadas no servidor. A ausência da credencial não derruba liveness, readiness, autenticação ou eventos já persistidos: apenas as rotas de catálogo respondem `CATALOG_UNAVAILABLE`.

Ao criar um evento, a API consulta o filme pelo ID e persiste um snapshot confiável (`sourceTitle`, `description`, `posterUrl`, `runtimeMinutes` e `externalId`). `title` é o nome comercial informado pelo organizador. Eventos publicados continuam disponíveis se a TMDB estiver fora do ar.

Rascunhos pertencem ao organizador autenticado e podem ser editados apenas enquanto `status = DRAFT`. Edição e publicação usam atualização condicional por ID, dono e estado para impedir que uma edição concorrente atravesse a publicação. Publicar novamente um evento já publicado é idempotente e não consulta a TMDB.

A interface `/organizer` mantém estados explícitos de autenticação, carregamento, catálogo vazio/indisponível, criação, edição e publicação. Pôsteres remotos são aceitos apenas de `image.tmdb.org`, e a atribuição exigida pela TMDB aparece na etapa de catálogo.

## 6. Estoque e reserva

`availableQuantity` representa unidades ainda não vendidas nem seguradas por reservas pendentes válidas.

A criação ocorre em uma transação:

```sql
UPDATE events
SET available_quantity = available_quantity - :quantity
WHERE id = :event_id
  AND status = 'PUBLISHED'
  AND starts_at > now()
  AND available_quantity >= :quantity;
```

Se nenhuma linha for atualizada, a API responde `INSUFFICIENT_INVENTORY` (ou `EVENT_NOT_AVAILABLE` quando aplicável). A reserva nasce `PENDING_PAYMENT` e expira após 10 minutos.

Expiração é recuperada por um job periódico dentro do monólito e também antes de operações sensíveis. A recuperação usa atualização condicional de status; portanto, duas instâncias podem executar o job sem devolver estoque duas vezes.

## 7. Pagamento simulado

O formulário de cartão é puramente visual. O front-end envia somente:

```json
{ "simulationResult": "APPROVED" }
```

ou `DECLINED`. O endpoint exige `Idempotency-Key`.

- `APPROVED`: transação marca reserva como `PAID`, cria pagamento aprovado e cria exatamente `quantity` ingressos.
- `DECLINED`: transação marca reserva como `DECLINED`, cria pagamento recusado e devolve estoque uma vez.
- Repetição com mesma chave e payload devolve a resposta original.
- Mesma chave com payload diferente retorna conflito.
- Reserva já paga devolve os ingressos existentes sem duplicá-los.

### Política de cancelamento

Somente reservas `PENDING_PAYMENT` podem ser canceladas pelo cliente, com devolução atômica e única do estoque. Após pagamento `APPROVED`, a venda é final no MVP: não existe reembolso simulado, os ingressos permanecem emitidos e o organizador não pode cancelar um evento vendido. `EventStatus.CANCELED` e `TicketStatus.CANCELED` ficam reservados para evolução futura. A motivação e os requisitos para uma futura implementação estão no ADR 007.

## 8. QR e ingresso compartilhado

O texto do QR é um token composto por payload canônico em base64url e HMAC-SHA-256 com `QR_SIGNING_SECRET`, separado do segredo JWT. O payload inclui versão, `ticketId`, `eventId`, nonce, emissão e expiração. Alterar qualquer campo invalida a assinatura.

O token completo não é armazenado. O nonce permite revogação/rotação futura e seu hash é associado ao ingresso. A API só emite QR para ingresso acessível e válido.

O link compartilhado usa 32 bytes aleatórios. Apenas SHA-256 do token é persistido. A resposta pública mostra dados do evento, estado do ingresso e QR, mas não e-mail, documentos nem informações da conta.

## 9. Validação na portaria

1. Validar estrutura e HMAC antes de confiar no payload.
2. Comparar `eventId` do token com o evento selecionado.
3. Localizar ingresso e conferir nonce, expiração e cancelamento.
4. Executar transição condicional `VALID -> USED`.
5. Registrar toda tentativa com resultado, incluindo tokens inválidos por fingerprint.

Resultados de domínio são `VALID`, `INVALID`, `ALREADY_USED` e `WRONG_EVENT`. A validação concorrente aprova exatamente uma requisição.

## 10. Contratos e erros

`packages/contracts` contém tipos/esquemas gerados ou compartilhados a partir do contrato público. Ele não contém lógica de domínio nem modelos Prisma.

Envelope de erro:

```json
{
  "error": {
    "code": "INSUFFICIENT_INVENTORY",
    "message": "Não há ingressos suficientes para esta reserva.",
    "details": {},
    "requestId": "req_..."
  }
}
```

`code` é estável para decisões da UI; `message` é legível; `details` não expõe internals.

## 11. Observabilidade e segurança

- Um `requestId` acompanha logs e erros.
- Logs estruturados não incluem senha, JWT, QR completo, token de compartilhamento ou dados de cartão.
- Rate limiting é prioritário em login, links públicos e portaria.
- CORS permite apenas origens configuradas.
- Headers de segurança e validação global de DTOs ficam habilitados.
- Healthcheck diferencia processo vivo de dependência pronta.

## 12. Implantação

Desenvolvimento local usa Docker Compose para PostgreSQL. A implantação alvo mantém web e API separadas, com migrações executadas como etapa de release. Não há dependência de memória local para consistência; estado crítico vive no PostgreSQL.
