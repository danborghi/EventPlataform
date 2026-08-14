# Backlog

Legenda: `P0` obrigatório para o fluxo principal; `P1` qualidade/diferencial forte; `P2` somente após P0/P1 estáveis.

## Marco 0 - Decisões

- [x] `P0` M0-01 Extrair e rastrear requisitos do enunciado.
- [x] `P0` M0-02 Aprovar arquitetura, domínio e contrato REST baseline.
- [x] `P0` M0-03 Registrar direção visual e política de uso de IA.
- [x] `P0` M0-04 Revisão humana e aceite da baseline antes do scaffold.

## Marco 1 - Fundação

- [x] `P0` M1-01 Criar pnpm workspace/Turborepo com `web`, `api`, `e2e` e `contracts`.
- [x] `P0` M1-02 Configurar lint, format, typecheck, testes e scripts raiz.
- [x] `P0` M1-03 Configurar PostgreSQL local e Prisma, mantendo Docker Compose como opção reproduzível.
- [x] `P0` M1-04 Criar, aplicar e validar primeira migration e seed idempotente.
- [x] `P0` M1-05 Criar `/health/live`, `/health/ready` e CI inicial.

> Migration e seed foram executados em PostgreSQL 17 local em 2026-08-12. O seed foi executado duas vezes para validar idempotência; o Docker Compose permanece disponível como alternativa reproduzível.

Aceite: ambiente reproduzível a partir do README e builds verdes.

## Marco 2 - Auth

- [x] `P0` M2-01 Login e `GET /auth/me`.
- [x] `P0` M2-02 JWT, RolesGuard e ownership.
- [x] `P0` M2-03 Seed de 1 organizer, 2 customers e 1 gate.
- [x] `P0` M2-04 Testes 401, 403 e credencial inválida.
- [x] `P1` M2-05 Rate limit de login.

Aceite: cada papel acessa apenas suas capacidades.

> O bloco P0 foi validado em 2026-08-12 com os três papéis, PostgreSQL real e testes do envelope de erro. O rate limit P1 foi concluído em 2026-08-13 com política configurável e teste da resposta 429.

## Marco 3 - Catálogo e eventos

- [x] `P0` M3-01 Adapter TMDB com timeout e erros normalizados.
- [x] `P0` M3-02 Busca, now-playing e detalhe de filme.
- [x] `P0` M3-03 Criar/editar rascunho com snapshot confiável.
- [x] `P0` M3-04 Publicar evento após validação.
- [x] `P0` M3-05 UI editorial de criação/gerenciamento.
- [x] `P0` M3-06 Testes de ownership e indisponibilidade TMDB.

Aceite: sessão publicada permanece navegável sem TMDB.

> M3-01 e M3-02 foram concluídos em 2026-08-13 com rotas exclusivas de organizador, normalização, timeout e testes unitários/E2E determinísticos. O smoke test contra a TMDB real depende apenas da inclusão do API Read Access Token no `.env` local ignorado.

> M3-03, M3-04 e M3-06 foram concluídos em 2026-08-13. Criação recarrega o filme e persiste snapshot confiável; edição/publicação exigem ownership e transição condicional de rascunho. Publicação é idempotente e leitura de eventos persistidos independe da TMDB.

> M3-05 foi concluído em 2026-08-13 com login do organizador, busca/seleção de filme, formulário de sessão, listagem, indicadores, edição e publicação. A interface foi validada em desktop e mobile contra a API e o PostgreSQL locais, incluindo restauração da sessão, ausência de overflow e indisponibilidade da TMDB sem estado vazio contraditório. Com isso, o Marco 3 está concluído; o smoke do catálogo real continua dependendo do token local.

## Marco 4 - Marketplace

- [x] `P0` M4-01 Lista pública com data, local e preço.
- [x] `P0` M4-02 Busca por título, local ou cidade.
- [x] `P0` M4-03 Detalhe com disponibilidade e CTA correto.
- [x] `P0` M4-04 Loading, empty, erro e responsividade.
- [ ] `P1` M4-05 Filtros por cidade e período — excluído do escopo final; permanece a busca textual obrigatória.

Aceite: evento seed pode ser encontrado e aberto sem autenticação.

> O bloco P0 foi concluído em 2026-08-13. A API expõe somente eventos publicados e futuros, com busca paginada por título, local ou cidade e detalhe público independente da TMDB. A interface trata carregamento, vazio, erro, pôster indisponível, disponibilidade e esgotamento. O CTA foi integrado ao checkout transacional no Marco 5.

## Marco 5 - Checkout

- [x] `P0` M5-01 Reserva transacional por quantidade.
- [x] `P0` M5-02 Expiração e devolução idempotente.
- [x] `P0` M5-03 Pagamento aprovado/recusado com idempotency key.
- [x] `P0` M5-04 UI de quantidade, resumo, relógio e simulação.
- [x] `P0` M5-05 Teste concorrente sem overselling.
- [x] `P0` M5-06 Testes de retry e devolução única.

Aceite: estoque nunca fica negativo e tickets nunca duplicam.

> O Marco 5 foi concluído em 2026-08-14. Reserva, cancelamento, expiração e pagamento usam transações e atualizações condicionais; a expiração também é reconciliada periodicamente e antes de novas reservas. Aprovação emite exatamente um ingresso por unidade, enquanto recusa, cancelamento e expiração devolvem estoque uma única vez. A UI foi validada contra API e PostgreSQL locais pelo caminho recusado, preservando o estoque seed; aprovação, concorrência e retries idempotentes estão cobertos por testes automatizados.

## Marco 6 - Tickets

- [x] `P0` M6-01 Emitir um ingresso por unidade.
- [x] `P0` M6-02 Meus ingressos e detalhe.
- [x] `P0` M6-03 Gerar/verificar token QR HMAC.
- [x] `P0` M6-04 Criar/revogar link por token hash.
- [x] `P0` M6-05 Página pública sem PII.
- [x] `P0` M6-06 Testar alteração de payload, expiração e link inválido.

Aceite: cada ingresso possui QR independente e link não enumerável.

> O Marco 6 foi concluído em 2026-08-14. A carteira e o detalhe exigem cliente autenticado e ownership; cada ingresso recebe token QR HMAC-SHA-256 independente, com segredo separado do JWT e verificação de Base64URL canônico. Links usam 32 bytes aleatórios, persistem somente SHA-256, substituem o anterior sob índice parcial único e podem ser revogados de forma idempotente. A página pública aplica rate limit e não expõe PII. Alteração de payload/assinatura, expiração, ownership, link inválido e revogação estão cobertos por testes; o fluxo completo também foi validado contra API e PostgreSQL locais.

## Marco 7 - Portaria

- [x] `P0` M7-01 Selecionar evento.
- [x] `P0` M7-02 Ler câmera com permissão/erro tratados.
- [x] `P0` M7-03 Permitir digitação/cola manual.
- [x] `P0` M7-04 Validar e consumir ingresso atomically.
- [x] `P0` M7-05 Exibir quatro resultados acessíveis.
- [x] `P0` M7-06 Testar replay, evento errado e corrida.

Aceite: primeira validação correta é a única aprovada.

> O Marco 7 foi concluído em 2026-08-14. A portaria exige papel `GATE`, fixa um evento operacional e usa o mesmo endpoint para câmera ZXing e entrada manual. O back-end verifica HMAC, expiração, evento e nonce antes da transição condicional `VALID -> USED`; `usedAt`, responsável e auditoria são gravados na mesma transação. Tentativas armazenam apenas fingerprint curto e o endpoint aplica rate limit. Os quatro resultados possuem símbolo, título e descrição além da cor. Replay, evento errado, token inválido e corrida estão cobertos por testes; o navegador confirmou `INVALID`, `VALID` e `ALREADY_USED` contra PostgreSQL real, além do fallback da câmera sem dispositivo.

## Marco 8 - Qualidade e entrega

- [x] `P0` M8-01 Playwright do fluxo ponta a ponta.
- [x] `P0` M8-02 Swagger/OpenAPI e README final.
- [x] `P0` M8-03 CI com lint, typecheck, unit, integration e builds.
- [ ] `P0` M8-04 Deploy e smoke test.
- [x] `P1` M8-05 Dashboard de organizador.
- [x] `P1` M8-06 Acessibilidade, performance e revisão de segurança.
- [x] `P1` M8-07 Fechar política para cancelamento após vendas pagas.
- [ ] `P2` M8-08 Mapa de assentos somente se todo o restante estiver estável.

> M8-01 a M8-03 foram concluídos em 2026-08-14. O Playwright percorre marketplace, reserva, pagamento aprovado, carteira, QR, primeiro acesso e replay na portaria contra a API e o PostgreSQL reais; Axe bloqueia violações sérias/críticas no marketplace. A API publica Swagger/OpenAPI e headers Helmet cobertos por teste. A CI provisiona PostgreSQL descartável, aplica migrations e seed, e executa formatação, lint, typecheck, unitários, integração, builds e Chromium. A preparação de M8-04 inclui imagens Docker, procedimento de migration e smoke automatizado; o item permanece aberto até uma hospedagem ser escolhida e o smoke remoto passar.

> M8-05 e M8-06 foram concluídos em 2026-08-14. O painel exibe capacidade, disponibilidade, reservas e vendas calculadas pelo servidor e agora filtra a programação por status. A revisão registrou acessibilidade automatizada, contraste, bundle de produção, headers, rate limits e auditoria de dependências em `docs/QUALITY_REVIEW.md`.

> M8-07 foi concluído por decisão de produto em 2026-08-14. O ADR 007 estabelece que somente reservas pendentes são canceláveis; após aprovação, a venda é final e não há cancelamento de evento vendido nem reembolso fictício no MVP. Nenhum endpoint foi adicionado porque essa é uma exclusão explícita de escopo, não um comportamento ausente.
