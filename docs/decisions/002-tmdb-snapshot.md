# ADR 002 - TMDB com snapshot

- Status: aceito
- Data: 2026-08-10

## Contexto

O organizador deve criar evento a partir de API externa, mas eventos próprios não podem depender dela para cada visualização.

## Decisão

Usar TMDB no back-end e copiar para `Event` os campos necessários quando o filme é selecionado. `sourceTitle` preserva a origem; `title` nomeia a sessão. A API recarrega o ID e não confia no snapshot enviado pelo navegador.

O adapter usa a API v3 com Bearer API Read Access Token exclusivamente no servidor, timeout curto e respostas internas normalizadas. Busca e now-playing não são um espelho persistente do catálogo.

## Consequências

- A integração externa fica evidente no fluxo de criação.
- Eventos continuam disponíveis em falha da TMDB.
- Atualizações posteriores do filme não alteram silenciosamente um evento publicado.
