# Plano de desenvolvimento

## Estratégia

Construir em fatias verticais pequenas. Cada fase termina com um comportamento demonstrável e critérios verificáveis. Front-end e back-end só trabalham em paralelo depois desta baseline de domínio e contrato ser aprovada.

## Fase 0 - Engenharia

**Entregas:** requisitos, arquitetura, banco, contrato REST, direção visual, ADRs, backlog, regras e registro de IA.

**Saída:** nenhuma ambiguidade crítica sobre papéis, inventário, pagamento, QR ou ownership.

## Fase 1 - Fundação

**Entregas:** pnpm workspace, Turborepo, Next.js, NestJS, pacote de contratos, PostgreSQL/Prisma, Docker Compose, env examples, lint/format/typecheck, Jest e healthchecks.

**Critério de saída:** `pnpm install`, banco, migration, seed, web, API e builds funcionam conforme README; CI inicial verde.

## Fase 2 - Auth e seed

**Entregas:** User, hash de senha, login, JWT, guards de papel, ownership base, quatro contas e eventos seed.

**Critério de saída:** três papéis logam; acessos cruzados retornam 403; seed é idempotente.

## Fase 3 - Catálogo + organizador

**Entregas:** adapter TMDB, busca/now-playing/detalhe, formulário de evento, snapshot, rascunho, edição e publicação.

**Critério de saída:** organizador cria e publica uma sessão usando um filme real; evento persiste e funciona sem nova consulta à TMDB.

## Fase 4 - Marketplace

**Entregas:** lista, busca obrigatória, detalhe, disponibilidade, responsividade e estados de UI.

**Critério de saída:** público encontra evento por título/local/cidade e entende data, local, preço e estoque.

## Fase 5 - Reserva + pagamento

**Entregas:** reserva de 10 minutos, redução/devolução atômica, expiração idempotente, checkout e resultados aprovado/recusado.

**Critério de saída:** teste concorrente prova ausência de overselling; retries não duplicam pagamento nem ingresso; recusa/expiração devolvem estoque uma vez.

## Fase 6 - Ingressos + compartilhamento

**Entregas:** um ticket por unidade, meus ingressos, detalhe, QR HMAC, link aleatório, revogação e página pública mínima.

**Critério de saída:** token alterado é inválido; link não enumera tickets nem revela PII.

## Fase 7 - Portaria

**Entregas:** seleção de evento, câmera, fallback manual, quatro resultados, consumo atômico e histórico de tentativas.

**Critério de saída:** válido -> já utilizado; evento A em portaria B -> evento errado; duas validações concorrentes aprovam uma.

## Fase 8 - Qualidade e diferenciais

**Entregas:** dashboard, filtros, cancelamento se regra aprovada, accessibility pass, rate limit, logs, skeletons, empty/error states e polimento visual.

**Critério de saída:** fluxo completo agradável em mobile e desktop; nenhum bloqueio de acessibilidade crítico.

## Fase 9 - Verificação e entrega

**Entregas:** Playwright do fluxo central, CI completo, Swagger, README final, screenshots, deploy e revisão de segurança.

**Critério de saída:** clone limpo reproduz ambiente; aplicação publicada; limitações documentadas; histórico de commits legível.

## Ordem diária sugerida para sete dias

| Dia | Meta                                                     |
| --- | -------------------------------------------------------- |
| 1   | Fase 0 + fundação                                        |
| 2   | Auth/seed + início catálogo                              |
| 3   | Organizador + marketplace                                |
| 4   | Reserva + pagamento                                      |
| 5   | Tickets + compartilhamento + portaria                    |
| 6   | Testes, UX, responsividade e diferenciais de baixo risco |
| 7   | Deploy, documentação, revisão e margem de correção       |

Se houver atraso, cortar diferenciais antes de reduzir testes dos invariantes ou deixar o fluxo principal incompleto.

## Estratégia de branches e commits

- Branch principal sempre executável.
- Uma feature pequena por branch/PR quando o tempo permitir.
- Commits descrevem intenção: `docs: freeze reservation contract`, `feat(api): reserve inventory atomically`.
- Não produzir um único commit final; o histórico deve contar a evolução.
