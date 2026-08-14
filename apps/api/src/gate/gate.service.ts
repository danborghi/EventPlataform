import type {
  GateEvent,
  GateEventListResponse,
  GateValidationResponse,
  ValidationResult,
} from '@event-platform/contracts';
import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ApiException } from '../common/errors/api.exception.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Event, Prisma } from '../generated/prisma/client.js';
import { TicketTokenService } from '../tickets/ticket-token.service.js';

const OPERATIONAL_WINDOW_MS = 3 * 60 * 60 * 1_000;
const GATE_EVENT_LIMIT = 50;

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class GateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TicketTokenService,
  ) {}

  async listEvents(query?: string): Promise<GateEventListResponse> {
    const events = await this.prisma.event.findMany({
      where: {
        status: 'PUBLISHED',
        endsAt: {
          gt: new Date(Date.now() - OPERATIONAL_WINDOW_MS),
        },
        ...(query
          ? {
              OR: [
                { title: { contains: query, mode: 'insensitive' } },
                { venueName: { contains: query, mode: 'insensitive' } },
                { city: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { startsAt: 'asc' },
      take: GATE_EVENT_LIMIT,
    });

    return { data: events.map((event) => this.toGateEvent(event)) };
  }

  async validate(
    gateUserId: string,
    selectedEventId: string,
    code: string,
  ): Promise<GateValidationResponse> {
    const selectedEvent = await this.findGateEvent(selectedEventId);
    const fingerprint = this.fingerprint(code);
    const now = new Date();
    const payload = this.tokens.verify(code, now);

    if (!payload) {
      await this.recordValidation(this.prisma, {
        eventId: selectedEventId,
        gateUserId,
        tokenFingerprint: fingerprint,
        result: 'INVALID',
      });
      return { result: 'INVALID' };
    }

    if (payload.eventId !== selectedEventId) {
      await this.recordValidation(this.prisma, {
        eventId: selectedEventId,
        gateUserId,
        tokenFingerprint: fingerprint,
        result: 'WRONG_EVENT',
      });
      return { result: 'WRONG_EVENT' };
    }

    return this.prisma.$transaction(async (transaction) => {
      const expectedNonceHash = this.tokens.hashNonce(payload.nonce);
      const ticket = await transaction.ticket.findUnique({
        where: { id: payload.ticketId },
      });

      if (
        !ticket ||
        ticket.eventId !== selectedEventId ||
        ticket.qrNonceHash !== expectedNonceHash ||
        ticket.status === 'CANCELED'
      ) {
        await this.recordValidation(transaction, {
          eventId: selectedEventId,
          gateUserId,
          tokenFingerprint: fingerprint,
          result: 'INVALID',
        });
        return { result: 'INVALID' };
      }

      if (ticket.status === 'USED') {
        return this.alreadyUsed(
          transaction,
          ticket.usedAt,
          selectedEvent,
          ticket.id,
          gateUserId,
          fingerprint,
        );
      }

      const consumed = await transaction.ticket.updateMany({
        where: {
          id: ticket.id,
          eventId: selectedEventId,
          status: 'VALID',
          qrNonceHash: expectedNonceHash,
        },
        data: {
          status: 'USED',
          usedAt: now,
          validatedById: gateUserId,
        },
      });

      if (consumed.count === 1) {
        await this.recordValidation(transaction, {
          ticketId: ticket.id,
          eventId: selectedEventId,
          gateUserId,
          tokenFingerprint: fingerprint,
          result: 'VALID',
        });
        return {
          result: 'VALID',
          validatedAt: now.toISOString(),
          ticket: { id: ticket.id, sequence: ticket.sequence },
          event: this.toGateEvent(selectedEvent),
        };
      }

      const current = await transaction.ticket.findUnique({
        where: { id: ticket.id },
      });
      if (
        current?.status === 'USED' &&
        current.eventId === selectedEventId &&
        current.qrNonceHash === expectedNonceHash
      ) {
        return this.alreadyUsed(
          transaction,
          current.usedAt,
          selectedEvent,
          current.id,
          gateUserId,
          fingerprint,
        );
      }

      await this.recordValidation(transaction, {
        eventId: selectedEventId,
        gateUserId,
        tokenFingerprint: fingerprint,
        result: 'INVALID',
      });
      return { result: 'INVALID' };
    });
  }

  private async alreadyUsed(
    transaction: TransactionClient,
    usedAt: Date | null,
    event: Event,
    ticketId: string,
    gateUserId: string,
    tokenFingerprint: string,
  ): Promise<GateValidationResponse> {
    if (!usedAt) {
      await this.recordValidation(transaction, {
        eventId: event.id,
        gateUserId,
        tokenFingerprint,
        result: 'INVALID',
      });
      return { result: 'INVALID' };
    }

    await this.recordValidation(transaction, {
      ticketId,
      eventId: event.id,
      gateUserId,
      tokenFingerprint,
      result: 'ALREADY_USED',
    });
    return {
      result: 'ALREADY_USED',
      usedAt: usedAt.toISOString(),
      event: this.toGateEvent(event),
    };
  }

  private async findGateEvent(eventId: string): Promise<Event> {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        status: 'PUBLISHED',
        endsAt: { gt: new Date(Date.now() - OPERATIONAL_WINDOW_MS) },
      },
    });
    if (!event) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'EVENT_NOT_FOUND',
        'Evento não encontrado para validação.',
      );
    }
    return event;
  }

  private recordValidation(
    client: TransactionClient | PrismaService,
    data: {
      ticketId?: string;
      eventId: string;
      gateUserId: string;
      tokenFingerprint: string;
      result: ValidationResult;
    },
  ) {
    return client.ticketValidation.create({ data });
  }

  private fingerprint(code: string): string {
    return createHash('sha256').update(code).digest('hex').slice(0, 16);
  }

  private toGateEvent(event: Event): GateEvent {
    return {
      id: event.id,
      title: event.title,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      timezone: event.timezone,
      venueName: event.venueName,
      city: event.city,
    };
  }
}
