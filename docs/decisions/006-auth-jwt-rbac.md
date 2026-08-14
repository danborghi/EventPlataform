# ADR 006 - JWT e RBAC

- Status: aceito
- Data: 2026-08-10

## Contexto

Existem três papéis fixos e o prazo não exige cadastro, login social nem sessões administrativas complexas.

## Decisão

Usar access token JWT HMAC com validade padrão de 3600 segundos e guards no NestJS para papel e ownership. O token carrega `sub`; o guard recarrega identidade e papel do PostgreSQL antes de autorizar. Senhas usam bcrypt com custo 12. Login possui rate limit configurável, com padrão de 5 tentativas por minuto para cada combinação de IP e e-mail normalizado. O front-end esconde ações por UX, nunca como controle de segurança.

## Consequências

- Seed permite avaliar todos os papéis imediatamente.
- Refresh token e recuperação de senha ficam fora do MVP.
- Revogação imediata de access token depende de expiração curta na primeira versão.
- Mudança de papel ou remoção do usuário passa a valer na próxima requisição protegida, sem aguardar o token expirar.
- `JWT_SECRET` é obrigatório, possui no mínimo 32 caracteres e nunca é enviado ao navegador ou versionado com valor real.
- O contador do rate limit fica em memória no monólito de instância única. Escala horizontal exige um storage compartilhado; Redis não é introduzido antecipadamente no MVP.
