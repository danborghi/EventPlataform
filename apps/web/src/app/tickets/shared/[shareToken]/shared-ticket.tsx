'use client';

import type { SharedTicketResponse } from '@event-platform/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SiteHeader } from '@/components/site-header';
import { TicketQr } from '@/components/ticket-qr';
import { TicketStatus } from '@/components/ticket-status';
import { ApiClientError, apiRequest, errorMessage } from '@/lib/api';
import { formatTicketEventDate } from '@/lib/event-format';

export function SharedTicket({ shareToken }: { shareToken: string }) {
  const [shared, setShared] = useState<SharedTicketResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiRequest<SharedTicketResponse>(`/tickets/shared/${shareToken}`)
      .then((response) => {
        if (active) setShared(response);
      })
      .catch((caught) => {
        if (!active) return;
        setError(
          caught instanceof ApiClientError && caught.status === 404
            ? 'Este link não existe, expirou ou foi revogado.'
            : errorMessage(caught),
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [shareToken]);

  return (
    <main className="min-h-screen bg-paper text-ink">
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-16">
        {loading ? (
          <div
            className="flex min-h-96 items-center justify-center text-center"
            role="status"
          >
            <div>
              <span className="loading-mark" />
              <p className="mt-4 font-mono text-xs font-bold tracking-wider uppercase">
                Validando link
              </p>
            </div>
          </div>
        ) : null}

        {shared ? (
          <article className="grid overflow-hidden border border-ink bg-surface md:grid-cols-[1fr_21rem]">
            <section className="p-6 sm:p-9">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <span className="ticket-number">
                  Ingresso compartilhado · #
                  {String(shared.ticket.sequence).padStart(2, '0')}
                </span>
                <TicketStatus status={shared.ticket.status} />
              </div>
              <p className="eyebrow mt-10">Entrada transferível por link</p>
              <h1 className="mt-2 text-5xl leading-[0.92] font-black tracking-[-0.055em] uppercase sm:text-7xl">
                {shared.event.title}
              </h1>
              <dl className="mt-10 border-y border-dashed border-line py-6">
                <div>
                  <dt className="font-mono text-[0.65rem] font-bold tracking-wider text-muted uppercase">
                    Data e horário
                  </dt>
                  <dd className="mt-2 font-bold">
                    {formatTicketEventDate(shared.event)}
                  </dd>
                </div>
                <div className="mt-5">
                  <dt className="font-mono text-[0.65rem] font-bold tracking-wider text-muted uppercase">
                    Local
                  </dt>
                  <dd className="mt-2 font-bold">{shared.event.venueName}</dd>
                  <dd className="mt-1 text-sm text-muted">
                    {shared.event.address} · {shared.event.city}
                  </dd>
                </div>
              </dl>
              <p className="mt-6 max-w-xl text-xs leading-5 text-muted">
                Esta página mostra apenas dados operacionais do ingresso. Nenhum
                nome, e-mail ou informação de pagamento é compartilhado.
              </p>
            </section>
            <aside className="ticket-cut flex flex-col items-center border-t border-dashed border-ink bg-paper p-6 text-center md:border-t-0 md:border-l">
              <p className="font-mono text-xs font-black tracking-[0.18em] uppercase">
                Apresente na entrada
              </p>
              <div className="mt-5 flex w-full justify-center">
                {shared.qr ? (
                  <TicketQr code={shared.qr.code} />
                ) : (
                  <div className="flex aspect-square w-full max-w-80 items-center justify-center border border-warning bg-warning-soft p-6 text-sm leading-6 text-warning">
                    Este ingresso não possui mais um QR ativo.
                  </div>
                )}
              </div>
              {shared.qr ? (
                <p className="mt-4 text-xs leading-5 text-muted">
                  QR válido até{' '}
                  {new Date(shared.qr.expiresAt).toLocaleString('pt-BR')}.
                </p>
              ) : null}
            </aside>
          </article>
        ) : null}

        {!loading && !shared ? (
          <div
            className="mx-auto max-w-2xl border border-error bg-error-soft p-8 text-center text-error"
            role="alert"
          >
            <span className="ticket-number mx-auto border-error">
              Link indisponível
            </span>
            <h1 className="mt-5 text-3xl font-black uppercase">
              Não foi possível abrir este ingresso.
            </h1>
            <p className="mt-3 leading-6">{error}</p>
            <Link className="button-secondary mt-6" href="/">
              Ver programação
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}
