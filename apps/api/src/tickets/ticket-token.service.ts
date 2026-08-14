import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readTicketsConfiguration } from './tickets.config.js';

const TOKEN_VERSION = 'v1';

export interface TicketTokenPayload {
  v: 1;
  ticketId: string;
  eventId: string;
  nonce: string;
  iat: number;
  exp: number;
}

export interface IssuedTicketToken {
  code: string;
  expiresAt: Date;
  nonceHash: string;
}

@Injectable()
export class TicketTokenService {
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = readTicketsConfiguration(config).qrSigningSecret;
  }

  issue(
    ticketId: string,
    eventId: string,
    expiresAt: Date,
    issuedAt = new Date(),
  ): IssuedTicketToken {
    const nonce = this.deriveNonce(ticketId);
    const payload: TicketTokenPayload = {
      v: 1,
      ticketId,
      eventId,
      nonce,
      iat: Math.floor(issuedAt.getTime() / 1_000),
      exp: Math.floor(expiresAt.getTime() / 1_000),
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const signedContent = `${TOKEN_VERSION}.${encodedPayload}`;
    const signature = this.sign(signedContent);

    return {
      code: `${signedContent}.${signature}`,
      expiresAt,
      nonceHash: this.hashNonce(nonce),
    };
  }

  verify(code: string, now = new Date()): TicketTokenPayload | null {
    const parts = code.split('.');
    if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return null;
    const [, encodedPayload, providedSignature] = parts;
    if (!encodedPayload || !providedSignature) return null;
    if (!/^[A-Za-z0-9_-]{43}$/.test(providedSignature)) return null;

    const expectedSignature = this.sign(`${TOKEN_VERSION}.${encodedPayload}`);
    const provided = Buffer.from(providedSignature, 'ascii');
    const expected = Buffer.from(expectedSignature, 'ascii');
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      return null;
    }

    try {
      const payload: unknown = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      );
      if (!this.isPayload(payload)) return null;
      if (payload.exp <= Math.floor(now.getTime() / 1_000)) return null;
      return payload;
    } catch {
      return null;
    }
  }

  hashNonce(nonce: string): string {
    return createHash('sha256').update(nonce).digest('hex');
  }

  private deriveNonce(ticketId: string): string {
    return createHmac('sha256', this.secret)
      .update(`ticket-nonce:${TOKEN_VERSION}:${ticketId}`)
      .digest('base64url');
  }

  private sign(content: string): string {
    return createHmac('sha256', this.secret)
      .update(content)
      .digest('base64url');
  }

  private isPayload(payload: unknown): payload is TicketTokenPayload {
    if (typeof payload !== 'object' || payload === null) return false;
    const value = payload as Record<string, unknown>;
    return (
      value.v === 1 &&
      typeof value.ticketId === 'string' &&
      typeof value.eventId === 'string' &&
      typeof value.nonce === 'string' &&
      typeof value.iat === 'number' &&
      Number.isInteger(value.iat) &&
      typeof value.exp === 'number' &&
      Number.isInteger(value.exp) &&
      value.exp > value.iat
    );
  }
}
