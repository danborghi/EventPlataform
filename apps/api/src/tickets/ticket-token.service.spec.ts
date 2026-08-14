import { ConfigService } from '@nestjs/config';
import { TicketTokenService } from './ticket-token.service.js';

const ticketId = '50000000-0000-4000-8000-000000000001';
const eventId = '20000000-0000-4000-8000-000000000001';
const secret = 'ticket-test-secret-with-at-least-32-characters';

function tokenService(): TicketTokenService {
  const config = {
    get: (key: string) =>
      key === 'QR_SIGNING_SECRET' ? secret : 'http://localhost:3000',
  } as unknown as ConfigService;
  return new TicketTokenService(config);
}

describe('TicketTokenService', () => {
  it('issues and verifies a canonical signed payload', () => {
    const service = tokenService();
    const issuedAt = new Date('2026-08-14T12:00:00.000Z');
    const expiresAt = new Date('2026-08-14T15:00:00.000Z');

    const issued = service.issue(ticketId, eventId, expiresAt, issuedAt);
    const payload = service.verify(
      issued.code,
      new Date('2026-08-14T13:00:00.000Z'),
    );

    expect(payload).toMatchObject({
      v: 1,
      ticketId,
      eventId,
      iat: 1_786_708_800,
      exp: 1_786_719_600,
    });
    expect(issued.nonceHash).toHaveLength(64);
    expect(issued.code).not.toContain(ticketId);
  });

  it('rejects payload and signature tampering', () => {
    const service = tokenService();
    const issued = service.issue(
      ticketId,
      eventId,
      new Date(Date.now() + 60_000),
    );
    const [version, payload, signature] = issued.code.split('.');
    if (!version || !payload || !signature) throw new Error('Invalid fixture');

    const changedPayload = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`;
    const changedSignature = `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;

    expect(
      service.verify(`${version}.${changedPayload}.${signature}`),
    ).toBeNull();
    expect(
      service.verify(`${version}.${payload}.${changedSignature}`),
    ).toBeNull();
  });

  it('rejects expired tokens', () => {
    const service = tokenService();
    const issued = service.issue(
      ticketId,
      eventId,
      new Date('2026-08-14T13:00:00.000Z'),
      new Date('2026-08-14T12:00:00.000Z'),
    );

    expect(
      service.verify(issued.code, new Date('2026-08-14T13:00:00.000Z')),
    ).toBeNull();
  });

  it('derives stable but ticket-specific nonces', () => {
    const service = tokenService();
    const expiration = new Date(Date.now() + 60_000);
    const first = service.issue(ticketId, eventId, expiration);
    const retry = service.issue(ticketId, eventId, expiration);
    const other = service.issue(
      '50000000-0000-4000-8000-000000000002',
      eventId,
      expiration,
    );

    expect(first.nonceHash).toBe(retry.nonceHash);
    expect(first.nonceHash).not.toBe(other.nonceHash);
  });
});
