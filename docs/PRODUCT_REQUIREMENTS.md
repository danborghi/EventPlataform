# Requisitos do produto

## 1. Objetivo

Entregar, uma plataforma web de eventos e ingressos que prove um fluxo simples de ponta a ponta e deixe explícitas as decisões de engenharia e design.

## 2. Perfis

### Organizador

Pesquisa filmes na TMDB, seleciona um item do catálogo, cria uma sessão, salva rascunho, publica e gerencia apenas os próprios eventos.

### Cliente

Navega pelos eventos publicados, escolhe quantidade, reserva, aprova ou recusa um pagamento simulado, acessa seus ingressos e compartilha um ingresso por link.

### Portaria

Seleciona um evento e valida um código pela câmera ou por digitação manual. Não pode criar eventos nem comprar ingressos.

## 3. Fluxo principal

1. Um organizador autenticado busca um filme na TMDB.
2. O sistema copia os dados necessários do filme para um novo evento em rascunho.
3. O organizador define um título comercial e informa início, término, fuso, local, endereço, cidade, capacidade e preço; depois publica.
4. Um cliente encontra o evento e reserva de 1 a 6 ingressos, respeitando o estoque.
5. A reserva segura a quantidade por 10 minutos.
6. O cliente simula aprovação ou recusa do pagamento.
7. A aprovação gera um ingresso individual por unidade; a recusa devolve o estoque.
8. O cliente abre o QR de um ingresso ou cria um link de compartilhamento.
9. A portaria valida o ingresso para o evento selecionado.
10. A primeira validação correta retorna `VALID`; tentativas posteriores retornam `ALREADY_USED`.

## 4. Requisitos funcionais

| ID    | Requisito                                                         | Prioridade              | Evidência esperada                                 |
| ----- | ----------------------------------------------------------------- | ----------------------- | -------------------------------------------------- |
| RF-01 | Exibir eventos publicados com data, local e preço                 | Obrigatório             | Lista e detalhe públicos                           |
| RF-02 | Buscar eventos publicados                                         | Obrigatório             | Busca textual por título/cidade/local              |
| RF-03 | Criar e gerenciar eventos como organizador                        | Obrigatório             | Rascunho, edição e publicação do próprio evento    |
| RF-04 | Consumir TMDB pelo back-end                                       | Obrigatório             | Busca e detalhe sem expor a chave                  |
| RF-05 | Reservar por quantidade sem venda duplicada                       | Obrigatório             | Operação atômica e teste concorrente               |
| RF-06 | Simular pagamento aprovado e recusado                             | Obrigatório             | Dois caminhos explícitos                           |
| RF-07 | Listar e exibir ingressos do cliente com QR                       | Obrigatório             | Um ingresso por unidade comprada                   |
| RF-08 | Compartilhar ingresso por link gerado                             | Obrigatório             | Token aleatório, revogável e sem PII desnecessária |
| RF-09 | Validar pela câmera e por entrada manual                          | Obrigatório             | Mesmo endpoint para os dois meios                  |
| RF-10 | Retornar válido, inválido, já usado ou evento errado              | Obrigatório             | Resultado inequívoco na UI e API                   |
| RF-11 | Impedir falsificação do QR                                        | Obrigatório             | Assinatura HMAC verificada no servidor             |
| RF-12 | Impedir duas validações do mesmo ingresso                         | Obrigatório             | Transição atômica `VALID -> USED`                  |
| RF-13 | Autenticar e autorizar três papéis                                | Obrigatório             | Guards e respostas 401/403                         |
| RF-14 | Semear 1 organizador, 2 clientes, 1 portaria e 1 evento publicado | Obrigatório             | Seed idempotente documentado                       |
| RF-15 | Filtrar eventos e oferecer dashboard                              | Diferencial             | Após o fluxo principal                             |
| RF-16 | Cancelar evento com recomposição de estoque aplicável             | Diferencial não adotado | ADR 007: venda aprovada é final no MVP             |

## 5. Requisitos não funcionais

- README deve permitir configurar banco, variáveis, seed e execução sem conhecimento prévio.
- Interface deve ser responsiva, acessível por teclado e comunicar estados assíncronos.
- Erros públicos usam um envelope estável e não expõem stack traces.
- Senhas usam hash forte; tokens e segredos não são persistidos em texto puro quando um hash é suficiente.
- Operações críticas são idempotentes ou protegidas por condição no banco.
- O projeto deve iniciar localmente com PostgreSQL via Docker Compose.
- O contrato HTTP deve ser documentado por OpenAPI/Swagger.
- Testes priorizam estoque, pagamento, autorização, QR e fluxo E2E.

## 6. Fora do escopo do MVP

- Mapa de assentos e setores numerados.
- Pagamento real e armazenamento de cartão.
- Nota fiscal, e-mail, aplicativo nativo e recuperação de senha.
- Revenda, transferência de titularidade e login social.
- Microserviços, broker, Redis, Kubernetes, CQRS e event sourcing.
- Cupons, recomendações e múltiplos provedores de catálogo.
- Reembolso e cancelamento de evento após pagamento aprovado.

## 7. Critério de sucesso do MVP

O MVP está pronto quando o cenário organizador cria/publica -> cliente reserva/paga -> ingresso é emitido -> portaria valida -> segunda validação é recusada funciona do navegador ao PostgreSQL, com seed, documentação e testes dos riscos centrais.
