# ADR 007 - Política de cancelamento após pagamento aprovado

- Status: aceito
- Data: 2026-08-14

## Contexto

O MVP simula aprovação ou recusa, mas não movimenta dinheiro nem possui provedor capaz de executar ou auditar reembolsos. Cancelar um evento com vendas aprovadas exigiria definir estorno, comunicação, invalidação de ingressos já compartilhados ou utilizados e reconciliação financeira.

Marcar pagamentos aprovados como reembolsados sem uma transação correspondente criaria um comportamento enganoso e ampliaria o fluxo central sem aumentar sua demonstração técnica.

## Decisão

- O cliente pode cancelar somente uma reserva `PENDING_PAYMENT`; o estoque é devolvido atomicamente uma única vez.
- Pagamento `DECLINED`, reserva expirada ou reserva pendente cancelada encerram a tentativa; uma nova compra exige nova reserva.
- Após `APPROVED`, a venda é final no MVP. A reserva permanece `PAID` e seus ingressos não podem ser cancelados pelo cliente.
- Um evento publicado com venda aprovada não pode ser cancelado pelo organizador no MVP.
- Não haverá endpoint, status ou mensagem de “reembolso simulado”. A UI não apresenta uma ação que o domínio não possa concluir de forma verdadeira.

## Consequências

- Estoque pago não retorna à disponibilidade e ingressos emitidos preservam seu ciclo `VALID -> USED`.
- O fluxo implementado permanece consistente com o modelo de pagamento apenas demonstrativo e sem dados de cartão.
- `EventStatus.CANCELED` e `TicketStatus.CANCELED` permanecem reservados para evolução futura, sem transição pública na API v1.
- Uma versão futura deverá definir provedor/ledger de reembolso, idempotência, auditoria, comunicação, tratamento de ingresso já utilizado e uma transação única para invalidar ingressos e recompor somente o estoque aplicável.
