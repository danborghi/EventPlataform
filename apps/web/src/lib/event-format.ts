import type {
  PublicEvent,
  TicketEventSummary,
} from '@event-platform/contracts';

export function formatEventDate(event: PublicEvent): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: event.timezone,
  }).format(new Date(event.startsAt));
}

export function eventDateParts(event: PublicEvent): {
  day: string;
  month: string;
  weekday: string;
  time: string;
} {
  const date = new Date(event.startsAt);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: event.timezone,
    })
      .formatToParts(date)
      .find((item) => item.type === type)?.value ?? '';

  return {
    day: part('day'),
    month: part('month').replace('.', '').toUpperCase(),
    weekday: part('weekday').replace('.', '').toUpperCase(),
    time: `${part('hour')}:${part('minute')}`,
  };
}

export function formatPrice(priceCents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(priceCents / 100);
}

export function formatTicketEventDate(event: TicketEventSummary): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: event.timezone,
  }).format(new Date(event.startsAt));
}
