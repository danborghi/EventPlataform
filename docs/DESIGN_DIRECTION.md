# Direção visual

## Conceito

**Programação impressa + cultura de ingressos.** A interface deve lembrar cartazes, grades culturais, bilhetes destacáveis e carimbos de validação, sem imitar uma marca existente.

## Princípios

- Conteúdo antes de ornamento: pôster, título, data, local, preço e disponibilidade formam a hierarquia.
- Contraste editorial: títulos fortes, corpo sóbrio, números e datas com presença.
- Formas com função: serrilhas, linhas tracejadas e carimbos aparecem onde remetem a ingresso ou status.
- Poucos efeitos: sem glassmorphism, gradientes decorativos ou sombras generalizadas.
- Estados inequívocos: sucesso, recusa, erro e já utilizado não dependem apenas de cor.

## Tokens iniciais

| Papel      | Valor inicial |
| ---------- | ------------- |
| Papel      | `#F4F0E8`     |
| Tinta      | `#1D1D1B`     |
| Superfície | `#FFFDF8`     |
| Acento     | `#F04A24`     |
| Sucesso    | `#16794A`     |
| Alerta     | `#B76B00`     |
| Erro       | `#B42318`     |
| Borda      | `#C8C1B5`     |

Os valores podem ser refinados após protótipos, preservando o contraste WCAG AA.

## Tipografia

- Display: sans condensada ou grotesca expressiva, usada com moderação.
- Texto e controles: sans altamente legível.
- Números de ingresso/código: monoespaçada.

Preferir fontes variáveis auto-hospedadas ou fornecidas pelo framework, evitando dependência de fonte remota em runtime.

## Componentes característicos

- `EventPoster`: proporção consistente e fallback gráfico intencional.
- `DateBlock`: dia e mês com leitura imediata.
- `TicketCard`: duas zonas ligadas por linha de destacamento.
- `StatusStamp`: ícone, rótulo e descrição; nunca apenas cor.
- `AvailabilityMeter`: texto exato além do indicador visual.
- `GateResult`: ocupa a tela e pode ser reconhecido à distância.

## Telas prioritárias para protótipo

1. Lista pública de eventos.
2. Detalhe e seletor de quantidade.
3. Checkout simulado.
4. Ingresso individual e compartilhado.
5. Portaria em estados neutro, válido, já utilizado, inválido e evento errado.
6. Criação de evento a partir da busca TMDB.
