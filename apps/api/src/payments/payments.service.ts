import type {
  PaymentSimulationResult,
  SimulatedPaymentResponse,
} from '@event-platform/contracts';
import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { ApiException } from '../common/errors/api.exception.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

type TransactionClient = Prisma.TransactionClient;
type PaymentWithReservation = Prisma.PaymentGetPayload<{
  include: {
    reservation: {
      include: { tickets: { orderBy: { sequence: 'asc' } } };
    };
  };
}>;

interface PaymentErrorResult {
  error: 'RESERVATION_EXPIRED';
}

interface PaymentRetryResult {
  retry: 'EXISTING_PAYMENT';
}

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async simulate(
    customerId: string,
    reservationId: string,
    idempotencyKeyValue: string | undefined,
    simulationResult: PaymentSimulationResult,
  ): Promise<SimulatedPaymentResponse> {
    const idempotencyKey = idempotencyKeyValue?.trim();
    if (
      !idempotencyKey ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 128
    ) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Informe uma Idempotency-Key válida de 8 a 128 caracteres.',
      );
    }

    const requestHash = this.hashRequest(
      customerId,
      reservationId,
      simulationResult,
    );
    const replay = await this.findReplay(
      customerId,
      idempotencyKey,
      requestHash,
    );
    if (replay) return replay;

    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        const replayInTransaction = await this.findReplay(
          customerId,
          idempotencyKey,
          requestHash,
          transaction,
        );
        if (replayInTransaction) return replayInTransaction;

        const reservation = await transaction.reservation.findFirst({
          where: { id: reservationId, customerId },
          include: {
            payment: true,
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

        if (reservation.payment) {
          if (
            reservation.payment.status === 'APPROVED' &&
            simulationResult === 'APPROVED'
          ) {
            return this.toPaymentResponse({
              ...reservation.payment,
              reservation: {
                ...reservation,
                tickets: reservation.tickets,
              },
            });
          }

          throw new ApiException(
            HttpStatus.CONFLICT,
            'RESERVATION_NOT_PAYABLE',
            'Esta reserva não aceita um novo pagamento.',
          );
        }

        const now = new Date();
        if (
          reservation.status === 'EXPIRED' ||
          (reservation.status === 'PENDING_PAYMENT' &&
            reservation.expiresAt <= now)
        ) {
          await this.releaseExpired(transaction, reservation.id, now);
          return { error: 'RESERVATION_EXPIRED' } satisfies PaymentErrorResult;
        }

        if (reservation.status !== 'PENDING_PAYMENT') {
          throw new ApiException(
            HttpStatus.CONFLICT,
            'RESERVATION_NOT_PAYABLE',
            'Esta reserva não aceita um novo pagamento.',
          );
        }

        const updated = await transaction.reservation.updateMany({
          where: {
            id: reservation.id,
            customerId,
            status: 'PENDING_PAYMENT',
            expiresAt: { gt: now },
            inventoryReleasedAt: null,
          },
          data:
            simulationResult === 'APPROVED'
              ? { status: 'PAID' }
              : { status: 'DECLINED', inventoryReleasedAt: now },
        });

        if (updated.count !== 1) {
          const current = await transaction.reservation.findUniqueOrThrow({
            where: { id: reservation.id },
          });
          if (current.status === 'EXPIRED' || current.expiresAt <= now) {
            await this.releaseExpired(transaction, current.id, now);
            return {
              error: 'RESERVATION_EXPIRED',
            } satisfies PaymentErrorResult;
          }

          if (current.status === 'PAID' && simulationResult === 'APPROVED') {
            const existing = await transaction.payment.findUnique({
              where: { reservationId },
              include: {
                reservation: {
                  include: { tickets: { orderBy: { sequence: 'asc' } } },
                },
              },
            });
            return existing
              ? this.toPaymentResponse(existing)
              : ({ retry: 'EXISTING_PAYMENT' } satisfies PaymentRetryResult);
          }

          throw new ApiException(
            HttpStatus.CONFLICT,
            'RESERVATION_NOT_PAYABLE',
            'Esta reserva não aceita um novo pagamento.',
          );
        }

        if (simulationResult === 'DECLINED') {
          await transaction.event.update({
            where: { id: reservation.eventId },
            data: {
              availableQuantity: { increment: reservation.quantity },
            },
          });
        }

        const payment = await transaction.payment.create({
          data: {
            reservationId: reservation.id,
            amountCents: reservation.totalPriceCents,
            status: simulationResult,
            idempotencyKey,
            requestHash,
          },
        });

        if (simulationResult === 'APPROVED') {
          await transaction.ticket.createMany({
            data: Array.from({ length: reservation.quantity }, (_, index) => ({
              reservationId: reservation.id,
              customerId,
              eventId: reservation.eventId,
              sequence: index + 1,
              status: 'VALID' as const,
              qrNonceHash: this.randomNonceHash(),
            })),
            skipDuplicates: true,
          });
        }

        const completed = await transaction.payment.findUniqueOrThrow({
          where: { id: payment.id },
          include: {
            reservation: {
              include: { tickets: { orderBy: { sequence: 'asc' } } },
            },
          },
        });
        return this.toPaymentResponse(completed);
      });

      if ('error' in result) this.throwExpired();
      if ('retry' in result) {
        const existing = await this.findApprovedPayment(
          customerId,
          reservationId,
        );
        if (existing) return existing;
        throw new ApiException(
          HttpStatus.CONFLICT,
          'RESERVATION_NOT_PAYABLE',
          'Esta reserva não aceita um novo pagamento.',
        );
      }
      return result;
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;

      const retry = await this.findReplay(
        customerId,
        idempotencyKey,
        requestHash,
      );
      if (retry) return retry;

      if (simulationResult === 'APPROVED') {
        const existing = await this.findApprovedPayment(
          customerId,
          reservationId,
        );
        if (existing) return existing;
      }

      throw new ApiException(
        HttpStatus.CONFLICT,
        'RESERVATION_NOT_PAYABLE',
        'Esta reserva não aceita um novo pagamento.',
      );
    }
  }

  private async findApprovedPayment(
    customerId: string,
    reservationId: string,
  ): Promise<SimulatedPaymentResponse | null> {
    const payment = await this.prisma.payment.findUnique({
      where: { reservationId },
      include: {
        reservation: {
          include: { tickets: { orderBy: { sequence: 'asc' } } },
        },
      },
    });
    return payment?.reservation.customerId === customerId &&
      payment.status === 'APPROVED'
      ? this.toPaymentResponse(payment)
      : null;
  }

  private async findReplay(
    customerId: string,
    idempotencyKey: string,
    requestHash: string,
    client: TransactionClient | PrismaService = this.prisma,
  ): Promise<SimulatedPaymentResponse | null> {
    const payment = await client.payment.findUnique({
      where: { idempotencyKey },
      include: {
        reservation: {
          include: { tickets: { orderBy: { sequence: 'asc' } } },
        },
      },
    });

    if (!payment) return null;

    if (
      payment.requestHash !== requestHash ||
      payment.reservation.customerId !== customerId
    ) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'IDEMPOTENCY_KEY_REUSED',
        'Esta Idempotency-Key já foi usada com outra solicitação.',
      );
    }

    return this.toPaymentResponse(payment);
  }

  private async releaseExpired(
    transaction: TransactionClient,
    reservationId: string,
    now: Date,
  ): Promise<void> {
    const reservation = await transaction.reservation.findUnique({
      where: { id: reservationId },
    });
    if (!reservation || reservation.inventoryReleasedAt) return;

    const released = await transaction.reservation.updateMany({
      where: {
        id: reservationId,
        status: 'PENDING_PAYMENT',
        expiresAt: { lte: now },
        inventoryReleasedAt: null,
      },
      data: { status: 'EXPIRED', inventoryReleasedAt: now },
    });
    if (released.count !== 1) return;

    await transaction.event.update({
      where: { id: reservation.eventId },
      data: { availableQuantity: { increment: reservation.quantity } },
    });
  }

  private toPaymentResponse(
    payment: PaymentWithReservation,
  ): SimulatedPaymentResponse {
    return {
      payment: {
        id: payment.id,
        status: payment.status,
        amountCents: payment.amountCents,
      },
      reservation: {
        id: payment.reservation.id,
        status:
          payment.status === 'APPROVED'
            ? ('PAID' as const)
            : ('DECLINED' as const),
      },
      tickets: payment.reservation.tickets.map((ticket) => ({
        id: ticket.id,
        sequence: ticket.sequence,
        status: ticket.status,
      })),
    };
  }

  private hashRequest(
    customerId: string,
    reservationId: string,
    simulationResult: PaymentSimulationResult,
  ): string {
    return createHash('sha256')
      .update(`${customerId}:${reservationId}:${simulationResult}`)
      .digest('hex');
  }

  private randomNonceHash(): string {
    return createHash('sha256').update(randomBytes(32)).digest('hex');
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private throwExpired(): never {
    throw new ApiException(
      HttpStatus.CONFLICT,
      'RESERVATION_EXPIRED',
      'A reserva expirou e o estoque foi devolvido.',
    );
  }
}
