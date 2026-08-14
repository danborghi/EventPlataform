'use client';

import type {
  AuthUser,
  CatalogMovieListResponse,
  CatalogMovieSummary,
  CreateOrganizerEventRequest,
  LoginResponse,
  OrganizerEvent,
  OrganizerEventDetail,
  OrganizerEventListResponse,
  UpdateOrganizerEventRequest,
} from '@event-platform/contracts';
import Link from 'next/link';
import type { FormEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { MoviePoster } from '@/components/movie-poster';
import { ApiClientError, apiRequest, errorMessage } from '@/lib/api';

const SESSION_TOKEN_KEY = 'event-platform.organizer-token';

type WorkspaceMode = 'catalog' | 'event';

interface SessionFormState {
  title: string;
  startsAt: string;
  endsAt: string;
  venueName: string;
  address: string;
  city: string;
  capacity: string;
  price: string;
}

interface EditFormState {
  startsAt: string;
  endsAt: string;
  venueName: string;
  address: string;
  city: string;
  capacity: string;
  price: string;
}

function toLocalDateTime(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function initialSessionForm(): SessionFormState {
  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
  startsAt.setHours(20, 30, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1_000);

  return {
    title: '',
    startsAt: toLocalDateTime(startsAt),
    endsAt: toLocalDateTime(endsAt),
    venueName: '',
    address: '',
    city: 'Londrina',
    capacity: '120',
    price: '35,00',
  };
}

function editFormFromEvent(event: OrganizerEvent): EditFormState {
  return {
    startsAt: toLocalDateTime(new Date(event.startsAt)),
    endsAt: toLocalDateTime(new Date(event.endsAt)),
    venueName: event.venueName,
    address: event.address,
    city: event.city,
    capacity: String(event.capacity),
    price: (event.priceCents / 100).toFixed(2).replace('.', ','),
  };
}

function priceToCents(value: string): number {
  const normalized = value.replaceAll('.', '').replace(',', '.');
  return Math.round(Number(normalized) * 100);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatPrice(priceCents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(priceCents / 100);
}

function statusLabel(status: OrganizerEvent['status']): string {
  return {
    DRAFT: 'Rascunho',
    PUBLISHED: 'Publicado',
    CANCELED: 'Cancelado',
  }[status];
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-bold text-ink">
      <span className="flex items-end justify-between gap-3">
        {label}
        {hint ? (
          <small className="font-mono text-[0.65rem] font-normal tracking-wide text-muted uppercase">
            {hint}
          </small>
        ) : null}
      </span>
      {children}
    </label>
  );
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <div
      className="border-l-4 border-error bg-error-soft px-4 py-3 text-sm leading-6 text-error"
      role="alert"
    >
      <strong className="block text-xs tracking-[0.16em] uppercase">
        Não foi possível concluir
      </strong>
      {message}
    </div>
  );
}

function StatusStamp({ status }: { status: OrganizerEvent['status'] }) {
  return (
    <span className={`status-stamp status-${status.toLowerCase()}`}>
      {status === 'PUBLISHED' ? '✓ ' : status === 'CANCELED' ? '× ' : '○ '}
      {statusLabel(status)}
    </span>
  );
}

export function OrganizerStudio() {
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState('');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [email, setEmail] = useState('organizer@example.com');
  const [password, setPassword] = useState('Test@123');
  const [loginError, setLoginError] = useState('');
  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventStatus, setEventStatus] = useState<OrganizerEvent['status'] | ''>(
    '',
  );
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('catalog');
  const [selectedEvent, setSelectedEvent] =
    useState<OrganizerEventDetail | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [query, setQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState<CatalogMovieSummary[]>(
    [],
  );
  const [catalogSearched, setCatalogSearched] = useState(false);
  const [selectedMovie, setSelectedMovie] =
    useState<CatalogMovieSummary | null>(null);
  const [sessionForm, setSessionForm] = useState(initialSessionForm);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';

  useEffect(() => {
    const savedToken = window.sessionStorage.getItem(SESSION_TOKEN_KEY);
    let active = true;

    if (!savedToken) {
      queueMicrotask(() => {
        if (active) setBooting(false);
      });
      return () => {
        active = false;
      };
    }

    Promise.all([
      apiRequest<AuthUser>('/auth/me', { token: savedToken }),
      apiRequest<OrganizerEventListResponse>('/organizer/events?page=1', {
        token: savedToken,
      }),
    ])
      .then(([currentUser, eventList]) => {
        if (!active || currentUser.role !== 'ORGANIZER') return;
        setToken(savedToken);
        setUser(currentUser);
        setEvents(eventList.data);
      })
      .catch(() => window.sessionStorage.removeItem(SESSION_TOKEN_KEY))
      .finally(() => {
        if (active) setBooting(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function refreshEvents(
    accessToken = token,
    status: OrganizerEvent['status'] | '' = eventStatus,
  ): Promise<void> {
    setEventsLoading(true);
    try {
      const params = new URLSearchParams({ page: '1' });
      if (status) params.set('status', status);
      const response = await apiRequest<OrganizerEventListResponse>(
        `/organizer/events?${params.toString()}`,
        { token: accessToken },
      );
      setEvents(response.data);
    } finally {
      setEventsLoading(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('login');
    setLoginError('');

    try {
      const response = await apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });

      if (response.user.role !== 'ORGANIZER') {
        throw new ApiClientError(
          403,
          'FORBIDDEN',
          'Esta área é exclusiva para contas de organizador.',
        );
      }

      window.sessionStorage.setItem(SESSION_TOKEN_KEY, response.accessToken);
      setToken(response.accessToken);
      setUser(response.user);
      await refreshEvents(response.accessToken);
    } catch (caught) {
      setLoginError(errorMessage(caught));
    } finally {
      setBusy('');
    }
  }

  function logout() {
    window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
    setToken('');
    setUser(null);
    setEvents([]);
    setSelectedEvent(null);
    setSelectedMovie(null);
    setError('');
    setNotice('');
  }

  async function loadCatalog(mode: 'search' | 'now-playing') {
    if (mode === 'search' && query.trim().length < 2) {
      setError('Digite pelo menos dois caracteres para pesquisar.');
      return;
    }

    setBusy('catalog');
    setError('');
    setNotice('');
    setCatalogSearched(true);
    setSelectedMovie(null);

    try {
      const path =
        mode === 'search'
          ? `/catalog/movies?q=${encodeURIComponent(query.trim())}&page=1`
          : '/catalog/movies/now-playing?page=1';
      const response = await apiRequest<CatalogMovieListResponse>(path, {
        token,
      });
      setCatalogResults(response.data);
    } catch (caught) {
      setCatalogResults([]);
      setCatalogSearched(false);
      setError(
        caught instanceof ApiClientError &&
          caught.code === 'CATALOG_UNAVAILABLE'
          ? 'O catálogo ainda não está configurado. Adicione o token TMDB no servidor e tente novamente.'
          : errorMessage(caught),
      );
    } finally {
      setBusy('');
    }
  }

  function chooseMovie(movie: CatalogMovieSummary) {
    setSelectedMovie(movie);
    setSessionForm({ ...initialSessionForm(), title: movie.title });
    setError('');
    setNotice(`“${movie.title}” selecionado. Complete os dados da sessão.`);
  }

  async function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMovie) return;
    setBusy('create');
    setError('');
    setNotice('');

    const payload: CreateOrganizerEventRequest = {
      externalProvider: 'TMDB',
      externalId: selectedMovie.externalId,
      title: sessionForm.title,
      startsAt: new Date(sessionForm.startsAt).toISOString(),
      endsAt: new Date(sessionForm.endsAt).toISOString(),
      timezone,
      venueName: sessionForm.venueName,
      address: sessionForm.address,
      city: sessionForm.city,
      capacity: Number(sessionForm.capacity),
      priceCents: priceToCents(sessionForm.price),
    };

    try {
      const created = await apiRequest<OrganizerEvent>('/organizer/events', {
        method: 'POST',
        token,
        body: payload,
      });
      await refreshEvents();
      setSelectedMovie(null);
      setSessionForm(initialSessionForm());
      setNotice('Rascunho criado e snapshot do catálogo salvo com segurança.');
      await openEvent(created.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy('');
    }
  }

  async function openEvent(eventId: string) {
    setWorkspaceMode('event');
    setBusy('event');
    setError('');
    setNotice('');
    try {
      const detail = await apiRequest<OrganizerEventDetail>(
        `/organizer/events/${eventId}`,
        { token },
      );
      setSelectedEvent(detail);
      setEditForm(editFormFromEvent(detail));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy('');
    }
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEvent || !editForm) return;
    setBusy('save');
    setError('');
    setNotice('');

    const payload: UpdateOrganizerEventRequest = {
      startsAt: new Date(editForm.startsAt).toISOString(),
      endsAt: new Date(editForm.endsAt).toISOString(),
      timezone,
      venueName: editForm.venueName,
      address: editForm.address,
      city: editForm.city,
      capacity: Number(editForm.capacity),
      priceCents: priceToCents(editForm.price),
    };

    try {
      await apiRequest<OrganizerEvent>(
        `/organizer/events/${selectedEvent.id}`,
        { method: 'PATCH', token, body: payload },
      );
      await Promise.all([openEvent(selectedEvent.id), refreshEvents()]);
      setNotice('Alterações do rascunho salvas.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy('');
    }
  }

  async function publishEvent() {
    if (!selectedEvent) return;
    setBusy('publish');
    setError('');
    setNotice('');
    try {
      await apiRequest<OrganizerEvent>(
        `/organizer/events/${selectedEvent.id}/publish`,
        { method: 'POST', token },
      );
      await Promise.all([openEvent(selectedEvent.id), refreshEvents()]);
      setNotice(
        'Evento publicado. A sessão já está pronta para o marketplace.',
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy('');
    }
  }

  function startNewSession() {
    setWorkspaceMode('catalog');
    setSelectedEvent(null);
    setSelectedMovie(null);
    setCatalogResults([]);
    setCatalogSearched(false);
    setQuery('');
    setError('');
    setNotice('');
  }

  if (booting) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper p-6 text-ink">
        <div className="text-center" role="status">
          <span className="loading-mark" aria-hidden="true" />
          <p className="mt-5 font-mono text-xs tracking-[0.2em] uppercase">
            Abrindo o estúdio
          </p>
        </div>
      </main>
    );
  }

  if (!token || !user) {
    return (
      <main className="min-h-screen bg-paper px-5 py-6 text-ink sm:px-10 sm:py-10">
        <section className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl border border-line bg-surface lg:grid-cols-[1.1fr_0.9fr] sm:min-h-[calc(100vh-5rem)]">
          <div className="flex flex-col justify-between border-b border-line p-7 sm:p-12 lg:border-r lg:border-b-0">
            <Link
              className="w-fit text-xs font-black tracking-[0.2em] uppercase hover:text-accent"
              href="/"
            >
              ← Event Platform
            </Link>
            <div className="my-16">
              <p className="eyebrow">Área do organizador</p>
              <h1 className="mt-5 max-w-2xl text-5xl leading-[0.9] font-black tracking-[-0.05em] uppercase sm:text-7xl">
                Sua sessão começa no catálogo.
              </h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-muted">
                Escolha o filme, monte a ficha da sessão e publique quando cada
                detalhe estiver no lugar.
              </p>
            </div>
            <p className="font-mono text-xs leading-5 text-muted uppercase">
              Catálogo protegido · Snapshot confiável · Publicação idempotente
            </p>
          </div>

          <div className="flex items-center p-7 sm:p-12">
            <form className="w-full" onSubmit={handleLogin}>
              <span className="ticket-number">ACESSO / ORG</span>
              <h2 className="mt-7 text-3xl font-black tracking-tight uppercase">
                Entrar no estúdio
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Use a conta de organizador criada pelo seed local.
              </p>
              <div className="mt-8 grid gap-5">
                <Field label="E-mail">
                  <input
                    autoComplete="email"
                    className="field-control"
                    maxLength={255}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    type="email"
                    value={email}
                  />
                </Field>
                <Field label="Senha">
                  <input
                    autoComplete="current-password"
                    className="field-control"
                    minLength={8}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    type="password"
                    value={password}
                  />
                </Field>
              </div>
              {loginError ? (
                <div className="mt-5">
                  <ErrorNotice message={loginError} />
                </div>
              ) : null}
              <button
                className="button-primary mt-7 w-full"
                disabled={busy === 'login'}
                type="submit"
              >
                {busy === 'login' ? 'Autenticando…' : 'Entrar como organizador'}
              </button>
              <p className="mt-5 text-center font-mono text-[0.68rem] leading-5 text-muted uppercase">
                O acesso permanece somente nesta sessão do navegador.
              </p>
            </form>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-ink bg-surface">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-4 sm:gap-7">
            <Link
              className="shrink-0 text-xs font-black tracking-[0.2em] uppercase hover:text-accent"
              href="/"
            >
              Event Platform
            </Link>
            <span className="hidden h-5 w-px bg-line sm:block" />
            <span className="truncate text-xs font-bold tracking-wider text-muted uppercase">
              Estúdio do organizador
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-right text-xs sm:block">
              <strong className="block">{user.name}</strong>
              <span className="text-muted">{user.email}</span>
            </span>
            <button className="button-quiet" onClick={logout} type="button">
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[340px_1fr]">
        <aside className="border-b border-ink bg-surface lg:min-h-[calc(100vh-65px)] lg:border-r lg:border-b-0">
          <div className="border-b border-line p-5 sm:p-7">
            <button
              className="button-primary w-full"
              onClick={startNewSession}
              type="button"
            >
              + Nova sessão
            </button>
          </div>
          <div className="p-5 sm:p-7">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xs font-black tracking-[0.18em] uppercase">
                Sua programação
              </h2>
              <span className="font-mono text-xs text-muted">
                {String(events.length).padStart(2, '0')}
              </span>
            </div>
            <label className="mb-5 block text-xs font-bold uppercase">
              Filtrar por status
              <select
                className="field-control mt-2"
                disabled={eventsLoading}
                onChange={(input) => {
                  const status = input.target.value as
                    OrganizerEvent['status'] | '';
                  setEventStatus(status);
                  void refreshEvents(token, status);
                }}
                value={eventStatus}
              >
                <option value="">Todos</option>
                <option value="DRAFT">Rascunhos</option>
                <option value="PUBLISHED">Publicados</option>
                <option value="CANCELED">Cancelados</option>
              </select>
            </label>
            {eventsLoading ? (
              <p className="py-8 text-center font-mono text-xs text-muted uppercase">
                Atualizando…
              </p>
            ) : events.length ? (
              <ol className="grid gap-3">
                {events.map((event) => (
                  <li key={event.id}>
                    <button
                      className={`event-list-item ${selectedEvent?.id === event.id ? 'event-list-item-active' : ''}`}
                      onClick={() => void openEvent(event.id)}
                      type="button"
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[0.64rem] tracking-wider text-muted uppercase">
                          {formatDate(event.startsAt)}
                        </span>
                        <StatusStamp status={event.status} />
                      </span>
                      <strong className="mt-3 block text-left text-sm leading-5 uppercase">
                        {event.title}
                      </strong>
                      <span className="mt-2 block text-left text-xs text-muted">
                        {event.venueName} · {event.city}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="border border-dashed border-line px-5 py-8 text-center">
                <strong className="text-sm uppercase">Nenhuma sessão</strong>
                <p className="mt-2 text-xs leading-5 text-muted">
                  Comece escolhendo um filme do catálogo.
                </p>
              </div>
            )}
          </div>
        </aside>

        <section className="min-w-0 px-5 py-7 sm:px-8 sm:py-10 lg:px-12">
          <div className="mx-auto max-w-6xl">
            {notice ? (
              <div
                aria-live="polite"
                className="mb-7 border-l-4 border-success bg-success-soft px-4 py-3 text-sm text-success"
              >
                <strong className="mr-2">✓</strong>
                {notice}
              </div>
            ) : null}
            {error ? (
              <div className="mb-7">
                <ErrorNotice message={error} />
              </div>
            ) : null}

            {workspaceMode === 'catalog' ? (
              <CatalogWorkspace
                busy={busy}
                catalogResults={catalogResults}
                catalogSearched={catalogSearched}
                chooseMovie={chooseMovie}
                createDraft={createDraft}
                loadCatalog={loadCatalog}
                query={query}
                selectedMovie={selectedMovie}
                sessionForm={sessionForm}
                setQuery={setQuery}
                setSessionForm={setSessionForm}
                timezone={timezone}
              />
            ) : (
              <EventWorkspace
                busy={busy}
                editForm={editForm}
                publishEvent={publishEvent}
                saveDraft={saveDraft}
                selectedEvent={selectedEvent}
                setEditForm={setEditForm}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

interface CatalogWorkspaceProps {
  busy: string;
  catalogResults: CatalogMovieSummary[];
  catalogSearched: boolean;
  chooseMovie: (movie: CatalogMovieSummary) => void;
  createDraft: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  loadCatalog: (mode: 'search' | 'now-playing') => Promise<void>;
  query: string;
  selectedMovie: CatalogMovieSummary | null;
  sessionForm: SessionFormState;
  setQuery: (value: string) => void;
  setSessionForm: (value: SessionFormState) => void;
  timezone: string;
}

function CatalogWorkspace({
  busy,
  catalogResults,
  catalogSearched,
  chooseMovie,
  createDraft,
  loadCatalog,
  query,
  selectedMovie,
  sessionForm,
  setQuery,
  setSessionForm,
  timezone,
}: CatalogWorkspaceProps) {
  return (
    <div>
      <div className="border-b border-ink pb-7">
        <p className="eyebrow">01 / Escolha do filme</p>
        <h1 className="mt-4 text-4xl leading-none font-black tracking-[-0.04em] uppercase sm:text-6xl">
          Monte uma nova sessão
        </h1>
        <p className="mt-5 max-w-2xl text-sm leading-6 text-muted sm:text-base">
          Pesquise a TMDB pelo back-end. Ao salvar, o servidor recarrega o filme
          e registra um snapshot próprio.
        </p>
        <p className="mt-3 font-mono text-[0.62rem] leading-5 text-muted uppercase">
          This product uses the TMDB API but is not endorsed or certified by
          TMDB.
        </p>
      </div>

      <form
        className="mt-8 flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void loadCatalog('search');
        }}
      >
        <label className="sr-only" htmlFor="movie-search">
          Buscar filme
        </label>
        <input
          className="field-control min-w-0 flex-1"
          id="movie-search"
          maxLength={100}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Busque por título, por exemplo: Interestelar"
          type="search"
          value={query}
        />
        <button
          className="button-primary sm:min-w-36"
          disabled={busy === 'catalog'}
          type="submit"
        >
          {busy === 'catalog' ? 'Buscando…' : 'Buscar filme'}
        </button>
        <button
          className="button-secondary sm:min-w-36"
          disabled={busy === 'catalog'}
          onClick={() => void loadCatalog('now-playing')}
          type="button"
        >
          Em cartaz
        </button>
      </form>

      {busy === 'catalog' ? (
        <div
          className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
          role="status"
        >
          {Array.from({ length: 5 }).map((_, index) => (
            <div className="animate-pulse" key={index}>
              <div className="aspect-[2/3] bg-line/50" />
              <div className="mt-3 h-3 bg-line/50" />
              <div className="mt-2 h-3 w-2/3 bg-line/40" />
            </div>
          ))}
          <span className="sr-only">Carregando catálogo</span>
        </div>
      ) : catalogResults.length ? (
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-5">
          {catalogResults.map((movie) => (
            <button
              className={`movie-card ${selectedMovie?.externalId === movie.externalId ? 'movie-card-selected' : ''}`}
              key={movie.externalId}
              onClick={() => chooseMovie(movie)}
              type="button"
            >
              <MoviePoster posterUrl={movie.posterUrl} title={movie.title} />
              <span className="mt-3 block text-left text-sm leading-5 font-black uppercase">
                {movie.title}
              </span>
              <span className="mt-1 block text-left font-mono text-[0.65rem] text-muted">
                {movie.releaseDate?.slice(0, 4) ?? 'ANO —'} · TMDB{' '}
                {movie.externalId}
              </span>
            </button>
          ))}
        </div>
      ) : catalogSearched ? (
        <div className="mt-8 border border-dashed border-line px-6 py-12 text-center">
          <strong className="text-xl uppercase">Nenhum filme encontrado</strong>
          <p className="mt-2 text-sm text-muted">
            Tente outro título ou confira os filmes em cartaz.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            ['1', 'Pesquisar', 'Encontre um filme pelo catálogo protegido.'],
            ['2', 'Programar', 'Defina horário, local, capacidade e preço.'],
            ['3', 'Publicar', 'Revise o rascunho antes de abrir a sessão.'],
          ].map(([number, title, description]) => (
            <div className="border border-line p-5" key={number}>
              <span className="font-mono text-xs text-accent">
                {number.padStart(2, '0')}
              </span>
              <strong className="mt-5 block text-sm uppercase">{title}</strong>
              <p className="mt-2 text-xs leading-5 text-muted">{description}</p>
            </div>
          ))}
        </div>
      )}

      {selectedMovie ? (
        <form
          className="mt-12 border-t-4 border-ink bg-surface"
          onSubmit={(event) => void createDraft(event)}
        >
          <div className="grid lg:grid-cols-[260px_1fr]">
            <div className="border-b border-line p-5 lg:border-r lg:border-b-0 lg:p-7">
              <MoviePoster
                posterUrl={selectedMovie.posterUrl}
                sizes="260px"
                title={selectedMovie.title}
              />
              <p className="mt-4 font-mono text-[0.66rem] leading-5 text-muted uppercase">
                Fonte: TMDB · ID {selectedMovie.externalId}
                <br />O snapshot será recarregado ao salvar.
              </p>
            </div>
            <div className="p-5 sm:p-8">
              <p className="eyebrow">02 / Ficha da sessão</p>
              <h2 className="mt-3 text-3xl font-black uppercase">
                Dados do evento
              </h2>
              <div className="mt-7 grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Título comercial" hint="2–120 caracteres">
                    <input
                      className="field-control"
                      maxLength={120}
                      minLength={2}
                      onChange={(event) =>
                        setSessionForm({
                          ...sessionForm,
                          title: event.target.value,
                        })
                      }
                      required
                      value={sessionForm.title}
                    />
                  </Field>
                </div>
                <Field label="Início" hint={timezone}>
                  <input
                    className="field-control"
                    onChange={(event) =>
                      setSessionForm({
                        ...sessionForm,
                        startsAt: event.target.value,
                      })
                    }
                    required
                    type="datetime-local"
                    value={sessionForm.startsAt}
                  />
                </Field>
                <Field label="Término">
                  <input
                    className="field-control"
                    onChange={(event) =>
                      setSessionForm({
                        ...sessionForm,
                        endsAt: event.target.value,
                      })
                    }
                    required
                    type="datetime-local"
                    value={sessionForm.endsAt}
                  />
                </Field>
                <Field label="Local">
                  <input
                    className="field-control"
                    maxLength={160}
                    minLength={2}
                    onChange={(event) =>
                      setSessionForm({
                        ...sessionForm,
                        venueName: event.target.value,
                      })
                    }
                    placeholder="Cine Teatro Londrina"
                    required
                    value={sessionForm.venueName}
                  />
                </Field>
                <Field label="Cidade">
                  <input
                    className="field-control"
                    maxLength={120}
                    minLength={2}
                    onChange={(event) =>
                      setSessionForm({
                        ...sessionForm,
                        city: event.target.value,
                      })
                    }
                    required
                    value={sessionForm.city}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Endereço">
                    <input
                      className="field-control"
                      maxLength={255}
                      minLength={2}
                      onChange={(event) =>
                        setSessionForm({
                          ...sessionForm,
                          address: event.target.value,
                        })
                      }
                      placeholder="Rua das Artes, 100"
                      required
                      value={sessionForm.address}
                    />
                  </Field>
                </div>
                <Field label="Capacidade" hint="1–100.000">
                  <input
                    className="field-control"
                    max={100000}
                    min={1}
                    onChange={(event) =>
                      setSessionForm({
                        ...sessionForm,
                        capacity: event.target.value,
                      })
                    }
                    required
                    type="number"
                    value={sessionForm.capacity}
                  />
                </Field>
                <Field label="Preço" hint="R$ por ingresso">
                  <input
                    className="field-control"
                    inputMode="decimal"
                    onChange={(event) =>
                      setSessionForm({
                        ...sessionForm,
                        price: event.target.value,
                      })
                    }
                    pattern="[0-9.]+([,][0-9]{1,2})?"
                    required
                    value={sessionForm.price}
                  />
                </Field>
              </div>
              <div className="mt-8 flex flex-col-reverse gap-3 border-t border-dashed border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-muted">
                  Salvar cria um rascunho. Nada será publicado automaticamente.
                </p>
                <button
                  className="button-primary shrink-0"
                  disabled={busy === 'create'}
                  type="submit"
                >
                  {busy === 'create' ? 'Salvando…' : 'Salvar rascunho →'}
                </button>
              </div>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}

interface EventWorkspaceProps {
  busy: string;
  editForm: EditFormState | null;
  publishEvent: () => Promise<void>;
  saveDraft: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  selectedEvent: OrganizerEventDetail | null;
  setEditForm: (value: EditFormState) => void;
}

function EventWorkspace({
  busy,
  editForm,
  publishEvent,
  saveDraft,
  selectedEvent,
  setEditForm,
}: EventWorkspaceProps) {
  if (busy === 'event' && !selectedEvent) {
    return (
      <div className="grid min-h-[60vh] place-items-center" role="status">
        <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">
          Abrindo ficha da sessão…
        </p>
      </div>
    );
  }

  if (!selectedEvent || !editForm) return null;
  const editable = selectedEvent.status === 'DRAFT';

  return (
    <div>
      <div className="flex flex-col gap-6 border-b border-ink pb-7 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow">Ficha da sessão</p>
          <h1 className="mt-4 max-w-4xl text-4xl leading-[0.95] font-black tracking-[-0.04em] uppercase sm:text-6xl">
            {selectedEvent.title}
          </h1>
          <p className="mt-4 font-mono text-[0.68rem] tracking-wider text-muted uppercase">
            Evento {selectedEvent.id}
          </p>
        </div>
        <StatusStamp status={selectedEvent.status} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="w-full max-w-[260px]">
          <MoviePoster
            posterUrl={selectedEvent.posterUrl}
            sizes="260px"
            title={selectedEvent.sourceTitle}
          />
          <div className="border-x border-b border-line p-4">
            <span className="font-mono text-[0.66rem] text-muted uppercase">
              Snapshot TMDB / {selectedEvent.externalId}
            </span>
            <strong className="mt-2 block text-sm uppercase">
              {selectedEvent.sourceTitle}
            </strong>
            <p className="mt-3 text-xs leading-5 text-muted line-clamp-5">
              {selectedEvent.description || 'Descrição não informada.'}
            </p>
          </div>
        </aside>

        <div>
          <div className="grid grid-cols-2 border border-ink sm:grid-cols-4">
            {[
              ['Capacidade', selectedEvent.capacity],
              ['Disponíveis', selectedEvent.availableQuantity],
              ['Reservados', selectedEvent.reservedQuantity],
              ['Vendidos', selectedEvent.soldQuantity],
            ].map(([label, value], index) => (
              <div
                className={`p-4 ${index ? 'border-l border-ink' : ''}`}
                key={label}
              >
                <span className="block text-[0.62rem] font-bold tracking-wider text-muted uppercase">
                  {label}
                </span>
                <strong className="mt-2 block font-mono text-2xl">
                  {value}
                </strong>
              </div>
            ))}
          </div>

          <form
            className="mt-8 border-t-4 border-ink bg-surface p-5 sm:p-8"
            onSubmit={(event) => void saveDraft(event)}
          >
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="eyebrow">Programação</p>
                <h2 className="mt-2 text-2xl font-black uppercase">
                  Dados da sessão
                </h2>
              </div>
              <span className="ticket-number">
                {formatPrice(selectedEvent.priceCents)}
              </span>
            </div>

            <fieldset
              className="mt-7 grid gap-5 sm:grid-cols-2"
              disabled={!editable}
            >
              <Field label="Início">
                <input
                  className="field-control"
                  onChange={(event) =>
                    setEditForm({ ...editForm, startsAt: event.target.value })
                  }
                  required
                  type="datetime-local"
                  value={editForm.startsAt}
                />
              </Field>
              <Field label="Término">
                <input
                  className="field-control"
                  onChange={(event) =>
                    setEditForm({ ...editForm, endsAt: event.target.value })
                  }
                  required
                  type="datetime-local"
                  value={editForm.endsAt}
                />
              </Field>
              <Field label="Local">
                <input
                  className="field-control"
                  onChange={(event) =>
                    setEditForm({ ...editForm, venueName: event.target.value })
                  }
                  required
                  value={editForm.venueName}
                />
              </Field>
              <Field label="Cidade">
                <input
                  className="field-control"
                  onChange={(event) =>
                    setEditForm({ ...editForm, city: event.target.value })
                  }
                  required
                  value={editForm.city}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Endereço">
                  <input
                    className="field-control"
                    onChange={(event) =>
                      setEditForm({ ...editForm, address: event.target.value })
                    }
                    required
                    value={editForm.address}
                  />
                </Field>
              </div>
              <Field label="Capacidade">
                <input
                  className="field-control"
                  max={100000}
                  min={1}
                  onChange={(event) =>
                    setEditForm({ ...editForm, capacity: event.target.value })
                  }
                  required
                  type="number"
                  value={editForm.capacity}
                />
              </Field>
              <Field label="Preço" hint="R$ por ingresso">
                <input
                  className="field-control"
                  inputMode="decimal"
                  onChange={(event) =>
                    setEditForm({ ...editForm, price: event.target.value })
                  }
                  required
                  value={editForm.price}
                />
              </Field>
            </fieldset>

            <div className="mt-8 flex flex-col gap-3 border-t border-dashed border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
              {editable ? (
                <>
                  <button
                    className="button-secondary"
                    disabled={busy === 'save'}
                    type="submit"
                  >
                    {busy === 'save' ? 'Salvando…' : 'Salvar alterações'}
                  </button>
                  <button
                    className="button-primary"
                    disabled={busy === 'publish'}
                    onClick={() => void publishEvent()}
                    type="button"
                  >
                    {busy === 'publish' ? 'Publicando…' : 'Publicar evento →'}
                  </button>
                </>
              ) : (
                <p className="text-sm leading-6 text-muted">
                  Este evento está{' '}
                  {statusLabel(selectedEvent.status).toLowerCase()} e sua ficha
                  não pode mais ser editada.
                </p>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
