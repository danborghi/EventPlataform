import { PrismaService } from '../database/prisma.service.js';
import type { Event, Reservation } from '../generated/prisma/client.js';
import { ReservationsService } from './reservations.service.js';

const customerId = '10000000-0000-4000-8000-000000000002';
const eventId = '20000000-0000-4000-8000-000000000001';

function future(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1_000);
}

function publishedEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: eventId,
    organizerId: '10000000-0000-4000-8000-000000000001',
    externalProvider: 'TMDB',
    externalId: '157336',
    sourceTitle: 'Interstellar',
    title: 'Interstellar - Sessão Especial',
    description: 'Sessão de teste.',
    posterUrl: null,
    runtimeMinutes: 169,
    startsAt: future(24),
    endsAt: future(27),
    timezone: 'America/Sao_Paulo',
    venueName: 'Cine Teatro',
    address: 'Rua das Artes, 100',
    city: 'Londrina',
    priceCents: 3500,
    capacity: 6,
    availableQuantity: 6,
    status: 'PUBLISHED',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ReservationsService', () => {
  let storedEvent: Event;
  let reservations: Reservation[];
  let nextReservation: number;

  const transactionClient = {
    event: {
      updateMany: ({
        where,
        data,
      }: {
        where: {
          id: string;
          status: string;
          startsAt: { gt: Date };
          availableQuantity: { gte: number };
        };
        data: { availableQuantity: { decrement: number } };
      }) => {
        if (
          storedEvent.id !== where.id ||
          storedEvent.status !== where.status ||
          storedEvent.startsAt <= where.startsAt.gt ||
          storedEvent.availableQuantity < where.availableQuantity.gte
        ) {
          return Promise.resolve({ count: 0 });
        }
        storedEvent.availableQuantity -= data.availableQuantity.decrement;
        return Promise.resolve({ count: 1 });
      },
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(storedEvent.id === where.id ? storedEvent : null),
      findUniqueOrThrow: ({ where }: { where: { id: string } }) => {
        if (storedEvent.id !== where.id) throw new Error('Event not found');
        return Promise.resolve(storedEvent);
      },
      update: ({
        data,
      }: {
        where: { id: string };
        data: { availableQuantity: { increment: number } };
      }) => {
        storedEvent.availableQuantity += data.availableQuantity.increment;
        return Promise.resolve(storedEvent);
      },
    },
    reservation: {
      create: ({
        data,
      }: {
        data: Omit<Reservation, 'id' | 'createdAt' | 'updatedAt'>;
      }) => {
        const now = new Date();
        const reservation: Reservation = {
          ...data,
          id: `30000000-0000-4000-8000-${String(nextReservation).padStart(12, '0')}`,
          inventoryReleasedAt: data.inventoryReleasedAt ?? null,
          createdAt: now,
          updatedAt: now,
        };
        nextReservation += 1;
        reservations.push(reservation);
        return Promise.resolve({
          ...reservation,
          event: storedEvent,
          tickets: [],
        });
      },
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          reservations.find((reservation) => reservation.id === where.id) ??
            null,
        ),
      findFirst: ({ where }: { where: { id: string; customerId: string } }) => {
        const reservation = reservations.find(
          (item) =>
            item.id === where.id && item.customerId === where.customerId,
        );
        return Promise.resolve(
          reservation
            ? { ...reservation, event: storedEvent, tickets: [] }
            : null,
        );
      },
      findMany: () =>
        Promise.resolve(
          reservations
            .filter(
              (reservation) =>
                reservation.status === 'PENDING_PAYMENT' &&
                reservation.expiresAt <= new Date() &&
                reservation.inventoryReleasedAt === null,
            )
            .map(({ id }) => ({ id })),
        ),
      updateMany: ({
        where,
        data,
      }: {
        where: {
          id: string;
          customerId?: string;
          status: string;
          expiresAt: { gt?: Date; lte?: Date };
          inventoryReleasedAt: null;
        };
        data: {
          status: Reservation['status'];
          inventoryReleasedAt: Date;
        };
      }) => {
        const reservation = reservations.find(
          (item) =>
            item.id === where.id &&
            (!where.customerId || item.customerId === where.customerId),
        );
        if (!reservation) return Promise.resolve({ count: 0 });
        const matchesDate =
          (!where.expiresAt.gt || reservation.expiresAt > where.expiresAt.gt) &&
          (!where.expiresAt.lte ||
            reservation.expiresAt <= where.expiresAt.lte);
        if (
          reservation.status !== where.status ||
          reservation.inventoryReleasedAt !== null ||
          !matchesDate
        ) {
          return Promise.resolve({ count: 0 });
        }
        reservation.status = data.status;
        reservation.inventoryReleasedAt = data.inventoryReleasedAt;
        return Promise.resolve({ count: 1 });
      },
    },
  };

  const database = {
    ...transactionClient,
    $transaction: <T>(callback: (transaction: PrismaService) => Promise<T>) =>
      callback(transactionClient as unknown as PrismaService),
  };

  const service = new ReservationsService(database as unknown as PrismaService);

  beforeEach(() => {
    storedEvent = publishedEvent();
    reservations = [];
    nextReservation = 1;
  });

  it('reserves inventory atomically using the server price', async () => {
    const result = await service.create(customerId, { eventId, quantity: 2 });

    expect(result).toMatchObject({
      quantity: 2,
      unitPriceCents: 3500,
      totalPriceCents: 7000,
      status: 'PENDING_PAYMENT',
    });
    expect(storedEvent.availableQuantity).toBe(4);
  });

  it('prevents concurrent reservations from overselling', async () => {
    const attempts = await Promise.allSettled([
      service.create(customerId, { eventId, quantity: 4 }),
      service.create(customerId, { eventId, quantity: 4 }),
    ]);

    expect(
      attempts.filter((attempt) => attempt.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      attempts.filter((attempt) => attempt.status === 'rejected'),
    ).toHaveLength(1);
    expect(storedEvent.availableQuantity).toBe(2);
    expect(
      attempts.find((attempt) => attempt.status === 'rejected')?.reason,
    ).toMatchObject({ code: 'INSUFFICIENT_INVENTORY' });
  });

  it('expires a reservation and releases its inventory only once', async () => {
    const created = await service.create(customerId, { eventId, quantity: 2 });
    const stored = reservations.find((item) => item.id === created.id);
    if (!stored) throw new Error('Reservation not created');
    stored.expiresAt = new Date(Date.now() - 1_000);

    const firstRead = await service.get(customerId, created.id);
    const secondRead = await service.get(customerId, created.id);

    expect(firstRead.status).toBe('EXPIRED');
    expect(secondRead.status).toBe('EXPIRED');
    expect(storedEvent.availableQuantity).toBe(6);
  });

  it('cancels idempotently and releases inventory only once', async () => {
    const created = await service.create(customerId, { eventId, quantity: 2 });

    const canceled = await service.cancel(customerId, created.id);
    const retried = await service.cancel(customerId, created.id);

    expect(canceled.status).toBe('CANCELED');
    expect(retried.status).toBe('CANCELED');
    expect(storedEvent.availableQuantity).toBe(6);
  });

  it('rejects quantities outside the public contract', async () => {
    await expect(
      service.create(customerId, { eventId, quantity: 7 }),
    ).rejects.toMatchObject({ code: 'INVALID_QUANTITY', status: 422 });
    expect(storedEvent.availableQuantity).toBe(6);
  });
});
