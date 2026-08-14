import type { PublicEvent } from '@event-platform/contracts';
import Link from 'next/link';
import { eventDateParts, formatPrice } from '@/lib/event-format';
import { MoviePoster } from './movie-poster';

interface PublicEventCardProps {
  event: PublicEvent;
  sequence: number;
}

export function PublicEventCard({ event, sequence }: PublicEventCardProps) {
  const date = eventDateParts(event);
  const soldOut = event.availableQuantity === 0;

  return (
    <article className="group grid border-t border-ink bg-surface sm:grid-cols-[9rem_1fr] lg:grid-cols-1">
      <Link
        aria-label={`Abrir ${event.title}`}
        className="block border-b border-ink sm:border-r sm:border-b-0 lg:border-r-0 lg:border-b"
        href={`/events/${event.id}`}
      >
        <MoviePoster
          posterUrl={event.posterUrl}
          sizes="(max-width: 639px) 144px, (max-width: 1023px) 144px, 25vw"
          title={event.title}
        />
      </Link>

      <div className="flex min-w-0 flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div
            className="flex items-end gap-2"
            aria-label={`${date.day} de ${date.month}`}
          >
            <strong className="text-5xl leading-none font-black tracking-[-0.08em]">
              {date.day}
            </strong>
            <span className="pb-1 font-mono text-[0.68rem] leading-tight font-bold tracking-wider">
              {date.month}
              <br />
              {date.weekday} · {date.time}
            </span>
          </div>
          <span className="ticket-number">
            {String(sequence).padStart(2, '0')}
          </span>
        </div>

        <div className="flex flex-1 flex-col pt-4">
          <p className="eyebrow">{event.city}</p>
          <h2 className="mt-2 text-2xl leading-[0.95] font-black tracking-[-0.04em] uppercase">
            <Link
              className="group-hover:text-accent"
              href={`/events/${event.id}`}
            >
              {event.title}
            </Link>
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">{event.venueName}</p>

          <div className="mt-6 flex items-end justify-between gap-3 border-t border-dashed border-line pt-4">
            <div>
              <span className="block font-mono text-[0.62rem] tracking-wider text-muted uppercase">
                A partir de
              </span>
              <strong className="text-lg">
                {formatPrice(event.priceCents)}
              </strong>
            </div>
            <span
              className={
                soldOut ? 'availability-sold-out' : 'availability-open'
              }
            >
              {soldOut ? 'Esgotado' : `${event.availableQuantity} disponíveis`}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
