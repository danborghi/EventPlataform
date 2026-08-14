import { PrismaService } from '../database/prisma.service.js';
import type {
  Event,
  Payment,
  Reservation,
  Ticket,
} from '../generated/prisma/client.js';
import { PaymentsService } from './payments.service.js';

const customerId = '10000000-0000-4000-8000-000000000002';
const reservationId = '30000000-0000-4000-8000-000000000001';
const eventId = '20000000-0000-4000-8000-000000000001';

describe('PaymentsService', () => {
  let event: Pick<Event, 'id' | 'availableQuantity'>;
  let reservation: Reservation;
  let payments: Payment[];
  let tickets: Ticket[];

  const transactionClient = {
    reservation: {
      findFirst: ({ where }: { where: { id: string; customerId: string } }) =>
        Promise.resolve(
          reservation.id === where.id &&
            reservation.customerId === where.customerId
            ? {
                ...reservation,
                payment:
                  payments.find(
                    (payment) => payment.reservationId === reservation.id,
                  ) ?? null,
                tickets: [...tickets].sort(
                  (left, right) => left.sequence - right.sequence,
                ),
              }
            : null,
        ),
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(reservation.id === where.id ? reservation : null),
      findUniqueOrThrow: ({ where }: { where: { id: string } }) => {
        if (reservation.id !== where.id) throw new Error('Not found');
        return Promise.resolve(reservation);
      },
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
          inventoryReleasedAt?: Date;
        };
      }) => {
        const dateMatches =
          (!where.expiresAt.gt || reservation.expiresAt > where.expiresAt.gt) &&
          (!where.expiresAt.lte ||
            reservation.expiresAt <= where.expiresAt.lte);
        if (
          reservation.id !== where.id ||
          (where.customerId && reservation.customerId !== where.customerId) ||
          reservation.status !== where.status ||
          reservation.inventoryReleasedAt !== null ||
          !dateMatches
        ) {
          return Promise.resolve({ count: 0 });
        }
        reservation.status = data.status;
        if (data.inventoryReleasedAt) {
          reservation.inventoryReleasedAt = data.inventoryReleasedAt;
        }
        return Promise.resolve({ count: 1 });
      },
    },
    event: {
      update: ({
        data,
      }: {
        where: { id: string };
        data: { availableQuantity: { increment: number } };
      }) => {
        event.availableQuantity += data.availableQuantity.increment;
        return Promise.resolve(event);
      },
    },
    payment: {
      findUnique: ({
        where,
      }: {
        where: { id?: string; idempotencyKey?: string; reservationId?: string };
      }) => {
        const payment = payments.find(
          (item) =>
            item.id === where.id ||
            item.idempotencyKey === where.idempotencyKey ||
            item.reservationId === where.reservationId,
        );
        return Promise.resolve(
          payment
            ? {
                ...payment,
                reservation: {
                  ...reservation,
                  tickets: [...tickets].sort(
                    (left, right) => left.sequence - right.sequence,
                  ),
                },
              }
            : null,
        );
      },
      findUniqueOrThrow: ({ where }: { where: { id: string } }) => {
        const payment = payments.find((item) => item.id === where.id);
        if (!payment) throw new Error('Payment not found');
        return Promise.resolve({
          ...payment,
          reservation: { ...reservation, tickets: [...tickets] },
        });
      },
      create: ({ data }: { data: Omit<Payment, 'id' | 'createdAt'> }) => {
        if (
          payments.some(
            (payment) =>
              payment.idempotencyKey === data.idempotencyKey ||
              payment.reservationId === data.reservationId,
          )
        ) {
          return Promise.reject(
            Object.assign(new Error('Unique constraint'), { code: 'P2002' }),
          );
        }
        const payment: Payment = {
          ...data,
          id: `40000000-0000-4000-8000-${String(payments.length + 1).padStart(12, '0')}`,
          createdAt: new Date(),
        };
        payments.push(payment);
        return Promise.resolve(payment);
      },
    },
    ticket: {
      createMany: ({
        data,
      }: {
        data: Array<
          Pick<
            Ticket,
            | 'reservationId'
            | 'customerId'
            | 'eventId'
            | 'sequence'
            | 'status'
            | 'qrNonceHash'
          >
        >;
      }) => {
        for (const item of data) {
          if (
            tickets.some(
              (ticket) =>
                ticket.reservationId === item.reservationId &&
                ticket.sequence === item.sequence,
            )
          ) {
            continue;
          }
          tickets.push({
            ...item,
            id: `50000000-0000-4000-8000-${String(tickets.length + 1).padStart(12, '0')}`,
            usedAt: null,
            validatedById: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
        return Promise.resolve({ count: data.length });
      },
    },
  };

  const database = {
    ...transactionClient,
    $transaction: <T>(callback: (transaction: PrismaService) => Promise<T>) =>
      callback(transactionClient as unknown as PrismaService),
  };

  const service = new PaymentsService(database as unknown as PrismaService);

  beforeEach(() => {
    const now = new Date();
    event = { id: eventId, availableQuantity: 4 };
    reservation = {
      id: reservationId,
      customerId,
      eventId,
      quantity: 2,
      unitPriceCents: 3500,
      totalPriceCents: 7000,
      status: 'PENDING_PAYMENT',
      expiresAt: new Date(Date.now() + 10 * 60 * 1_000),
      inventoryReleasedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    payments = [];
    tickets = [];
  });

  it('approves once and returns the original response on retry', async () => {
    const first = await service.simulate(
      customerId,
      reservationId,
      'payment-key-0001',
      'APPROVED',
    );
    const retry = await service.simulate(
      customerId,
      reservationId,
      'payment-key-0001',
      'APPROVED',
    );

    expect(first.reservation.status).toBe('PAID');
    expect(first.tickets).toHaveLength(2);
    expect(retry).toEqual(first);
    expect(payments).toHaveLength(1);
    expect(tickets).toHaveLength(2);
    expect(event.availableQuantity).toBe(4);
  });

  it('handles concurrent approval retries without duplicate tickets', async () => {
    const [first, second] = await Promise.all([
      service.simulate(
        customerId,
        reservationId,
        'payment-key-concurrent',
        'APPROVED',
      ),
      service.simulate(
        customerId,
        reservationId,
        'payment-key-concurrent',
        'APPROVED',
      ),
    ]);

    expect(first).toEqual(second);
    expect(payments).toHaveLength(1);
    expect(tickets).toHaveLength(2);
  });

  it('rejects reuse of a key with a different payload', async () => {
    await service.simulate(
      customerId,
      reservationId,
      'payment-key-0002',
      'APPROVED',
    );

    await expect(
      service.simulate(
        customerId,
        reservationId,
        'payment-key-0002',
        'DECLINED',
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', status: 409 });
    expect(tickets).toHaveLength(2);
  });

  it('declines and releases stock only once across retries', async () => {
    const first = await service.simulate(
      customerId,
      reservationId,
      'payment-key-0003',
      'DECLINED',
    );
    const retry = await service.simulate(
      customerId,
      reservationId,
      'payment-key-0003',
      'DECLINED',
    );

    expect(first.reservation.status).toBe('DECLINED');
    expect(retry).toEqual(first);
    expect(event.availableQuantity).toBe(6);
    expect(tickets).toHaveLength(0);
  });

  it('reconciles expiration before rejecting payment', async () => {
    reservation.expiresAt = new Date(Date.now() - 1_000);

    await expect(
      service.simulate(
        customerId,
        reservationId,
        'payment-key-0004',
        'APPROVED',
      ),
    ).rejects.toMatchObject({ code: 'RESERVATION_EXPIRED', status: 409 });
    await expect(
      service.simulate(
        customerId,
        reservationId,
        'payment-key-0005',
        'APPROVED',
      ),
    ).rejects.toMatchObject({ code: 'RESERVATION_EXPIRED', status: 409 });

    expect(reservation.status).toBe('EXPIRED');
    expect(event.availableQuantity).toBe(6);
    expect(payments).toHaveLength(0);
  });

  it('requires an idempotency key without touching the reservation', async () => {
    await expect(
      service.simulate(customerId, reservationId, undefined, 'APPROVED'),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED', status: 400 });
    expect(reservation.status).toBe('PENDING_PAYMENT');
  });
});
