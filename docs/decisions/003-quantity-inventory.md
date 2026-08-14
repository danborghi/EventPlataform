# ADR 003 - Inventário por quantidade

- Status: aceito
- Data: 2026-08-10

## Contexto

O desafio permite mapa de assentos ou quantidade. Assentos ampliam UI, locking e casos de concorrência sem aumentar a completude do fluxo central.

## Decisão

Implementar admissão geral por quantidade, com redução atômica no PostgreSQL e reservas de 10 minutos.

## Consequências

- O MVP cobre venda duplicada de modo demonstrável e testável.
- Setores e assentos ficam fora do modelo inicial.
- Um mapa só será considerado depois do fluxo completo, deploy e testes.
