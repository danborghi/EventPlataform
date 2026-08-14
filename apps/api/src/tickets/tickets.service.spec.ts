import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service.js';
import type { Event, ShareLink, Ticket } from '../generated/prisma/client.js';
import { TicketTokenService } from './ticket-token.service.js';
import { TicketsService } from './tickets.service.js';

const customerId = '10000000-0000-4000-8000-000000000002';
const otherCustomerId = '10000000-0000-4000-8000-000000000003';
const eventId = '20000000-0000-4000-8000-000000000001';
const ticketId = '50000000-0000-4000-8000-000000000001';

function future(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1_000);
}

describe('TicketsService', () => {
  let event: Event;
  let tickets: Ticket[];
  let links: ShareLink[];

  const transactionClient = {
    ticket: {
      findMany: ({
        where,
      }: {
        where: { customerId: string; status?: Ticket['status'] };
      }) =>
        Promise.resolve(
          tickets
            .filter(
              (ticket) =>
                ticket.customerId === where.customerId &&
                (!where.status || ticket.status === where.status),
            )
            .map((ticket) => withRelations(ticket)),
        ),
      findFirst: ({ where }: { where: { id: string; customerId: string } }) => {
        const ticket = tickets.find(
          (item) =>
            item.id === where.id && item.customerId === where.customerId,
        );
        return Promise.resolve(ticket ? withRelations(ticket) : null);
      },
      updateMany: ({
        where,
        data,
      }: {
        where: { id: string; status: Ticket['status'] };
        data: { qrNonceHash: string };
      }) => {
        const ticket = tickets.find(
          (item) => item.id === where.id && item.status === where.status,
        );
        if (!ticket) return Promise.resolve({ count: 0 });
        ticket.qrNonceHash = data.qrNonceHash;
        return Promise.resolve({ count: 1 });
      },
    },
    shareLink: {
      updateMany: ({
        where,
        data,
      }: {
        where: { ticketId: string; revokedAt: null };
        data: { revokedAt: Date };
      }) => {
        let count = 0;
        for (const link of links) {
          if (link.ticketId === where.ticketId && link.revokedAt === null) {
            link.revokedAt = data.revokedAt;
            count += 1;
          }
        }
        return Promise.resolve({ count });
      },
      create: ({
        data,
      }: {
        data: Pick<ShareLink, 'ticketId' | 'tokenHash' | 'expiresAt'>;
      }) => {
        const now = new Date();
        const link: ShareLink = {
          ...data,
          id: `60000000-0000-4000-8000-${String(links.length + 1).padStart(12, '0')}`,
          revokedAt: null,
          createdAt: now,
        };
        links.push(link);
        return Promise.resolve(link);
      },
      findUnique: ({ where }: { where: { tokenHash: string } }) => {
        const link = links.find((item) => item.tokenHash === where.tokenHash);
        if (!link) return Promise.resolve(null);
        const ticket = tickets.find((item) => item.id === link.ticketId);
        return Promise.resolve(
          ticket ? { ...link, ticket: { ...ticket, event } } : null,
        );
      },
    },
  };

  const database = {
    ...transactionClient,
    $transaction: <T>(callback: (transaction: PrismaService) => Promise<T>) =>
      callback(transactionClient as unknown as PrismaService),
  };
  const config = {
    get: (key: string) => {
      if (key === 'QR_SIGNING_SECRET') {
        return 'ticket-test-secret-with-at-least-32-characters';
      }
      if (key === 'APP_PUBLIC_URL') return 'http://localhost:3000';
      return undefined;
    },
  } as unknown as ConfigService;
  const tokenService = new TicketTokenService(config);
  const service = new TicketsService(
    database as unknown as PrismaService,
    tokenService,
    config,
  );

  function withRelations(ticket: Ticket) {
    return {
      ...ticket,
      event,
      shareLinks: links.filter(
        (link) =>
          link.ticketId === ticket.id &&
          link.revokedAt === null &&
          link.expiresAt > new Date(),
      ),
    };
  }

  beforeEach(() => {
    const now = new Date();
    event = {
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
      capacity: 120,
      availableQuantity: 118,
      status: 'PUBLISHED',
      createdAt: now,
      updatedAt: now,
    };
    tickets = [
      {
        id: ticketId,
        reservationId: '30000000-0000-4000-8000-000000000001',
        customerId,
        eventId,
        sequence: 1,
        status: 'VALID',
        qrNonceHash: '0'.repeat(64),
        usedAt: null,
        validatedById: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: '50000000-0000-4000-8000-000000000002',
        reservationId: '30000000-0000-4000-8000-000000000002',
        customerId: otherCustomerId,
        eventId,
        sequence: 1,
        status: 'VALID',
        qrNonceHash: '0'.repeat(64),
        usedAt: null,
        validatedById: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
    links = [];
  });

  it('lists only tickets owned by the current customer', async () => {
    const result = await service.listMine(customerId, 1, undefined);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: ticketId,
      sequence: 1,
      status: 'VALID',
      hasActiveShareLink: false,
    });
  });

  it('issues a signed QR and aligns the stored nonce hash', async () => {
    const qr = await service.getQr(customerId, ticketId);
    const payload = tokenService.verify(qr.code);

    expect(payload).toMatchObject({ ticketId, eventId });
    expect(tickets[0]?.qrNonceHash).toBe(
      tokenService.hashNonce(payload?.nonce ?? ''),
    );
  });

  it('replaces, revokes and hides share links without exposing PII', async () => {
    const first = await service.createShareLink(customerId, ticketId);
    const firstToken = new URL(first.url).pathname.split('/').at(-1);
    if (!firstToken) throw new Error('Share token missing');
    expect(links[0]?.tokenHash).not.toContain(firstToken);

    const shared = await service.getShared(firstToken);
    expect(shared).toMatchObject({
      ticket: { sequence: 1, status: 'VALID' },
      event: { title: 'Interstellar - Sessão Especial' },
    });
    expect(JSON.stringify(shared)).not.toContain(customerId);

    const second = await service.createShareLink(customerId, ticketId);
    const secondToken = new URL(second.url).pathname.split('/').at(-1);
    if (!secondToken) throw new Error('Share token missing');
    await expect(service.getShared(firstToken)).rejects.toMatchObject({
      code: 'SHARED_TICKET_NOT_FOUND',
      status: 404,
    });

    await service.revokeShareLink(customerId, ticketId);
    await expect(service.getShared(secondToken)).rejects.toMatchObject({
      code: 'SHARED_TICKET_NOT_FOUND',
      status: 404,
    });
  });

  it('hides tickets owned by another customer', async () => {
    await expect(
      service.getMine(customerId, tickets[1]?.id ?? ''),
    ).rejects.toMatchObject({ code: 'TICKET_NOT_FOUND', status: 404 });
  });

  it('rejects QR emission for inactive tickets', async () => {
    if (!tickets[0]) throw new Error('Ticket fixture missing');
    tickets[0].status = 'USED';
    tickets[0].usedAt = new Date();

    await expect(service.getQr(customerId, ticketId)).rejects.toMatchObject({
      code: 'TICKET_NOT_ACTIVE',
      status: 409,
    });
  });

  it('returns the same public error for malformed and expired links', async () => {
    await expect(service.getShared('invalid')).rejects.toMatchObject({
      code: 'SHARED_TICKET_NOT_FOUND',
      status: 404,
    });
    const created = await service.createShareLink(customerId, ticketId);
    const token = new URL(created.url).pathname.split('/').at(-1);
    if (!token || !links[0]) throw new Error('Share fixture missing');
    links[0].expiresAt = new Date(Date.now() - 1_000);

    await expect(service.getShared(token)).rejects.toMatchObject({
      code: 'SHARED_TICKET_NOT_FOUND',
      status: 404,
    });
  });
});
