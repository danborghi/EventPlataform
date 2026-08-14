import { PrismaService } from '../database/prisma.service.js';
import type {
  Event,
  Ticket,
  TicketValidation,
} from '../generated/prisma/client.js';
import type {
  TicketTokenPayload,
  TicketTokenService,
} from '../tickets/ticket-token.service.js';
import { GateService } from './gate.service.js';

const gateUserId = '10000000-0000-4000-8000-000000000004';
const eventId = '20000000-0000-4000-8000-000000000001';
const otherEventId = '20000000-0000-4000-8000-000000000002';
const ticketId = '50000000-0000-4000-8000-000000000001';
const nonce = 'ticket-nonce';
const nonceHash = 'a'.repeat(64);

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
    startsAt: future(1),
    endsAt: future(4),
    timezone: 'America/Sao_Paulo',
    venueName: 'Cine Teatro',
    address: 'Rua das Artes, 100',
    city: 'Londrina',
    priceCents: 3500,
    capacity: 120,
    availableQuantity: 119,
    status: 'PUBLISHED',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function validTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: ticketId,
    reservationId: '30000000-0000-4000-8000-000000000001',
    customerId: '10000000-0000-4000-8000-000000000002',
    eventId,
    sequence: 1,
    status: 'VALID',
    qrNonceHash: nonceHash,
    usedAt: null,
    validatedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('GateService', () => {
  let event: Event;
  let ticket: Ticket;
  let validations: TicketValidation[];

  const payload = (payloadEventId = eventId): TicketTokenPayload => ({
    v: 1,
    ticketId,
    eventId: payloadEventId,
    nonce,
    iat: Math.floor(Date.now() / 1_000),
    exp: Math.floor(Date.now() / 1_000) + 3600,
  });

  const tokens = {
    verify: (code: string) => {
      if (code === 'valid-code') return payload();
      if (code === 'wrong-event-code') return payload(otherEventId);
      return null;
    },
    hashNonce: () => nonceHash,
  } as unknown as TicketTokenService;

  const transactionClient = {
    ticket: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === ticket.id ? { ...ticket } : null),
      updateMany: ({
        where,
        data,
      }: {
        where: {
          id: string;
          eventId: string;
          status: Ticket['status'];
          qrNonceHash: string;
        };
        data: {
          status: Ticket['status'];
          usedAt: Date;
          validatedById: string;
        };
      }) => {
        if (
          ticket.id !== where.id ||
          ticket.eventId !== where.eventId ||
          ticket.status !== where.status ||
          ticket.qrNonceHash !== where.qrNonceHash
        ) {
          return Promise.resolve({ count: 0 });
        }
        ticket.status = data.status;
        ticket.usedAt = data.usedAt;
        ticket.validatedById = data.validatedById;
        return Promise.resolve({ count: 1 });
      },
    },
    ticketValidation: {
      create: ({
        data,
      }: {
        data: Omit<TicketValidation, 'id' | 'createdAt'>;
      }) => {
        const validation: TicketValidation = {
          id: `60000000-0000-4000-8000-${String(validations.length + 1).padStart(12, '0')}`,
          ticketId: data.ticketId ?? null,
          eventId: data.eventId,
          gateUserId: data.gateUserId,
          tokenFingerprint: data.tokenFingerprint,
          result: data.result,
          createdAt: new Date(),
        };
        validations.push(validation);
        return Promise.resolve(validation);
      },
    },
  };

  const database = {
    ...transactionClient,
    event: {
      findMany: () => Promise.resolve([event]),
      findFirst: ({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === event.id ? event : null),
    },
    $transaction: <T>(callback: (transaction: PrismaService) => Promise<T>) =>
      callback(transactionClient as unknown as PrismaService),
  };

  const service = new GateService(database as unknown as PrismaService, tokens);

  beforeEach(() => {
    event = publishedEvent();
    ticket = validTicket();
    validations = [];
  });

  it('lists only the operational event data needed by the gate', async () => {
    await expect(service.listEvents()).resolves.toEqual({
      data: [
        expect.objectContaining({
          id: eventId,
          title: event.title,
          venueName: event.venueName,
          city: event.city,
        }),
      ],
    });
  });

  it('consumes a valid ticket and records the gate user atomically', async () => {
    const result = await service.validate(gateUserId, eventId, 'valid-code');

    expect(result).toMatchObject({
      result: 'VALID',
      ticket: { id: ticketId, sequence: 1 },
      event: { id: eventId },
    });
    expect(ticket).toMatchObject({
      status: 'USED',
      validatedById: gateUserId,
    });
    expect(ticket.usedAt).toBeInstanceOf(Date);
    expect(validations).toHaveLength(1);
    expect(validations[0]).toMatchObject({
      ticketId,
      eventId,
      gateUserId,
      result: 'VALID',
    });
    expect(validations[0]?.tokenFingerprint).toHaveLength(16);
    expect(validations[0]?.tokenFingerprint).not.toContain('valid-code');
  });

  it('returns ALREADY_USED on replay without changing the first validator', async () => {
    const first = await service.validate(gateUserId, eventId, 'valid-code');
    const usedAt = ticket.usedAt;
    const replay = await service.validate(gateUserId, eventId, 'valid-code');

    expect(first.result).toBe('VALID');
    expect(replay).toMatchObject({
      result: 'ALREADY_USED',
      usedAt: usedAt?.toISOString(),
    });
    expect(ticket.usedAt).toBe(usedAt);
    expect(validations.map(({ result }) => result)).toEqual([
      'VALID',
      'ALREADY_USED',
    ]);
  });

  it('rejects a signed ticket for another selected event', async () => {
    const result = await service.validate(
      gateUserId,
      eventId,
      'wrong-event-code',
    );

    expect(result).toEqual({ result: 'WRONG_EVENT' });
    expect(ticket.status).toBe('VALID');
    expect(validations[0]).toMatchObject({
      ticketId: null,
      result: 'WRONG_EVENT',
    });
  });

  it('records an invalid token by fingerprint without persisting its code', async () => {
    const result = await service.validate(
      gateUserId,
      eventId,
      'tampered-or-expired-code',
    );

    expect(result).toEqual({ result: 'INVALID' });
    expect(ticket.status).toBe('VALID');
    expect(validations[0]).toMatchObject({
      ticketId: null,
      result: 'INVALID',
    });
    expect(validations[0]?.tokenFingerprint).toHaveLength(16);
    expect(JSON.stringify(validations)).not.toContain(
      'tampered-or-expired-code',
    );
  });

  it('approves exactly one of two concurrent validations', async () => {
    const results = await Promise.all([
      service.validate(gateUserId, eventId, 'valid-code'),
      service.validate(gateUserId, eventId, 'valid-code'),
    ]);

    expect(results.map(({ result }) => result).sort()).toEqual([
      'ALREADY_USED',
      'VALID',
    ]);
    expect(validations.filter(({ result }) => result === 'VALID')).toHaveLength(
      1,
    );
    expect(
      validations.filter(({ result }) => result === 'ALREADY_USED'),
    ).toHaveLength(1);
  });
});
