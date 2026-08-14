# Revisão de qualidade do Marco 8

Data: 2026-08-14.

## Acessibilidade

- O Playwright executa Axe nas regras WCAG 2 A/AA e bloqueia impactos `serious` ou `critical` no marketplace.
- O contraste do acento editorial foi ajustado para `#c13a1b`; o teste não encontrou violações sérias/críticas depois da mudança.
- Formulários possuem labels, carregamentos e resultados usam regiões semânticas, o foco visível é global e os quatro resultados da portaria usam texto e símbolo além da cor.
- O fluxo principal e o dashboard foram percorridos pelo navegador em Chromium desktop. A validação manual em leitores de tela e dispositivos móveis reais continua recomendada antes de uma campanha pública.

## Performance

- O build de produção do Next conclui com marketplace, carteira, portaria e organizador pré-renderizados; detalhes parametrizados são renderizados sob demanda.
- Pôsteres usam o componente de imagem do Next e o leitor ZXing permanece no bundle da rota de portaria.
- No build local revisado, os chunks estáticos somam aproximadamente 1,25 MB sem compressão; o maior chunk possui aproximadamente 492 KB. Não foi identificado bloqueio para o MVP.
- Métricas reais de LCP, INP e cache devem ser coletadas na origem publicada, pois latência, CDN e compressão dependem da hospedagem.

## Segurança

- Helmet aplica CSP, proteção contra MIME sniffing, frame embedding e demais headers; HSTS é habilitado em produção.
- O OpenAPI diferencia rotas públicas e rotas Bearer protegidas. Testes de integração verificam headers, documento e requisito de segurança.
- `pnpm audit --prod --audit-level high` termina sem vulnerabilidades conhecidas. O `js-yaml` transitivo do Swagger foi fixado em `5.2.2` por override restrito; o script indireto de telemetria do Scarf permanece explicitamente bloqueado.
- JWT, assinatura de QR e TMDB continuam server-side. QR completo, tokens, cartão e PII desnecessária não entram em logs.
- Os rate limits em memória pressupõem uma única instância da API; uma topologia horizontal exige armazenamento compartilhado antes de escalar.

## Evidências automatizadas

- 64 testes unitários;
- 27 testes de integração da API;
- 3 cenários Playwright: compra/portaria/replay, Axe e dashboard/filtros;
- lint, typecheck, build, auditoria de dependências e smoke de produção local.
