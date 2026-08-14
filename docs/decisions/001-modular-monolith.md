# ADR 001 - Monólito modular

- Status: aceito
- Data: 2026-08-10

## Contexto

O prazo é de sete dias e o domínio possui operações transacionais fortemente relacionadas: estoque, reserva, pagamento e ingresso.

## Decisão

Usar NestJS como monólito modular e única API, PostgreSQL como estado compartilhado e Next.js como cliente REST.

## Consequências

- Transações e execução local permanecem simples.
- Fronteiras de módulo ainda deixam responsabilidades explícitas.
- Escala independente e mensageria são adiadas; não há justificativa atual para seu custo operacional.
