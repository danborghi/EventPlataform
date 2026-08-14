import type {
  ApiErrorResponse,
  CatalogMovieDetail,
  CatalogMovieListResponse,
  LoginResponse,
  OrganizerEvent,
  OrganizerEventDetail,
  PublicEvent,
  PublicEventListResponse,
  GateEventListResponse,
  UserRole,
} from '@event-platform/contracts';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import type { Server } from 'node:net';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/common/configure-app.js';
import { TMDB_FETCH, type TmdbFetch } from '../src/catalog/tmdb-fetch.token.js';
import { PrismaService } from '../src/database/prisma.service.js';
import type { Event } from '../src/generated/prisma/client.js';

interface TestUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}

type SearchableEventField = 'title' | 'venueName' | 'city';

interface TestEventWhere {
  organizerId?: string;
  status?: Event['status'];
  startsAt?: { gt: Date };
  endsAt?: { gt: Date };
  OR?: Array<
    Partial<
      Record<SearchableEventField, { contains: string; mode: 'insensitive' }>
    >
  >;
}

function matchesEventWhere(event: Event, where: TestEventWhere): boolean {
  if (where.organizerId && event.organizerId !== where.organizerId) {
    return false;
  }

  if (where.status && event.status !== where.status) {
    return false;
  }

  if (where.startsAt && event.startsAt <= where.startsAt.gt) {
    return false;
  }

  if (where.endsAt && event.endsAt <= where.endsAt.gt) {
    return false;
  }

  if (where.OR) {
    const fields: SearchableEventField[] = ['title', 'venueName', 'city'];
    return where.OR.some((condition) =>
      fields.some((field) => {
        const filter = condition[field];
        return filter
          ? event[field]
              .toLocaleLowerCase('pt-BR')
              .includes(filter.contains.toLocaleLowerCase('pt-BR'))
          : false;
      }),
    );
  }

  return true;
}

function requestUrl(input: Parameters<TmdbFetch>[0]): URL {
  if (typeof input === 'string') {
    return new URL(input);
  }

  return input instanceof URL ? input : new URL(input.url);
}

describe('API (e2e)', () => {
  let app: INestApplication<Server>;
  let users: TestUser[];
  let organizerToken: string;
  let customerToken: string;
  let gateToken: string;
  let events: Event[];
  let nextEventId: number;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-characters';
    process.env.QR_SIGNING_SECRET =
      'test-only-qr-secret-separate-from-jwt-with-32-characters';
    process.env.APP_PUBLIC_URL = 'http://localhost:3000';
    process.env.JWT_EXPIRES_IN_SECONDS = '3600';
    process.env.AUTH_LOGIN_RATE_LIMIT = '5';
    process.env.AUTH_LOGIN_RATE_WINDOW_MS = '60000';
    process.env.TMDB_API_READ_TOKEN = 'test-tmdb-read-token';
    const passwordHash = await hash('Test@123', 4);
    users = [
      {
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Organizador Demo',
        email: 'organizer@example.com',
        passwordHash,
        role: 'ORGANIZER',
      },
      {
        id: '10000000-0000-4000-8000-000000000002',
        name: 'Cliente Um',
        email: 'client1@example.com',
        passwordHash,
        role: 'CUSTOMER',
      },
      {
        id: '10000000-0000-4000-8000-000000000004',
        name: 'Portaria Demo',
        email: 'gate@example.com',
        passwordHash,
        role: 'GATE',
      },
      {
        id: '10000000-0000-4000-8000-000000000003',
        name: 'Cliente Dois',
        email: 'client2@example.com',
        passwordHash,
        role: 'CUSTOMER',
      },
    ];
    events = [
      {
        id: '20000000-0000-4000-8000-000000000001',
        organizerId: '10000000-0000-4000-8000-000000000001',
        externalProvider: 'TMDB',
        externalId: '157336',
        sourceTitle: 'Interstellar',
        title: 'Interestelar - Sessão Especial',
        description: 'Um encontro para atravessar o espaço e o tempo.',
        posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
        runtimeMinutes: 169,
        startsAt: new Date(Date.now() + 72 * 60 * 60 * 1_000),
        endsAt: new Date(Date.now() + 75 * 60 * 60 * 1_000),
        timezone: 'America/Sao_Paulo',
        venueName: 'Cine Teatro Ouro Verde',
        address: 'Rua Maranhão, 85',
        city: 'Londrina',
        priceCents: 3500,
        capacity: 120,
        availableQuantity: 87,
        status: 'PUBLISHED',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '20000000-0000-4000-8000-000000000098',
        organizerId: '10000000-0000-4000-8000-000000000001',
        externalProvider: 'TMDB',
        externalId: '157336',
        sourceTitle: 'Interstellar',
        title: 'Sessão encerrada',
        description: 'Não deve aparecer no marketplace.',
        posterUrl: null,
        runtimeMinutes: 169,
        startsAt: new Date(Date.now() - 48 * 60 * 60 * 1_000),
        endsAt: new Date(Date.now() - 45 * 60 * 60 * 1_000),
        timezone: 'America/Sao_Paulo',
        venueName: 'Cine Antigo',
        address: 'Rua do Passado, 1',
        city: 'Curitiba',
        priceCents: 2000,
        capacity: 30,
        availableQuantity: 10,
        status: 'PUBLISHED',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '20000000-0000-4000-8000-000000000099',
        organizerId: '10000000-0000-4000-8000-000000000002',
        externalProvider: 'TMDB',
        externalId: '157336',
        sourceTitle: 'Interstellar',
        title: 'Evento de outro organizador',
        description: 'Não deve ser acessível.',
        posterUrl: null,
        runtimeMinutes: 169,
        startsAt: new Date(Date.now() + 48 * 60 * 60 * 1_000),
        endsAt: new Date(Date.now() + 51 * 60 * 60 * 1_000),
        timezone: 'America/Sao_Paulo',
        venueName: 'Outro local',
        address: 'Outra rua, 10',
        city: 'Londrina',
        priceCents: 3500,
        capacity: 50,
        availableQuantity: 50,
        status: 'DRAFT',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    nextEventId = 10;

    const tmdbFetch: TmdbFetch = (input) => {
      const url = requestUrl(input);
      const summary = {
        id: 157336,
        title: 'Interestelar',
        original_title: 'Interstellar',
        overview: 'Exploradores atravessam um buraco de minhoca.',
        poster_path: '/poster.jpg',
        release_date: '2014-11-05',
      };

      if (url.pathname.endsWith('/search/movie')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              page: 1,
              results: [summary],
              total_pages: 1,
              total_results: 1,
            }),
            { status: 200 },
          ),
        );
      }

      if (url.pathname.endsWith('/movie/now_playing')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              page: 1,
              results: [summary],
              total_pages: 1,
              total_results: 1,
            }),
            { status: 200 },
          ),
        );
      }

      if (url.pathname.endsWith('/movie/157336')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ...summary,
              runtime: 169,
              genres: [{ id: 18, name: 'Drama' }],
            }),
            { status: 200 },
          ),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ status_message: 'Not found' }), {
          status: 404,
        }),
      );
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $disconnect: () => Promise.resolve(),
        $queryRaw: () => Promise.resolve([{ '?column?': 1 }]),
        user: {
          findUnique: ({ where }: { where: { email?: string; id?: string } }) =>
            Promise.resolve(
              users.find(
                (user) => user.email === where.email || user.id === where.id,
              ) ?? null,
            ),
        },
        event: {
          count: ({ where }: { where: TestEventWhere }) =>
            Promise.resolve(
              events.filter((event) => matchesEventWhere(event, where)).length,
            ),
          findMany: ({
            where,
            skip = 0,
            take = 50,
            orderBy,
          }: {
            where: TestEventWhere;
            skip?: number;
            take?: number;
            orderBy: { createdAt?: 'desc'; startsAt?: 'asc' };
          }) =>
            Promise.resolve(
              events
                .filter((event) => matchesEventWhere(event, where))
                .sort((left, right) =>
                  orderBy.startsAt
                    ? left.startsAt.getTime() - right.startsAt.getTime()
                    : right.createdAt.getTime() - left.createdAt.getTime(),
                )
                .slice(skip, skip + take),
            ),
          findFirst: ({ where }: { where: TestEventWhere & { id: string } }) =>
            Promise.resolve(
              events.find(
                (event) =>
                  event.id === where.id && matchesEventWhere(event, where),
              ) ?? null,
            ),
          findUnique: ({ where }: { where: { id: string } }) =>
            Promise.resolve(
              events.find((event) => event.id === where.id) ?? null,
            ),
          create: ({
            data,
          }: {
            data: Omit<Event, 'id' | 'createdAt' | 'updatedAt'>;
          }) => {
            const now = new Date();
            const created: Event = {
              ...data,
              id: `20000000-0000-4000-8000-${String(nextEventId).padStart(12, '0')}`,
              createdAt: now,
              updatedAt: now,
            };
            nextEventId += 1;
            events.push(created);
            return Promise.resolve(created);
          },
          updateMany: ({
            where,
            data,
          }: {
            where: { id: string; organizerId: string; status: string };
            data: Partial<Event>;
          }) => {
            const index = events.findIndex(
              (event) =>
                event.id === where.id &&
                event.organizerId === where.organizerId &&
                event.status === where.status,
            );
            if (index < 0) {
              return Promise.resolve({ count: 0 });
            }
            const updated = {
              ...events[index],
              ...data,
              updatedAt: new Date(),
            } as Event;
            events[index] = updated;
            return Promise.resolve({ count: 1 });
          },
        },
        reservation: {
          aggregate: () => Promise.resolve({ _sum: { quantity: null } }),
        },
      })
      .overrideProvider(TMDB_FETCH)
      .useValue(tmdbFetch)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    const jwt = app.get(JwtService);
    organizerToken = await jwt.signAsync({
      sub: '10000000-0000-4000-8000-000000000001',
    });
    customerToken = await jwt.signAsync({
      sub: '10000000-0000-4000-8000-000000000002',
    });
    gateToken = await jwt.signAsync({
      sub: '10000000-0000-4000-8000-000000000004',
    });
  });

  it('GET /api/v1/health/live', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .expect(200)
      .expect({ status: 'ok' });

    expect(response.headers['content-security-policy']).toContain(
      "default-src 'self'",
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('GET /api/v1/health/ready', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200)
      .expect({ status: 'ready', dependencies: { database: 'up' } });
  });

  it('publishes the OpenAPI contract and interactive documentation', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const document = response.body as {
      openapi: string;
      paths: Record<
        string,
        {
          get?: { security?: Array<Record<string, string[]>> };
          post?: { security?: Array<Record<string, string[]>> };
        }
      >;
      components: {
        securitySchemes: Record<string, unknown>;
      };
    };

    expect(document.openapi).toMatch(/^3\./);
    expect(document.paths).toHaveProperty('/api/v1/auth/login');
    expect(document.paths).toHaveProperty('/api/v1/events');
    expect(document.paths).toHaveProperty('/api/v1/reservations');
    expect(document.paths).toHaveProperty('/api/v1/gate/events');
    expect(document.components.securitySchemes).toHaveProperty('bearer');
    expect(
      document.paths['/api/v1/auth/login']?.post?.security,
    ).toBeUndefined();
    expect(
      document.paths['/api/v1/reservations']?.post?.security,
    ).toContainEqual({ bearer: [] });

    await request(app.getHttpServer()).get('/api/docs').expect(200);
  });

  it('rejects malformed login payloads and unknown fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'invalid', password: 'short', role: 'ORGANIZER' })
      .expect(400);
    const body = response.body as ApiErrorResponse;
    const fields = body.error.details.fields as Record<string, unknown>;

    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Revise os campos informados.');
    expect(Array.isArray(fields.email)).toBe(true);
    expect(Array.isArray(fields.password)).toBe(true);
    expect(Array.isArray(fields.role)).toBe(true);
    expect(body.error.requestId).toMatch(/^req_[a-f0-9]{32}$/);
  });

  it('rejects invalid credentials without revealing which field failed', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'client1@example.com', password: 'Wrong@123' })
      .expect(401);
    const body = response.body as ApiErrorResponse;

    expect(body).toMatchObject({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'E-mail ou senha inválidos.',
        details: {},
      },
    });
  });

  it.each([
    ['organizer@example.com', 'ORGANIZER'],
    ['client1@example.com', 'CUSTOMER'],
    ['gate@example.com', 'GATE'],
  ] as const)('logs in %s as %s', async (email, role) => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'Test@123' })
      .expect(200);
    const body = response.body as LoginResponse;

    expect(body).toMatchObject({
      expiresIn: 3600,
      user: { email, role },
    });
    expect(typeof body.accessToken).toBe('string');
    expect(body.user).not.toHaveProperty('passwordHash');
  });

  it('returns the authenticated user from GET /auth/me', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'client1@example.com', password: 'Test@123' })
      .expect(200);
    const loginBody = login.body as LoginResponse;

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${loginBody.accessToken}`)
      .expect(200)
      .expect({
        id: '10000000-0000-4000-8000-000000000002',
        name: 'Cliente Um',
        email: 'client1@example.com',
        role: 'CUSTOMER',
      });
  });

  it.each([undefined, 'Bearer invalid-token', 'Basic credentials'])(
    'returns UNAUTHENTICATED for a missing or invalid token',
    async (authorization) => {
      const call = request(app.getHttpServer()).get('/api/v1/auth/me');

      if (authorization) {
        call.set('Authorization', authorization);
      }

      const response = await call.expect(401);
      const body = response.body as ApiErrorResponse;
      expect(body).toMatchObject({
        error: {
          code: 'UNAUTHENTICATED',
          details: {},
        },
      });
      expect(typeof body.error.requestId).toBe('string');
    },
  );

  it('rate limits repeated login attempts for the same IP and e-mail', async () => {
    const payload = {
      email: 'client2@example.com',
      password: 'Wrong@123',
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(payload)
        .expect(401);
    }

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(payload)
      .expect(429);
    const body = response.body as ApiErrorResponse;

    expect(body).toMatchObject({
      error: {
        code: 'RATE_LIMITED',
        message: 'Muitas tentativas. Aguarde antes de tentar novamente.',
        details: {},
      },
    });
    expect(typeof body.error.requestId).toBe('string');
  });

  it('protects the catalog with authentication and organizer role', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/catalog/movies?q=Interestelar')
      .expect(401);

    const forbidden = await request(app.getHttpServer())
      .get('/api/v1/catalog/movies?q=Interestelar')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
    const body = forbidden.body as ApiErrorResponse;
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('validates catalog search parameters before calling TMDB', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/catalog/movies?q=a&page=501')
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(400);
    const body = response.body as ApiErrorResponse;
    const fields = body.error.details.fields as Record<string, unknown>;

    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(fields.q)).toBe(true);
    expect(Array.isArray(fields.page)).toBe(true);
  });

  it('searches movies for an organizer', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/catalog/movies?q=Interestelar&page=1')
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(200);
    const body = response.body as CatalogMovieListResponse;

    expect(body.data[0]).toMatchObject({
      externalProvider: 'TMDB',
      externalId: '157336',
      title: 'Interestelar',
    });
    expect(body.meta).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('lists now-playing movies and returns movie details', async () => {
    const nowPlaying = await request(app.getHttpServer())
      .get('/api/v1/catalog/movies/now-playing?page=1')
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(200);
    const list = nowPlaying.body as CatalogMovieListResponse;
    expect(list.data).toHaveLength(1);

    const details = await request(app.getHttpServer())
      .get('/api/v1/catalog/movies/157336')
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(200);
    const movie = details.body as CatalogMovieDetail;
    expect(movie).toMatchObject({
      externalId: '157336',
      runtimeMinutes: 169,
      genres: ['Drama'],
    });
  });

  it('protects organizer event management by role', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/organizer/events')
      .expect(401);

    const response = await request(app.getHttpServer())
      .get('/api/v1/organizer/events')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
    expect((response.body as ApiErrorResponse).error.code).toBe('FORBIDDEN');
  });

  it('creates a draft from the trusted catalog snapshot', async () => {
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);
    const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1_000);
    const response = await request(app.getHttpServer())
      .post('/api/v1/organizer/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        externalProvider: 'TMDB',
        externalId: '157336',
        title: 'Interestelar - Sessão Especial',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        timezone: 'America/Sao_Paulo',
        venueName: 'Cine Teatro Londrina',
        address: 'Rua das Artes, 100',
        city: 'Londrina',
        capacity: 120,
        priceCents: 3500,
      })
      .expect(201);
    const body = response.body as OrganizerEvent;

    expect(body).toMatchObject({
      externalId: '157336',
      sourceTitle: 'Interstellar',
      description: 'Exploradores atravessam um buraco de minhoca.',
      runtimeMinutes: 169,
      capacity: 120,
      availableQuantity: 120,
      status: 'DRAFT',
    });
  });

  it('validates the complete event schedule', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1_000).toISOString();
    const response = await request(app.getHttpServer())
      .post('/api/v1/organizer/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        externalProvider: 'TMDB',
        externalId: '157336',
        title: 'Sessão inválida',
        startsAt: past,
        endsAt: past,
        timezone: 'Invalid/Timezone',
        venueName: 'Cine Teatro',
        address: 'Rua das Artes, 100',
        city: 'Londrina',
        capacity: 120,
        priceCents: 3500,
      })
      .expect(422);

    expect((response.body as ApiErrorResponse).error.code).toBe(
      'INVALID_EVENT_SCHEDULE',
    );
  });

  it('lists, updates, reads and publishes an owned draft idempotently', async () => {
    const ownedDraft = events.find(
      (event) => event.organizerId === users[0]?.id && event.status === 'DRAFT',
    );
    expect(ownedDraft).toBeDefined();

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/organizer/events?status=DRAFT&page=1')
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(200);
    expect((listResponse.body as { data: OrganizerEvent[] }).data).toHaveLength(
      1,
    );

    const updatedResponse = await request(app.getHttpServer())
      .patch(`/api/v1/organizer/events/${ownedDraft?.id}`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ capacity: 150, priceCents: 4000 })
      .expect(200);
    expect(updatedResponse.body as OrganizerEvent).toMatchObject({
      capacity: 150,
      availableQuantity: 150,
      priceCents: 4000,
    });

    const detailsResponse = await request(app.getHttpServer())
      .get(`/api/v1/organizer/events/${ownedDraft?.id}`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(200);
    expect(detailsResponse.body as OrganizerEventDetail).toMatchObject({
      reservedQuantity: 0,
      soldQuantity: 0,
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const publishedResponse = await request(app.getHttpServer())
        .post(`/api/v1/organizer/events/${ownedDraft?.id}/publish`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);
      expect((publishedResponse.body as OrganizerEvent).status).toBe(
        'PUBLISHED',
      );
    }

    await request(app.getHttpServer())
      .patch(`/api/v1/organizer/events/${ownedDraft?.id}`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ capacity: 200 })
      .expect(409)
      .expect((response) => {
        expect((response.body as ApiErrorResponse).error.code).toBe(
          'EVENT_NOT_EDITABLE',
        );
      });
  });

  it('forbids access to an event owned by another user', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/organizer/events/20000000-0000-4000-8000-000000000099')
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(403);

    expect((response.body as ApiErrorResponse).error.code).toBe('FORBIDDEN');
  });

  it('lists and searches future published events without authentication', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/events?page=1&pageSize=12')
      .expect(200);
    const list = response.body as PublicEventListResponse;

    expect(list.data.length).toBeGreaterThan(0);
    expect(list.data.every((event) => event.status === 'PUBLISHED')).toBe(true);
    expect(
      list.data.every(
        (event) => new Date(event.startsAt).getTime() > Date.now(),
      ),
    ).toBe(true);
    expect(list.data.some((event) => event.title === 'Sessão encerrada')).toBe(
      false,
    );
    expect(
      list.data.some((event) => event.title === 'Evento de outro organizador'),
    ).toBe(false);

    const searchResponse = await request(app.getHttpServer())
      .get('/api/v1/events?q=Ouro%20Verde&page=1&pageSize=12')
      .expect(200);
    const search = searchResponse.body as PublicEventListResponse;
    expect(search.data).toHaveLength(1);
    expect(search.data[0]?.city).toBe('Londrina');
  });

  it('validates public search and hides non-public event details', async () => {
    await request(app.getHttpServer()).get('/api/v1/events?q=a').expect(400);

    const publishedResponse = await request(app.getHttpServer())
      .get('/api/v1/events/20000000-0000-4000-8000-000000000001')
      .expect(200);
    expect(publishedResponse.body as PublicEvent).toMatchObject({
      title: 'Interestelar - Sessão Especial',
      availableQuantity: 87,
      status: 'PUBLISHED',
    });

    for (const hiddenId of [
      '20000000-0000-4000-8000-000000000098',
      '20000000-0000-4000-8000-000000000099',
    ]) {
      const hiddenResponse = await request(app.getHttpServer())
        .get(`/api/v1/events/${hiddenId}`)
        .expect(404);
      expect((hiddenResponse.body as ApiErrorResponse).error.code).toBe(
        'EVENT_NOT_FOUND',
      );
    }
  });

  it('rate limits repeated public shared-ticket lookups by IP', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app.getHttpServer())
        .get('/api/v1/tickets/shared/invalid-token')
        .expect(404);
      expect((response.body as ApiErrorResponse).error.code).toBe(
        'SHARED_TICKET_NOT_FOUND',
      );
    }

    const response = await request(app.getHttpServer())
      .get('/api/v1/tickets/shared/invalid-token')
      .expect(429);
    expect(response.body as ApiErrorResponse).toMatchObject({
      error: { code: 'RATE_LIMITED', details: {} },
    });
  });

  it('protects gate events with the GATE role and lists operational events', async () => {
    await request(app.getHttpServer()).get('/api/v1/gate/events').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/gate/events')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);

    const response = await request(app.getHttpServer())
      .get('/api/v1/gate/events?q=Ouro%20Verde')
      .set('Authorization', `Bearer ${gateToken}`)
      .expect(200);
    const body = response.body as GateEventListResponse;
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: '20000000-0000-4000-8000-000000000001',
      title: 'Interestelar - Sessão Especial',
      city: 'Londrina',
    });
  });

  it('validates the gate request before reading a QR code', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/gate/events/20000000-0000-4000-8000-000000000001/validate')
      .set('Authorization', `Bearer ${gateToken}`)
      .send({ code: '', eventId: 'untrusted' })
      .expect(400);
    const body = response.body as ApiErrorResponse;
    expect(body.error.code).toBe('VALIDATION_ERROR');
    const fields = body.error.details.fields as Record<string, unknown>;
    expect(Array.isArray(fields.code)).toBe(true);
    expect(Array.isArray(fields.eventId)).toBe(true);
  });

  afterAll(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
    delete process.env.QR_SIGNING_SECRET;
    delete process.env.APP_PUBLIC_URL;
    delete process.env.JWT_EXPIRES_IN_SECONDS;
    delete process.env.AUTH_LOGIN_RATE_LIMIT;
    delete process.env.AUTH_LOGIN_RATE_WINDOW_MS;
    delete process.env.TMDB_API_READ_TOKEN;
  });
});
