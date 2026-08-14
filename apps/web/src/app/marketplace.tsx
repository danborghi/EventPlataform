'use client';

import type {
  PaginationMeta,
  PublicEvent,
  PublicEventListResponse,
} from '@event-platform/contracts';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { PublicEventCard } from '@/components/public-event-card';
import { SiteHeader } from '@/components/site-header';
import { apiRequest, errorMessage } from '@/lib/api';

type LoadStatus = 'loading' | 'ready' | 'error';

const initialMeta: PaginationMeta = {
  page: 1,
  pageSize: 12,
  total: 0,
  totalPages: 0,
};

export function Marketplace() {
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [meta, setMeta] = useState(initialMeta);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [error, setError] = useState('');
  const requestSequence = useRef(0);

  const loadEvents = useCallback(async (query: string, page: number) => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setStatus('loading');
    setError('');

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '12',
      });
      if (query) params.set('q', query);
      const response = await apiRequest<PublicEventListResponse>(
        `/events?${params.toString()}`,
      );
      if (requestSequence.current !== sequence) return;
      setEvents(response.data);
      setMeta(response.meta);
      setStatus('ready');
    } catch (caught) {
      if (requestSequence.current !== sequence) return;
      setEvents([]);
      setError(errorMessage(caught));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void loadEvents('', 1);
    });
    return () => {
      active = false;
      requestSequence.current += 1;
    };
  }, [loadEvents]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    if (query.length === 1) {
      setError('Digite pelo menos 2 caracteres para buscar.');
      setStatus('error');
      return;
    }
    setActiveSearch(query);
    void loadEvents(query, 1);
  }

  function clearSearch() {
    setSearch('');
    setActiveSearch('');
    void loadEvents('', 1);
  }

  function changePage(page: number) {
    void loadEvents(activeSearch, page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <SiteHeader />

      <section className="border-b border-ink bg-surface">
        <div className="mx-auto grid max-w-7xl lg:grid-cols-[1.35fr_0.65fr]">
          <div className="border-b border-ink px-5 py-12 sm:px-8 sm:py-16 lg:border-r lg:border-b-0 lg:py-20">
            <p className="eyebrow">Cinema, encontros e boas histórias</p>
            <h1 className="mt-5 max-w-4xl text-5xl leading-[0.88] font-black tracking-[-0.065em] uppercase sm:text-7xl lg:text-8xl">
              Escolha sua próxima sessão.
            </h1>
          </div>
          <div className="flex flex-col justify-between gap-10 px-5 py-8 sm:px-8 lg:py-12">
            <p className="max-w-md text-base leading-7 text-muted">
              Programação independente, lugares singulares e ingressos sem
              rodeios. Encontre por filme, espaço ou cidade.
            </p>
            <span className="ticket-number">PROGRAMA / 2026</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <form
          className="grid gap-3 border border-ink bg-surface p-3 sm:grid-cols-[1fr_auto]"
          onSubmit={handleSearch}
          role="search"
        >
          <div>
            <label className="sr-only" htmlFor="event-search">
              Buscar eventos por título, local ou cidade
            </label>
            <input
              className="field-control border-0 bg-transparent"
              id="event-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filme, local ou cidade"
              type="search"
              value={search}
            />
          </div>
          <button className="button-primary min-w-36" type="submit">
            Buscar sessões
          </button>
        </form>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
          <div>
            <p className="eyebrow">Em cartaz</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] uppercase sm:text-4xl">
              {activeSearch
                ? `Resultados para “${activeSearch}”`
                : 'Próximas sessões'}
            </h2>
          </div>
          {activeSearch ? (
            <button
              className="button-quiet"
              onClick={clearSearch}
              type="button"
            >
              Limpar busca
            </button>
          ) : null}
        </div>

        {status === 'loading' ? <MarketplaceLoading /> : null}

        {status === 'error' ? (
          <div
            className="my-8 border border-error bg-error-soft p-6"
            role="alert"
          >
            <p className="font-black uppercase">A programação não carregou.</p>
            <p className="mt-2 text-sm leading-6 text-error">{error}</p>
            <button
              className="button-secondary mt-5"
              onClick={() => void loadEvents(activeSearch, meta.page || 1)}
              type="button"
            >
              Tentar novamente
            </button>
          </div>
        ) : null}

        {status === 'ready' && events.length === 0 ? (
          <div className="my-8 border border-ink bg-surface px-6 py-14 text-center">
            <span className="ticket-number mx-auto">SEM SESSÕES</span>
            <h3 className="mt-5 text-3xl font-black uppercase">
              Nada por aqui ainda.
            </h3>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">
              Tente outro filme, espaço ou cidade. Novas sessões entram na
              programação assim que são publicadas.
            </p>
            {activeSearch ? (
              <button
                className="button-primary mt-6"
                onClick={clearSearch}
                type="button"
              >
                Ver toda a programação
              </button>
            ) : null}
          </div>
        ) : null}

        {status === 'ready' && events.length > 0 ? (
          <>
            <div className="grid border-b border-x border-ink lg:grid-cols-3">
              {events.map((event, index) => (
                <PublicEventCard
                  event={event}
                  key={event.id}
                  sequence={(meta.page - 1) * meta.pageSize + index + 1}
                />
              ))}
            </div>
            <nav
              aria-label="Paginação da programação"
              className="mt-6 flex items-center justify-between gap-4"
            >
              <button
                className="button-secondary"
                disabled={meta.page <= 1}
                onClick={() => changePage(meta.page - 1)}
                type="button"
              >
                ← Anterior
              </button>
              <span className="font-mono text-xs font-bold tracking-wider uppercase">
                Página {meta.page} de {Math.max(meta.totalPages, 1)} ·{' '}
                {meta.total} {meta.total === 1 ? 'sessão' : 'sessões'}
              </span>
              <button
                className="button-secondary"
                disabled={meta.page >= meta.totalPages}
                onClick={() => changePage(meta.page + 1)}
                type="button"
              >
                Próxima →
              </button>
            </nav>
          </>
        ) : null}
      </section>
    </main>
  );
}

function MarketplaceLoading() {
  return (
    <div
      aria-label="Carregando programação"
      className="grid border-b border-x border-ink lg:grid-cols-3"
      role="status"
    >
      {[1, 2, 3].map((item) => (
        <div className="border-t border-ink bg-surface p-5" key={item}>
          <div className="aspect-[2/3] animate-pulse bg-line/50" />
          <div className="mt-5 h-12 animate-pulse bg-line/50" />
          <div className="mt-3 h-5 w-3/4 animate-pulse bg-line/50" />
          <span className="sr-only">Carregando programação...</span>
        </div>
      ))}
    </div>
  );
}
