import type {
  CustomerTicket,
  CustomerTicketListResponse,
  SharedTicketResponse,
  TicketQrResponse,
  TicketShareLinkResponse,
  TicketStatus,
} from '@event-platform/contracts';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { ApiException } from '../common/errors/api.exception.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { TicketTokenService } from './ticket-token.service.js';
import { readTicketsConfiguration } from './tickets.config.js';

const TICKET_PAGE_SIZE = 12;
const OPERATIONAL_WINDOW_MS = 3 * 60 * 60 * 1_000;

type TransactionClient = Prisma.TransactionClient;
type TicketWithEvent = Prisma.TicketGetPayload<{
  include: {
    event: true;
    shareLinks: true;
  };
}>;

@Injectable()
export class TicketsService {
  private readonly appPublicUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TicketTokenService,
    config: ConfigService,
  ) {
    this.appPublicUrl = readTicketsConfiguration(config).appPublicUrl;
  }

  async listMine(
    customerId: string,
    page: number,
    status: TicketStatus | undefined,
  ): Promise<CustomerTicketListResponse> {
    const now = new Date();
    const tickets = await this.prisma.ticket.findMany({
      where: { customerId, ...(status ? { status } : {}) },
      include: {
        event: true,
        shareLinks: {
          where: { revokedAt: null, expiresAt: { gt: now } },
          take: 1,
        },
      },
    });
    tickets.sort((left, right) => {
      const leftFuture = left.event.startsAt > now;
      const rightFuture = right.event.startsAt > now;
      if (leftFuture !== rightFuture) return leftFuture ? -1 : 1;
      return leftFuture
        ? left.event.startsAt.getTime() - right.event.startsAt.getTime()
        : right.event.startsAt.getTime() - left.event.startsAt.getTime();
    });

    const total = tickets.length;
    const start = (page - 1) * TICKET_PAGE_SIZE;
    return {
      data: tickets
        .slice(start, start + TICKET_PAGE_SIZE)
        .map((ticket) => this.toCustomerTicket(ticket)),
      meta: {
        page,
        pageSize: TICKET_PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / TICKET_PAGE_SIZE),
      },
    };
  }

  async getMine(customerId: string, ticketId: string): Promise<CustomerTicket> {
    const ticket = await this.findOwnedTicket(
      this.prisma,
      customerId,
      ticketId,
    );
    return this.toCustomerTicket(ticket);
  }

  async getQr(customerId: string, ticketId: string): Promise<TicketQrResponse> {
    const ticket = await this.findOwnedTicket(
      this.prisma,
      customerId,
      ticketId,
    );
    return this.issueQr(ticket);
  }

  async createShareLink(
    customerId: string,
    ticketId: string,
  ): Promise<TicketShareLinkResponse> {
    try {
      return await this.createShareLinkTransaction(customerId, ticketId);
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      return this.createShareLinkTransaction(customerId, ticketId);
    }
  }

  async revokeShareLink(customerId: string, ticketId: string): Promise<void> {
    await this.findOwnedTicket(this.prisma, customerId, ticketId);
    await this.prisma.shareLink.updateMany({
      where: { ticketId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getShared(shareToken: string): Promise<SharedTicketResponse> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(shareToken)) this.throwSharedNotFound();
    const tokenHash = this.hashToken(shareToken);
    const now = new Date();
    const link = await this.prisma.shareLink.findUnique({
      where: { tokenHash },
      include: { ticket: { include: { event: true } } },
    });

    if (!link || link.revokedAt || link.expiresAt <= now) {
      this.throwSharedNotFound();
    }

    const { ticket } = link;
    return {
      ticket: { sequence: ticket.sequence, status: ticket.status },
      event: this.toEvent(ticket.event),
      qr: ticket.status === 'VALID' ? await this.issueQr(ticket) : null,
    };
  }

  private async createShareLinkTransaction(
    customerId: string,
    ticketId: string,
  ): Promise<TicketShareLinkResponse> {
    return this.prisma.$transaction(async (transaction) => {
      const ticket = await this.findOwnedTicket(
        transaction,
        customerId,
        ticketId,
      );
      const now = new Date();
      const expiresAt = this.qrExpiresAt(ticket.event.endsAt);
      if (ticket.status !== 'VALID' || expiresAt <= now) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'TICKET_NOT_ACTIVE',
          'Este ingresso não está ativo para compartilhamento.',
        );
      }

      await transaction.shareLink.updateMany({
        where: { ticketId, revokedAt: null },
        data: { revokedAt: now },
      });
      const token = randomBytes(32).toString('base64url');
      await transaction.shareLink.create({
        data: {
          ticketId,
          tokenHash: this.hashToken(token),
          expiresAt,
        },
      });

      return {
        url: `${this.appPublicUrl}/tickets/shared/${token}`,
        expiresAt: expiresAt.toISOString(),
      };
    });
  }

  private async issueQr(
    ticket: Pick<
      TicketWithEvent,
      'id' | 'eventId' | 'status' | 'qrNonceHash'
    > & {
      event: TicketWithEvent['event'];
    },
  ): Promise<TicketQrResponse> {
    const expiresAt = this.qrExpiresAt(ticket.event.endsAt);
    if (ticket.status !== 'VALID' || expiresAt <= new Date()) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'TICKET_NOT_ACTIVE',
        'Este ingresso não está ativo.',
      );
    }

    const issued = this.tokens.issue(ticket.id, ticket.eventId, expiresAt);
    if (ticket.qrNonceHash !== issued.nonceHash) {
      const updated = await this.prisma.ticket.updateMany({
        where: { id: ticket.id, status: 'VALID' },
        data: { qrNonceHash: issued.nonceHash },
      });
      if (updated.count !== 1) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'TICKET_NOT_ACTIVE',
          'Este ingresso não está ativo.',
        );
      }
    }

    return { code: issued.code, expiresAt: issued.expiresAt.toISOString() };
  }

  private async findOwnedTicket(
    client: TransactionClient | PrismaService,
    customerId: string,
    ticketId: string,
  ): Promise<TicketWithEvent> {
    const ticket = await client.ticket.findFirst({
      where: { id: ticketId, customerId },
      include: {
        event: true,
        shareLinks: {
          where: { revokedAt: null, expiresAt: { gt: new Date() } },
          take: 1,
        },
      },
    });
    if (!ticket) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'TICKET_NOT_FOUND',
        'Ingresso não encontrado.',
      );
    }
    return ticket;
  }

  private toCustomerTicket(ticket: TicketWithEvent): CustomerTicket {
    return {
      id: ticket.id,
      sequence: ticket.sequence,
      status: ticket.status,
      usedAt: ticket.usedAt?.toISOString() ?? null,
      event: this.toEvent(ticket.event),
      hasActiveShareLink: ticket.shareLinks.length > 0,
    };
  }

  private toEvent(event: TicketWithEvent['event']) {
    return {
      id: event.id,
      title: event.title,
      posterUrl: event.posterUrl,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      timezone: event.timezone,
      venueName: event.venueName,
      address: event.address,
      city: event.city,
    };
  }

  private qrExpiresAt(endsAt: Date): Date {
    return new Date(endsAt.getTime() + OPERATIONAL_WINDOW_MS);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private throwSharedNotFound(): never {
    throw new ApiException(
      HttpStatus.NOT_FOUND,
      'SHARED_TICKET_NOT_FOUND',
      'Ingresso compartilhado não encontrado.',
    );
  }
}
