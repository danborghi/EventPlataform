'use client';

import type {
  CustomerTicketListResponse,
  LoginResponse,
} from '@event-platform/contracts';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { SiteHeader } from '@/components/site-header';
import { TicketStatus } from '@/components/ticket-status';
import { ApiClientError, apiRequest, errorMessage } from '@/lib/api';
import { CUSTOMER_TOKEN_KEY } from '@/lib/customer-session';
import { formatTicketEventDate } from '@/lib/event-format';

export function TicketWallet() {
  const [token, setToken] = useState('');
  const [sessionReady, setSessionReady] = useState(false);
  const [tickets, setTickets] = useState<CustomerTicketListResponse | null>(
    null,
  );
  const [email, setEmail] = useState('client1@example.com');
  const [password, setPassword] = useState('Test@123');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadTickets = useCallback(async (accessToken: string) => {
    setBusy(true);
    setError('');
    try {
      setTickets(
        await apiRequest<CustomerTicketListResponse>('/tickets/me', {
          token: accessToken,
        }),
      );
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) {
        window.sessionStorage.removeItem(CUSTOMER_TOKEN_KEY);
        setToken('');
        setTickets(null);
        setError('Sua sessão terminou. Entre novamente para continuar.');
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const storedToken =
        window.sessionStorage.getItem(CUSTOMER_TOKEN_KEY) ?? '';
      setToken(storedToken);
      setSessionReady(true);
      if (storedToken) void loadTickets(storedToken);
    });
    return () => {
      active = false;
    };
  }, [loadTickets]);

  async function handleLogin(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      if (response.user.role !== 'CUSTOMER') {
        throw new ApiClientError(
          403,
          'FORBIDDEN',
          'Use uma conta de cliente para acessar os ingressos.',
        );
      }
      window.sessionStorage.setItem(CUSTOMER_TOKEN_KEY, response.accessToken);
      setToken(response.accessToken);
      await loadTickets(response.accessToken);
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  function logout() {
    window.sessionStorage.removeItem(CUSTOMER_TOKEN_KEY);
    setToken('');
    setTickets(null);
    setError('');
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <SiteHeader />
      <section className="border-b border-ink bg-surface">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
          <p className="eyebrow">Carteira digital</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
            <div>
              <h1 className="text-5xl leading-none font-black tracking-[-0.05em] uppercase sm:text-7xl">
                Meus ingressos
              </h1>
              <p className="mt-4 max-w-2xl leading-7 text-muted">
                Cada entrada possui um código independente. Compartilhe somente
                quando outra pessoa precisar apresentar o ingresso.
              </p>
            </div>
            {token ? (
              <button className="button-quiet" onClick={logout} type="button">
                Sair da carteira
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        {!sessionReady || (busy && !tickets && token) ? (
          <LoadingWallet />
        ) : null}

        {sessionReady && !token ? (
          <form
            className="mx-auto max-w-md border border-ink bg-surface p-6"
            onSubmit={handleLogin}
          >
            <span className="ticket-number">Acesso do cliente</span>
            <h2 className="mt-5 text-2xl font-black uppercase">
              Entre para abrir a carteira
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              A conta de demonstração já está preenchida.
            </p>
            <label
              className="mt-5 block text-xs font-bold uppercase"
              htmlFor="wallet-email"
            >
              E-mail
            </label>
            <input
              autoComplete="email"
              className="field-control mt-1"
              id="wallet-email"
              onChange={(input) => setEmail(input.target.value)}
              type="email"
              value={email}
            />
            <label
              className="mt-4 block text-xs font-bold uppercase"
              htmlFor="wallet-password"
            >
              Senha
            </label>
            <input
              autoComplete="current-password"
              className="field-control mt-1"
              id="wallet-password"
              onChange={(input) => setPassword(input.target.value)}
              type="password"
              value={password}
            />
            <button
              className="button-primary mt-5 w-full"
              disabled={busy}
              type="submit"
            >
              {busy ? 'Entrando...' : 'Abrir carteira'}
            </button>
          </form>
        ) : null}

        {tickets?.data.length === 0 ? (
          <div className="border border-dashed border-line bg-surface px-6 py-16 text-center">
            <span className="ticket-number mx-auto">Carteira vazia</span>
            <h2 className="mt-5 text-3xl font-black uppercase">
              Seu próximo ingresso começa na programação.
            </h2>
            <p className="mx-auto mt-3 max-w-xl leading-7 text-muted">
              Depois que um pagamento for aprovado, cada unidade aparecerá aqui
              com seu próprio QR code.
            </p>
            <Link className="button-primary mt-6" href="/">
              Ver programação
            </Link>
          </div>
        ) : null}

        {tickets?.data.length ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {tickets.data.map((ticket) => (
              <Link
                className="group grid min-h-64 grid-rows-[1fr_auto] border border-ink bg-surface transition-transform hover:-translate-y-1"
                href={`/tickets/${ticket.id}`}
                key={ticket.id}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="ticket-number">
                      Entrada {String(ticket.sequence).padStart(2, '0')}
                    </span>
                    <TicketStatus status={ticket.status} />
                  </div>
                  <h2 className="mt-7 text-3xl leading-none font-black tracking-[-0.04em] uppercase">
                    {ticket.event.title}
                  </h2>
                  <p className="mt-4 text-sm leading-6 text-muted">
                    {formatTicketEventDate(ticket.event)}
                  </p>
                  <p className="mt-1 text-sm font-bold">
                    {ticket.event.venueName} · {ticket.event.city}
                  </p>
                </div>
                <div className="flex items-center justify-between border-t border-dashed border-line bg-paper px-5 py-4 text-xs font-black tracking-wider uppercase">
                  <span>
                    {ticket.hasActiveShareLink
                      ? 'Link ativo'
                      : 'Uso individual'}
                  </span>
                  <span className="text-accent group-hover:underline">
                    Abrir ingresso →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : null}

        {error ? (
          <div
            className="mx-auto mt-5 max-w-2xl border border-error bg-error-soft p-4 text-sm text-error"
            role="alert"
          >
            <p>{error}</p>
            {token ? (
              <button
                className="button-quiet mt-3"
                onClick={() => void loadTickets(token)}
                type="button"
              >
                Tentar novamente
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}

function LoadingWallet() {
  return (
    <div
      className="flex min-h-72 items-center justify-center text-center"
      role="status"
    >
      <div>
        <span className="loading-mark" />
        <p className="mt-4 font-mono text-xs font-bold tracking-wider uppercase">
          Conferindo ingressos
        </p>
      </div>
    </div>
  );
}
