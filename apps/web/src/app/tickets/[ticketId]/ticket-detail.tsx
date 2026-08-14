'use client';

import type {
  CustomerTicket,
  TicketQrResponse,
  TicketShareLinkResponse,
} from '@event-platform/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { SiteHeader } from '@/components/site-header';
import { TicketQr } from '@/components/ticket-qr';
import { TicketStatus } from '@/components/ticket-status';
import { ApiClientError, apiRequest, errorMessage } from '@/lib/api';
import { CUSTOMER_TOKEN_KEY } from '@/lib/customer-session';
import { formatTicketEventDate } from '@/lib/event-format';

export function TicketDetail({ ticketId }: { ticketId: string }) {
  const [token, setToken] = useState('');
  const [sessionReady, setSessionReady] = useState(false);
  const [ticket, setTicket] = useState<CustomerTicket | null>(null);
  const [qr, setQr] = useState<TicketQrResponse | null>(null);
  const [share, setShare] = useState<TicketShareLinkResponse | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [qrCopied, setQrCopied] = useState(false);

  const loadTicket = useCallback(
    async (accessToken: string) => {
      setBusy('load');
      setError('');
      try {
        const detail = await apiRequest<CustomerTicket>(
          `/tickets/${ticketId}`,
          {
            token: accessToken,
          },
        );
        setTicket(detail);
        if (detail.status === 'VALID') {
          try {
            setQr(
              await apiRequest<TicketQrResponse>(`/tickets/${ticketId}/qr`, {
                token: accessToken,
              }),
            );
          } catch (caught) {
            if (!(caught instanceof ApiClientError && caught.status === 409)) {
              throw caught;
            }
          }
        }
      } catch (caught) {
        if (caught instanceof ApiClientError && caught.status === 401) {
          window.sessionStorage.removeItem(CUSTOMER_TOKEN_KEY);
          setToken('');
          setError('Sua sessão terminou. Abra a carteira e entre novamente.');
        } else if (caught instanceof ApiClientError && caught.status === 404) {
          setError('Ingresso não encontrado nesta carteira.');
        } else {
          setError(errorMessage(caught));
        }
      } finally {
        setBusy('');
      }
    },
    [ticketId],
  );

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const storedToken =
        window.sessionStorage.getItem(CUSTOMER_TOKEN_KEY) ?? '';
      setToken(storedToken);
      setSessionReady(true);
      if (storedToken) void loadTicket(storedToken);
    });
    return () => {
      active = false;
    };
  }, [loadTicket]);

  async function createShare() {
    setBusy('share');
    setError('');
    setCopied(false);
    try {
      const response = await apiRequest<TicketShareLinkResponse>(
        `/tickets/${ticketId}/share-links`,
        { method: 'POST', token },
      );
      setShare(response);
      setTicket((current) =>
        current ? { ...current, hasActiveShareLink: true } : current,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy('');
    }
  }

  async function revokeShare() {
    setBusy('revoke');
    setError('');
    try {
      await apiRequest<void>(`/tickets/${ticketId}/share-link`, {
        method: 'DELETE',
        token,
      });
      setShare(null);
      setTicket((current) =>
        current ? { ...current, hasActiveShareLink: false } : current,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy('');
    }
  }

  async function copyShare() {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.url);
      setCopied(true);
    } catch {
      setError(
        'Não foi possível copiar automaticamente. Selecione o link abaixo.',
      );
    }
  }

  async function copyQrCode() {
    if (!qr) return;
    try {
      await navigator.clipboard.writeText(qr.code);
      setQrCopied(true);
    } catch {
      setError('Não foi possível copiar automaticamente o código do ingresso.');
    }
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <Link className="button-quiet" href="/tickets">
          ← Voltar à carteira
        </Link>

        {!sessionReady || busy === 'load' ? <TicketLoading /> : null}

        {sessionReady && !token ? (
          <div className="mx-auto mt-12 max-w-xl border border-ink bg-surface p-7 text-center">
            <span className="ticket-number mx-auto">Sessão necessária</span>
            <h1 className="mt-5 text-3xl font-black uppercase">
              Abra este ingresso pela sua carteira.
            </h1>
            <Link className="button-primary mt-6" href="/tickets">
              Entrar na carteira
            </Link>
          </div>
        ) : null}

        {ticket && busy !== 'load' ? (
          <article className="mt-8 grid overflow-hidden border border-ink bg-surface lg:grid-cols-[1fr_22rem]">
            <section className="p-6 sm:p-9">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <span className="ticket-number">
                  Ingresso {String(ticket.sequence).padStart(2, '0')}
                </span>
                <TicketStatus status={ticket.status} />
              </div>
              <p className="eyebrow mt-10">Entrada individual</p>
              <h1 className="mt-2 max-w-3xl text-5xl leading-[0.92] font-black tracking-[-0.055em] uppercase sm:text-7xl">
                {ticket.event.title}
              </h1>
              <dl className="mt-10 grid gap-6 border-y border-dashed border-line py-6 sm:grid-cols-2">
                <div>
                  <dt className="font-mono text-[0.65rem] font-bold tracking-wider text-muted uppercase">
                    Data e horário
                  </dt>
                  <dd className="mt-2 text-sm font-bold leading-6">
                    {formatTicketEventDate(ticket.event)}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[0.65rem] font-bold tracking-wider text-muted uppercase">
                    Local
                  </dt>
                  <dd className="mt-2 text-sm font-bold leading-6">
                    {ticket.event.venueName}
                    <br />
                    <span className="font-normal text-muted">
                      {ticket.event.address} · {ticket.event.city}
                    </span>
                  </dd>
                </div>
              </dl>

              <section className="mt-8" aria-labelledby="share-title">
                <h2 className="text-xl font-black uppercase" id="share-title">
                  Compartilhar ingresso
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                  O novo link substitui qualquer link anterior. Ele não revela
                  nome, e-mail ou dados do pagamento.
                </p>
                {share ? (
                  <div className="mt-4 border border-success bg-success-soft p-4">
                    <label
                      className="text-xs font-bold uppercase"
                      htmlFor="share-url"
                    >
                      Link pronto
                    </label>
                    <input
                      className="field-control mt-2 font-mono text-xs"
                      id="share-url"
                      readOnly
                      value={share.url}
                    />
                    <p className="mt-2 text-xs text-success">
                      Válido até{' '}
                      {new Date(share.expiresAt).toLocaleString('pt-BR')}.
                    </p>
                    <button
                      className="button-secondary mt-3"
                      onClick={() => void copyShare()}
                      type="button"
                    >
                      {copied ? 'Link copiado' : 'Copiar link'}
                    </button>
                  </div>
                ) : ticket.hasActiveShareLink ? (
                  <p className="mt-4 border border-warning bg-warning-soft p-4 text-sm text-warning">
                    Existe um link ativo. Como o token não é armazenado, gere
                    outro para copiar um novo endereço ou revogue o atual.
                  </p>
                ) : null}
                {ticket.status === 'VALID' ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      className="button-primary"
                      disabled={Boolean(busy)}
                      onClick={() => void createShare()}
                      type="button"
                    >
                      {busy === 'share'
                        ? 'Gerando...'
                        : ticket.hasActiveShareLink
                          ? 'Substituir link'
                          : 'Gerar link'}
                    </button>
                    {ticket.hasActiveShareLink ? (
                      <button
                        className="button-secondary"
                        disabled={Boolean(busy)}
                        onClick={() => void revokeShare()}
                        type="button"
                      >
                        {busy === 'revoke' ? 'Revogando...' : 'Revogar link'}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </section>
            </section>

            <aside className="ticket-cut flex flex-col items-center border-t border-dashed border-ink bg-paper p-6 text-center lg:border-t-0 lg:border-l">
              <p className="font-mono text-xs font-black tracking-[0.18em] uppercase">
                Apresente na entrada
              </p>
              <div className="mt-5 flex w-full justify-center">
                {qr ? (
                  <TicketQr code={qr.code} />
                ) : (
                  <div className="flex aspect-square w-full max-w-80 items-center justify-center border border-line bg-surface p-6 text-sm leading-6 text-muted">
                    QR indisponível para este ingresso.
                  </div>
                )}
              </div>
              {qr ? (
                <>
                  <p className="mt-4 text-xs leading-5 text-muted">
                    Código válido até{' '}
                    {new Date(qr.expiresAt).toLocaleString('pt-BR')}.
                  </p>
                  <button
                    className="button-quiet mt-3"
                    onClick={() => void copyQrCode()}
                    type="button"
                  >
                    {qrCopied
                      ? 'Código copiado'
                      : 'Copiar código para entrada manual'}
                  </button>
                  <details className="mt-3 w-full max-w-80 border border-line bg-surface p-3 text-left">
                    <summary className="cursor-pointer text-xs font-black tracking-wider uppercase">
                      Exibir código técnico
                    </summary>
                    <label
                      className="mt-3 block text-[0.65rem] font-bold text-muted uppercase"
                      htmlFor="ticket-technical-code"
                    >
                      Código completo
                    </label>
                    <textarea
                      className="field-control mt-1 min-h-28 resize-y font-mono text-[0.6rem] leading-4"
                      id="ticket-technical-code"
                      readOnly
                      value={qr.code}
                    />
                  </details>
                </>
              ) : null}
              <p className="mt-auto pt-6 font-mono text-[0.62rem] font-bold tracking-widest text-muted uppercase">
                ID {ticket.id.slice(0, 8)} · #
                {String(ticket.sequence).padStart(2, '0')}
              </p>
            </aside>
          </article>
        ) : null}

        {error ? (
          <div
            className="mx-auto mt-6 max-w-2xl border border-error bg-error-soft p-4 text-sm text-error"
            role="alert"
          >
            {error}
          </div>
        ) : null}
      </div>
    </main>
  );
}

function TicketLoading() {
  return (
    <div
      className="flex min-h-96 items-center justify-center text-center"
      role="status"
    >
      <div>
        <span className="loading-mark" />
        <p className="mt-4 font-mono text-xs font-bold tracking-wider uppercase">
          Destacando ingresso
        </p>
      </div>
    </div>
  );
}
