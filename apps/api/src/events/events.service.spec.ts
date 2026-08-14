import { OwnershipService } from '../auth/ownership.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Event } from '../generated/prisma/client.js';
import { EventsService } from './events.service.js';

const organizerId = '10000000-0000-4000-8000-000000000001';
const eventId = '20000000-0000-4000-8000-000000000010';

function futureDate(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1_000);
}

function event(overrides: Partial<Event> = {}): Event {
  return {
    id: eventId,
    organizerId,
    externalProvider: 'TMDB',
    externalId: '157336',
    sourceTitle: 'Interstellar',
    title: 'Interestelar - Sessão Especial',
    description: 'Snapshot vindo do catálogo.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
    runtimeMinutes: 169,
    startsAt: futureDate(24),
    endsAt: futureDate(27),
    timezone: 'America/Sao_Paulo',
    venueName: 'Cine Teatro',
    address: 'Rua das Artes, 100',
    city: 'Londrina',
    priceCents: 3500,
    capacity: 120,
    availableQuantity: 120,
    status: 'DRAFT',
    createdAt: new Date('2026-08-13T12:00:00.000Z'),
    updatedAt: new Date('2026-08-13T12:00:00.000Z'),
    ...overrides,
  };
}

function createInput() {
  return {
    externalProvider: 'TMDB' as const,
    externalId: '157336',
    title: 'Interestelar - Sessão Especial',
    startsAt: futureDate(24).toISOString(),
    endsAt: futureDate(27).toISOString(),
    timezone: 'America/Sao_Paulo',
    venueName: 'Cine Teatro',
    address: 'Rua das Artes, 100',
    city: 'Londrina',
    capacity: 120,
    priceCents: 3500,
  };
}

describe('EventsService', () => {
  let storedEvent: Event | null;
  let createdData: Partial<Event> | null;
  let updatedData: Partial<Event> | null;
  let updateCalls: number;
  let movieDetailsCalls: number;
  let aggregateResults: Array<{ _sum: { quantity: number | null } }>;
  let listedEvents: Event[];
  let publicEvent: Event | null;
  let lastPublicWhere: unknown;

  const prisma = {
    event: {
      create: ({ data }: { data: Partial<Event> }) => {
        createdData = data;
        return Promise.resolve(event(data));
      },
      findUnique: () => Promise.resolve(storedEvent),
      findFirst: ({ where }: { where: unknown }) => {
        lastPublicWhere = where;
        return Promise.resolve(publicEvent);
      },
      updateMany: ({ data }: { data: Partial<Event> }) => {
        updateCalls += 1;
        updatedData = data;
        storedEvent = event({ ...storedEvent, ...data });
        return Promise.resolve({ count: 1 });
      },
      count: ({ where }: { where: unknown }) => {
        lastPublicWhere = where;
        return Promise.resolve(listedEvents.length);
      },
      findMany: ({ where }: { where: unknown }) => {
        lastPublicWhere = where;
        return Promise.resolve(listedEvents);
      },
    },
    reservation: {
      aggregate: () =>
        Promise.resolve(
          aggregateResults.shift() ?? { _sum: { quantity: null } },
        ),
    },
  } as unknown as PrismaService;

  const catalog = {
    movieDetails: () => {
      movieDetailsCalls += 1;
      return Promise.resolve({
        externalProvider: 'TMDB' as const,
        externalId: '157336',
        title: 'Interestelar',
        originalTitle: 'Interstellar',
        overview: 'Snapshot vindo do catálogo.',
        posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
        releaseDate: '2014-11-05',
        runtimeMinutes: 169,
        genres: ['Drama'],
      });
    },
  } as unknown as CatalogService;

  const service = new EventsService(prisma, catalog, new OwnershipService());

  beforeEach(() => {
    storedEvent = null;
    createdData = null;
    updatedData = null;
    updateCalls = 0;
    movieDetailsCalls = 0;
    aggregateResults = [];
    listedEvents = [];
    publicEvent = null;
    lastPublicWhere = null;
  });

  it('lists only future published events and searches trusted fields', async () => {
    listedEvents = [
      event({
        id: '20000000-0000-4000-8000-000000000011',
        status: 'PUBLISHED',
      }),
    ];

    const result = await service.listPublicEvents('Londrina', 2, 12);

    expect(result).toMatchObject({
      data: [{ status: 'PUBLISHED', city: 'Londrina' }],
      meta: { page: 2, pageSize: 12, total: 1, totalPages: 1 },
    });
    expect(lastPublicWhere).toMatchObject({
      status: 'PUBLISHED',
      startsAt: { gt: expect.any(Date) as Date },
      OR: [
        { title: { contains: 'Londrina', mode: 'insensitive' } },
        { venueName: { contains: 'Londrina', mode: 'insensitive' } },
        { city: { contains: 'Londrina', mode: 'insensitive' } },
      ],
    });
  });

  it('reads a future published event without consulting TMDB', async () => {
    publicEvent = event({ status: 'PUBLISHED' });

    const result = await service.getPublicEvent(eventId);

    expect(result).toMatchObject({
      id: eventId,
      sourceTitle: 'Interstellar',
      availableQuantity: 120,
      status: 'PUBLISHED',
    });
    expect(lastPublicWhere).toMatchObject({
      id: eventId,
      status: 'PUBLISHED',
      startsAt: { gt: expect.any(Date) as Date },
    });
    expect(movieDetailsCalls).toBe(0);
  });

  it('hides events that are not publicly available', async () => {
    await expect(service.getPublicEvent(eventId)).rejects.toMatchObject({
      code: 'EVENT_NOT_FOUND',
      status: 404,
    });
  });

  it('creates a draft from the trusted catalog snapshot', async () => {
    const result = await service.createDraft(organizerId, createInput());

    expect(movieDetailsCalls).toBe(1);
    expect(createdData).toMatchObject({
      organizerId,
      sourceTitle: 'Interstellar',
      description: 'Snapshot vindo do catálogo.',
      availableQuantity: 120,
      status: 'DRAFT',
    });
    expect(result.status).toBe('DRAFT');
    expect(result.availableQuantity).toBe(120);
  });

  it('rejects an invalid schedule before calling the catalog', async () => {
    const input = createInput();
    input.endsAt = input.startsAt;

    await expect(service.createDraft(organizerId, input)).rejects.toMatchObject(
      {
        code: 'INVALID_EVENT_SCHEDULE',
        status: 422,
      },
    );
    expect(movieDetailsCalls).toBe(0);
  });

  it('rejects invalid IANA timezones', async () => {
    await expect(
      service.createDraft(organizerId, {
        ...createInput(),
        timezone: 'Brazil/Unknown',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_EVENT_SCHEDULE', status: 422 });
  });

  it('updates only a draft and resets its unsold capacity', async () => {
    storedEvent = event();

    const result = await service.updateDraft(organizerId, eventId, {
      capacity: 150,
      priceCents: 4000,
    });

    expect(updatedData).toMatchObject({
      capacity: 150,
      availableQuantity: 150,
      priceCents: 4000,
    });
    expect(result.capacity).toBe(150);
  });

  it('rejects editing a published event', async () => {
    storedEvent = event({ status: 'PUBLISHED' });

    await expect(
      service.updateDraft(organizerId, eventId, { capacity: 150 }),
    ).rejects.toMatchObject({ code: 'EVENT_NOT_EDITABLE', status: 409 });
    expect(updateCalls).toBe(0);
  });

  it('enforces event ownership', async () => {
    storedEvent = event({ organizerId: 'another-user' });

    await expect(
      service.getOrganizerEvent(organizerId, eventId),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    expect(aggregateResults).toHaveLength(0);
  });

  it('publishes a valid draft and treats a retry as idempotent', async () => {
    storedEvent = event();

    const published = await service.publish(organizerId, eventId);
    const retried = await service.publish(organizerId, eventId);

    expect(published.status).toBe('PUBLISHED');
    expect(retried.status).toBe('PUBLISHED');
    expect(updatedData).toEqual({ status: 'PUBLISHED' });
    expect(updateCalls).toBe(1);
  });

  it('does not depend on TMDB when reading a persisted event', async () => {
    storedEvent = event({ status: 'PUBLISHED' });
    aggregateResults = [{ _sum: { quantity: 2 } }, { _sum: { quantity: 4 } }];

    const result = await service.getOrganizerEvent(organizerId, eventId);

    expect(result).toMatchObject({
      sourceTitle: 'Interstellar',
      reservedQuantity: 2,
      soldQuantity: 4,
    });
    expect(movieDetailsCalls).toBe(0);
  });
});
