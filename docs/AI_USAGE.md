# Uso de IA

Este registro existe porque o desafio valoriza o processo, os artefatos produzidos e a explicação das escolhas.

## Ferramentas

- **Codex:** leitura e cruzamento do enunciado, estruturação dos artefatos de engenharia, implementação supervisionada, execução de testes e revisão.
- Outras ferramentas serão registradas quando forem efetivamente usadas.

## Marco 01 - Engenharia inicial

### Com auxílio de IA

- Conversão das decisões preliminares em requisitos rastreáveis.
- Primeira versão do modelo de domínio, contrato REST, ADRs, backlog e regras do repositório.

### Decisões humanas explicitadas

- Identificação de invariantes críticas: estoque atômico, pagamento idempotente, QR assinado e validação de uso único.
- Escolha de Next.js, NestJS, PostgreSQL, Prisma, TMDB e monorepo.
- Corte do mapa de assentos em favor de quantidade.
- Direção visual editorial/ticket culture.
- Priorização do fluxo ponta a ponta em vez de infraestrutura ou features amplas.

## Marco 02 - Fundação executável

### Com auxílio de IA


- Configuração inicial de Next.js, NestJS, Prisma e PostgreSQL, incluindo composição local com Docker.
- Implementação dos endpoints de liveness e readiness e da primeira tela editorial do produto.
- Criação do schema, da migration inicial e de um seed determinístico sem dependência da TMDB.
- Configuração de lint, formatação, typecheck, testes, build e integração contínua.
- Execução dos testes automatizados e de smoke tests dos serviços disponíveis no ambiente.

### Decisões humanas explicitadas

- Criação do monorepo com pnpm e Turborepo, separando web, API, E2E e contratos compartilhados.
- Node.js 24 LTS e pnpm 11 como baseline de execução.
- API local na porta 3333 e aplicação web na porta 3000.
- Readiness deve responder com indisponibilidade quando o PostgreSQL estiver fora do ar; liveness permanece independente do banco.
- Senhas do seed existem apenas para demonstração local e são armazenadas como hash.

### Validação no banco

- Em 2026-08-12, a migration foi aplicada em uma instância local do PostgreSQL 17.
- O seed foi executado duas vezes sem duplicar os quatro usuários ou os dois eventos de demonstração.
- O endpoint de readiness confirmou a dependência `database: up` em execução real.
- O Docker Compose permanece como alternativa de configuração; a validação deste marco utilizou a instalação nativa disponível na máquina.

## Marco 03 - Autenticação e autorização P0

### Com auxílio de IA

- Implementação de login, access token JWT, identidade atual e validação global de DTOs.
- Criação de guards reutilizáveis para autenticação e papéis, além da base de verificação de ownership.
- Padronização dos erros públicos de validação, autenticação e autorização com `requestId`.
- Testes dos três papéis, credencial inválida, token ausente ou inválido e acesso proibido.
- Implementação e teste do rate limit de login com política configurável e resposta pública 429.
- Smoke test contra o PostgreSQL local com as contas semeadas.

### Decisões humanas explicitadas

- Manter access token de uma hora sem refresh token no MVP.
- Recarregar identidade e papel do PostgreSQL em cada requisição protegida.
- Usar bcrypt com custo 12 e manter segredo JWT exclusivamente no servidor.
- Concluir primeiro o bloco P0 e, em seguida, fechar o rate limit P1 sem adicionar infraestrutura distribuída prematura.

## Marco 04 - Catálogo TMDB (Marco 3 do backlog)

### Com auxílio de IA

- Implementação do adapter server-side para busca, now-playing e detalhe de filmes.
- Normalização dos campos externos em contratos internos estáveis, incluindo URLs de pôster, paginação, runtime e gêneros.
- Tratamento de timeout, indisponibilidade, payload inválido, filme inexistente e configuração sem credencial.
- Proteção das rotas por JWT e papel `ORGANIZER`, com testes unitários e E2E sem chamadas externas instáveis.

### Decisões humanas explicitadas

- Manter o API Read Access Token exclusivamente no NestJS.
- Usar `fetch` nativo do Node.js 24, sem adicionar outra dependência HTTP.
- Adotar `pt-BR`, região `BR`, timeout padrão de cinco segundos e paginação limitada a 500.
- Permitir que a API inicialize sem token TMDB; somente o catálogo fica indisponível nesse caso.

## Marco 05 - Rascunhos e publicação (Marco 3 do backlog)

### Com auxílio de IA

- Implementação do módulo de eventos do organizador com criação, listagem, detalhe, edição e publicação.
- Persistência de snapshot recarregado da TMDB sem confiar em metadados enviados pelo browser.
- Validação de datas ISO com offset, fuso IANA, capacidade, preço em centavos e campos obrigatórios.
- Implementação de ownership, indicadores de reservas/vendas e publicação idempotente.
- Cobertura unitária e E2E para papéis, ownership, agenda inválida, edição restrita a rascunho e retry de publicação.

### Decisões humanas explicitadas

- Não criar migration: o modelo `Event` existente já cobre esta fatia do domínio.
- Manter rascunhos completos no MVP, com `availableQuantity` inicialmente igual à capacidade.
- Proteger edição e publicação com atualização condicional por dono e estado no PostgreSQL.
- Manter eventos persistidos independentes da disponibilidade posterior da TMDB.

## Marco 06 - Estúdio do organizador (Marco 3 do backlog)

### Com auxílio de IA

- Implementação da rota `/organizer` com login, sessão no navegador e gerenciamento dos eventos do usuário atual.
- Criação da busca TMDB, seleção por pôster, formulário de sessão, edição do rascunho e publicação.
- Tratamento visual explícito de carregamento, vazio, indisponibilidade, sucesso, rascunho e evento publicado.
- Aplicação da direção “programação impressa + cultura de ingressos”, com status textuais, linhas de destacamento e hierarquia editorial.
- Validação funcional e visual no navegador real em desktop e viewport móvel, sem erro de console ou overflow horizontal.

### Decisões humanas explicitadas

- Reutilizar `@event-platform/contracts` no web em vez de duplicar tipos da API.
- Manter o JWT em `sessionStorage` durante o MVP, sem criar refresh token ou persistência duradoura.
- Permitir imagens remotas somente do host oficial da TMDB e exibir sua atribuição.
- Não adicionar biblioteca de componentes, formulários, estado ou ícones nesta fase.

## Como este arquivo será mantido

Cada marco deve registrar o que a IA ajudou a produzir, quais decisões foram revisadas pelo autor e quais partes foram feitas manualmente. O histórico de commits complementa este documento.
