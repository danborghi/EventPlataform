# ADR 005 - QR assinado e de uso único

- Status: aceito
- Data: 2026-08-10

## Contexto

Um UUID simples no QR pode ser alterado/tentado, e um QR estático pode ser fotografado e reapresentado.

## Decisão

Assinar payload versionado com HMAC-SHA-256 e segredo separado do JWT. Após verificação, consumir o ingresso com transição condicional no banco.

## Consequências

- Alteração do payload é detectada.
- Uma foto ainda pode ser apresentada, mas somente a primeira validação correta é aprovada.
- Rotação de segredo/payload exige versionamento explícito.
