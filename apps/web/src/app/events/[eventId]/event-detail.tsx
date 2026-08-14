'use client';

import type { PublicEvent } from '@event-platform/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { MoviePoster } from '@/components/movie-poster';
import { SiteHeader } from '@/components/site-header';
import { ApiClientError, apiRequest, errorMessage } from '@/lib/api';
import { eventDateParts, formatEventDate } from '@/lib/event-format';
import { EventCheckout } from './event-checkout';

interface EventDetailProps {
  eventId: string;
}

export function EventDetail({ eventId }: EventDetailProps) {
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const changeInventory = useCallback((delta: number) => {
    setEvent((current) =>
      current
        ? {
            ...current,
            availableQuantity: Math.max(0, current.availableQuantity + delta),
          }
        : current,
    );
  }, []);

  useEffect(() => {
    let active = true;
    apiRequest<PublicEvent>(`/events/${eventId}`)
      .then((response) => {
        if (active) setEvent(response);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof ApiClientError && caught.status === 404
            ? 'Esta sessão não está disponível na programação.'
            : errorMessage(caught),
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-paper text-ink">
        <SiteHeader />
        <div className="mx-auto flex min-h-[65vh] max-w-7xl items-center justify-center px-5">
          <div className="text-center" role="status">
            <span className="loading-mark" />
            <p className="mt-4 font-mono text-xs font-bold tracking-wider uppercase">
              Abrindo sessão
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="min-h-screen bg-paper text-ink">
        <SiteHeader />
        <div className="mx-auto max-w-3xl px-5 py-20 text-center">
          <span className="ticket-number mx-auto">404 / FORA DE CARTAZ</span>
          <h1 className="mt-6 text-5xl leading-none font-black tracking-[-0.05em] uppercase">
            Sessão não encontrada.
          </h1>
          <p
            className="mx-auto mt-5 max-w-xl leading-7 text-muted"
            role="alert"
          >
            {error}
          </p>
          <Link className="button-primary mt-8" href="/">
            Voltar à programação
          </Link>
        </div>
      </main>
    );
  }

  const date = eventDateParts(event);

  return (
    <main className="min-h-screen bg-paper text-ink">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-10">
        <Link className="button-quiet mb-6" href="/">
          ← Toda a programação
        </Link>

        <article className="border border-ink bg-surface">
          <div className="grid lg:grid-cols-[minmax(18rem,0.72fr)_1.28fr]">
            <div className="border-b border-ink lg:border-r lg:border-b-0">
              <MoviePoster
                posterUrl={event.posterUrl}
                sizes="(max-width: 1023px) 100vw, 42vw"
                title={event.title}
              />
            </div>

            <div className="flex min-w-0 flex-col">
              <div className="grid border-b border-ink sm:grid-cols-[10rem_1fr]">
                <div className="flex items-end gap-2 border-b border-ink p-5 sm:border-r sm:border-b-0 sm:p-6">
                  <strong className="text-6xl leading-none font-black tracking-[-0.09em]">
                    {date.day}
                  </strong>
                  <span className="pb-1 font-mono text-xs font-bold tracking-wider">
                    {date.month}
                    <br />
                    {date.time}
                  </span>
                </div>
                <div className="p-5 sm:p-6">
                  <p className="eyebrow">Sessão especial · {event.city}</p>
                  <h1 className="mt-3 text-4xl leading-[0.92] font-black tracking-[-0.055em] uppercase sm:text-6xl">
                    {event.title}
                  </h1>
                  {event.sourceTitle !== event.title ? (
                    <p className="mt-3 font-mono text-xs tracking-wider text-muted uppercase">
                      Título original: {event.sourceTitle}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="grid flex-1 sm:grid-cols-[1fr_14rem]">
                <div className="border-b border-ink p-5 sm:border-r sm:border-b-0 sm:p-8">
                  <p className="text-base leading-8 text-muted sm:text-lg">
                    {event.description ||
                      'Uma sessão preparada para reunir público e cinema.'}
                  </p>

                  <dl className="mt-8 divide-y divide-line border-y border-line text-sm">
                    <DetailRow label="Quando" value={formatEventDate(event)} />
                    <DetailRow
                      label="Onde"
                      value={`${event.venueName} · ${event.address}, ${event.city}`}
                    />
                    {event.runtimeMinutes ? (
                      <DetailRow
                        label="Duração"
                        value={`${event.runtimeMinutes} minutos`}
                      />
                    ) : null}
                  </dl>
                </div>

                <EventCheckout
                  event={event}
                  onInventoryDelta={changeInventory}
                />
              </div>
            </div>
          </div>
        </article>
      </div>
    </main>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[6rem_1fr] sm:gap-4">
      <dt className="font-mono text-[0.67rem] font-bold tracking-wider text-muted uppercase">
        {label}
      </dt>
      <dd className="font-bold">{value}</dd>
    </div>
  );
}
