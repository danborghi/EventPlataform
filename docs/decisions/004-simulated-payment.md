# ADR 004 - Pagamento simulado e idempotente

- Status: aceito
- Data: 2026-08-10

## Contexto

O desafio não exige transação financeira real e exige os caminhos de confirmação e recusa.

## Decisão

Exibir um checkout realista, mas enviar apenas `APPROVED` ou `DECLINED`. Exigir chave de idempotência e nunca enviar/persistir número ou CVV.

## Consequências

- Ambos os resultados podem ser avaliados deterministically.
- Não há escopo PCI ou integração externa desnecessária.
- Uma recusa encerra a reserva e devolve estoque; nova tentativa exige nova reserva.
