# Regras do projeto

Este repositório implementa uma plataforma de eventos e ingressos.

## Antes de alterar código

1. Leia `docs/PRODUCT_REQUIREMENTS.md`.
2. Leia `docs/ARCHITECTURE.md` e `docs/DATABASE_MODEL.md`.
3. Leia `docs/API_CONTRACT.md` e o ADR relevante.
4. Confira o item correspondente em `docs/BACKLOG.md`.

## Regras obrigatórias

- Não altere decisões arquiteturais ou contratos públicos silenciosamente. Atualize documentação, testes e consumidores no mesmo trabalho.
- Não adicione dependências sem explicar a necessidade e verificar se a plataforma já oferece a capacidade.
- NestJS é a única fonte de verdade para autenticação, autorização, preço, estoque, pagamento e validação de ingresso.
- Nunca confie em `role`, preço, disponibilidade, total ou identidade enviados pelo front-end.
- Dinheiro é inteiro em centavos. Datas atravessam a API em ISO 8601 com offset e são persistidas em UTC.
- Mudanças de estoque, pagamento e uso de ingresso devem ser atômicas e cobertas por testes de concorrência ou idempotência.
- Segredos da TMDB, JWT e assinatura de QR nunca chegam ao navegador nem são versionados.
- Dados de cartão são apenas aparência da simulação e nunca são enviados nem persistidos.
- Nova regra de negócio exige teste. Correção de bug exige teste de regressão.
- Preserve a linguagem visual editorial definida em `docs/DESIGN_DIRECTION.md`.
- Prefira a solução simples que completa o fluxo. Não introduza microserviços, filas, Redis, CQRS ou abstrações especulativas.
- Não refatore arquivos fora do escopo da tarefa.

## Limites por área

- Front-end: `apps/web/**`
- Back-end: `apps/api/**`
- Contratos compartilhados: `packages/contracts/**`
- Banco e migrations: `apps/api/prisma/**`
- E2E: `apps/e2e/**`
- Decisões e contratos: `docs/**` (exigem revisão conjunta quando mudam comportamento público)

## Definição de pronto

- Critério de aceite do backlog atendido.
- Estados de sucesso, carregamento, vazio e erro tratados quando houver UI.
- Autorização validada no back-end.
- Testes relevantes adicionados e passando.
- Lint, typecheck e build passando nos pacotes afetados.
- Contrato OpenAPI e documentação atualizados quando aplicável.
- Nenhum segredo, dado de cartão ou PII desnecessário em log.
