import type { CustomerReservation } from '@event-platform/contracts';
import {
  HttpStatus,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { CreateReservationDto } from './dto/create-reservation.dto.js';

const RESERVATION_DURATION_MS = 10 * 60 * 1_000;
const EXPIRATION_SWEEP_INTERVAL_MS = 60 * 1_000;
const EXPIRATION_BATCH_SIZE = 100;

type TransactionClient = Prisma.TransactionClient;
type ReservationWithRelations = Prisma.ReservationGetPayload<{
  include: {
    event: true;
    tickets: { orderBy: { sequence: 'asc' } };
  };
}>;

@Injectable()
export class ReservationsService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private expirationTimer: NodeJS.Timeout | undefined;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): void {
    this.expirationTimer = setInterval(() => {
      void this.expirePendingReservations().catch(() => undefined);
    }, EXPIRATION_SWEEP_INTERVAL_MS);
    this.expirationTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.expirationTimer) clearInterval(this.expirationTimer);
  }

  async create(
    customerId: string,
    input: CreateReservationDto,
  ): Promise<CustomerReservation> {
    if (input.quantity < 1 || input.quantity > 6) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_QUANTITY',
        'A quantidade deve estar entre 1 e 6 ingressos.',
      );
    }

    await this.expirePendingReservations(input.eventId);
    const now = new Date();
    const reservation = await this.prisma.$transaction(async (transaction) => {
      const inventory = await transaction.event.updateMany({
        where: {
          id: input.eventId,
          status: 'PUBLISHED',
          startsAt: { gt: now },
          availableQuantity: { gte: input.quantity },
        },
        data: { availableQuantity: { decrement: input.quantity } },
      });

      if (inventory.count !== 1) {
        const event = await transaction.event.findUnique({
          where: { id: input.eventId },
        });

        if (!event) {
          throw new ApiException(
            HttpStatus.NOT_FOUND,
            'EVENT_NOT_FOUND',
            'Evento não encontrado.',
          );
        }

        if (event.status !== 'PUBLISHED' || event.startsAt <= now) {
          throw new ApiException(
            HttpStatus.CONFLICT,
            'EVENT_NOT_AVAILABLE',
            'Este evento não está disponível para reservas.',
          );
        }

        throw new ApiException(
          HttpStatus.CONFLICT,
          'INSUFFICIENT_INVENTORY',
          'Não há ingressos suficientes para esta reserva.',
        );
      }

      const event = await transaction.event.findUniqueOrThrow({
        where: { id: input.eventId },
      });

      return transaction.reservation.create({
        data: {
          customerId,
          eventId: event.id,
          quantity: input.quantity,
          unitPriceCents: event.priceCents,
          totalPriceCents: event.priceCents * input.quantity,
          status: 'PENDING_PAYMENT',
          expiresAt: new Date(now.getTime() + RESERVATION_DURATION_MS),
        },
        include: {
          event: true,
          tickets: { orderBy: { sequence: 'asc' } },
        },
      });
    });

    return this.toCustomerReservation(reservation);
  }

  async get(
    customerId: string,
    reservationId: string,
  ): Promise<CustomerReservation> {
    await this.expireReservation(reservationId);
    const reservation = await this.findOwnedReservation(
      this.prisma,
      customerId,
      reservationId,
    );
    return this.toCustomerReservation(reservation);
  }

  async cancel(
    customerId: string,
    reservationId: string,
  ): Promise<CustomerReservation> {
    await this.expireReservation(reservationId);
    const reservation = await this.prisma.$transaction(async (transaction) => {
      const current = await this.findOwnedReservation(
        transaction,
        customerId,
        reservationId,
      );

      if (current.status === 'CANCELED') return current;

      if (current.status !== 'PENDING_PAYMENT') {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'RESERVATION_NOT_CANCELABLE',
          'Esta reserva não pode ser cancelada.',
        );
      }

      const now = new Date();
      const canceled = await transaction.reservation.updateMany({
        where: {
          id: reservationId,
          customerId,
          status: 'PENDING_PAYMENT',
          expiresAt: { gt: now },
          inventoryReleasedAt: null,
        },
        data: { status: 'CANCELED', inventoryReleasedAt: now },
      });

      if (canceled.count !== 1) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'RESERVATION_NOT_CANCELABLE',
          'Esta reserva não pode ser cancelada.',
        );
      }

      await transaction.event.update({
        where: { id: current.eventId },
        data: { availableQuantity: { increment: current.quantity } },
      });

      return this.findOwnedReservation(transaction, customerId, reservationId);
    });

    return this.toCustomerReservation(reservation);
  }

  async expirePendingReservations(eventId?: string): Promise<number> {
    const expired = await this.prisma.reservation.findMany({
      where: {
        ...(eventId ? { eventId } : {}),
        status: 'PENDING_PAYMENT',
        expiresAt: { lte: new Date() },
        inventoryReleasedAt: null,
      },
      select: { id: true },
      orderBy: { expiresAt: 'asc' },
      take: EXPIRATION_BATCH_SIZE,
    });

    let released = 0;
    for (const reservation of expired) {
      if (await this.expireReservation(reservation.id)) released += 1;
    }
    return released;
  }

  private async expireReservation(reservationId: string): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const reservation = await transaction.reservation.findUnique({
        where: { id: reservationId },
      });
      const now = new Date();

      if (
        !reservation ||
        reservation.status !== 'PENDING_PAYMENT' ||
        reservation.expiresAt > now ||
        reservation.inventoryReleasedAt
      ) {
        return false;
      }

      const expired = await transaction.reservation.updateMany({
        where: {
          id: reservationId,
          status: 'PENDING_PAYMENT',
          expiresAt: { lte: now },
          inventoryReleasedAt: null,
        },
        data: { status: 'EXPIRED', inventoryReleasedAt: now },
      });

      if (expired.count !== 1) return false;

      await transaction.event.update({
        where: { id: reservation.eventId },
        data: { availableQuantity: { increment: reservation.quantity } },
      });
      return true;
    });
  }

  private async findOwnedReservation(
    client: TransactionClient | PrismaService,
    customerId: string,
    reservationId: string,
  ): Promise<ReservationWithRelations> {
    const reservation = await client.reservation.findFirst({
      where: { id: reservationId, customerId },
      include: {
        event: true,
        tickets: { orderBy: { sequence: 'asc' } },
      },
    });

    if (!reservation) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'RESERVATION_NOT_FOUND',
        'Reserva não encontrada.',
      );
    }

    return reservation;
  }

  private toCustomerReservation(
    reservation: ReservationWithRelations,
  ): CustomerReservation {
    return {
      id: reservation.id,
      event: {
        id: reservation.event.id,
        title: reservation.event.title,
        posterUrl: reservation.event.posterUrl,
        startsAt: reservation.event.startsAt.toISOString(),
        timezone: reservation.event.timezone,
        venueName: reservation.event.venueName,
        city: reservation.event.city,
      },
      quantity: reservation.quantity,
      unitPriceCents: reservation.unitPriceCents,
      totalPriceCents: reservation.totalPriceCents,
      status: reservation.status,
      expiresAt: reservation.expiresAt.toISOString(),
      tickets: reservation.tickets.map((ticket) => ({
        id: ticket.id,
        sequence: ticket.sequence,
        status: ticket.status,
      })),
    };
  }
}
