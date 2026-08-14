import type {
  EventStatus,
  OrganizerEvent,
  OrganizerEventDetail,
  OrganizerEventListResponse,
  PublicEvent,
  PublicEventListResponse,
} from '@event-platform/contracts';
import { HttpStatus, Injectable } from '@nestjs/common';
import { OwnershipService } from '../auth/ownership.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { ApiException } from '../common/errors/api.exception.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Event, Prisma } from '../generated/prisma/client.js';
import type { CreateOrganizerEventDto } from './dto/create-organizer-event.dto.js';
import type { UpdateOrganizerEventDto } from './dto/update-organizer-event.dto.js';

const ORGANIZER_EVENT_PAGE_SIZE = 20;

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly ownership: OwnershipService,
  ) {}

  async listPublicEvents(
    query: string | undefined,
    page: number,
    pageSize: number,
  ): Promise<PublicEventListResponse> {
    const where: Prisma.EventWhereInput = {
      status: 'PUBLISHED',
      startsAt: { gt: new Date() },
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: 'insensitive' } },
              { venueName: { contains: query, mode: 'insensitive' } },
              { city: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, events] = await Promise.all([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        orderBy: { startsAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: events.map((event) => this.toPublicEvent(event)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getPublicEvent(eventId: string): Promise<PublicEvent> {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        status: 'PUBLISHED',
        startsAt: { gt: new Date() },
      },
    });

    if (!event) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'EVENT_NOT_FOUND',
        'Evento não encontrado.',
      );
    }

    return this.toPublicEvent(event);
  }

  async listOrganizerEvents(
    organizerId: string,
    status: EventStatus | undefined,
    page: number,
  ): Promise<OrganizerEventListResponse> {
    const where = { organizerId, ...(status ? { status } : {}) };
    const [total, events] = await Promise.all([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * ORGANIZER_EVENT_PAGE_SIZE,
        take: ORGANIZER_EVENT_PAGE_SIZE,
      }),
    ]);

    return {
      data: events.map((event) => this.toOrganizerEvent(event)),
      meta: {
        page,
        pageSize: ORGANIZER_EVENT_PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / ORGANIZER_EVENT_PAGE_SIZE),
      },
    };
  }

  async createDraft(
    organizerId: string,
    input: CreateOrganizerEventDto,
  ): Promise<OrganizerEvent> {
    this.assertSchedule(input.startsAt, input.endsAt, input.timezone);
    const movie = await this.catalog.movieDetails(input.externalId);
    const event = await this.prisma.event.create({
      data: {
        organizerId,
        externalProvider: 'TMDB',
        externalId: movie.externalId,
        sourceTitle: movie.originalTitle,
        title: input.title,
        description: movie.overview,
        posterUrl: movie.posterUrl,
        runtimeMinutes: movie.runtimeMinutes,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        timezone: input.timezone,
        venueName: input.venueName,
        address: input.address,
        city: input.city,
        priceCents: input.priceCents,
        capacity: input.capacity,
        availableQuantity: input.capacity,
        status: 'DRAFT',
      },
    });

    return this.toOrganizerEvent(event);
  }

  async getOrganizerEvent(
    organizerId: string,
    eventId: string,
  ): Promise<OrganizerEventDetail> {
    const event = await this.findOwnedEvent(organizerId, eventId);
    const now = new Date();
    const [reserved, sold] = await Promise.all([
      this.prisma.reservation.aggregate({
        where: {
          eventId,
          status: 'PENDING_PAYMENT',
          expiresAt: { gt: now },
        },
        _sum: { quantity: true },
      }),
      this.prisma.reservation.aggregate({
        where: { eventId, status: 'PAID' },
        _sum: { quantity: true },
      }),
    ]);

    return {
      ...this.toOrganizerEvent(event),
      reservedQuantity: reserved._sum.quantity ?? 0,
      soldQuantity: sold._sum.quantity ?? 0,
    };
  }

  async updateDraft(
    organizerId: string,
    eventId: string,
    input: UpdateOrganizerEventDto,
  ): Promise<OrganizerEvent> {
    const current = await this.findOwnedEvent(organizerId, eventId);

    if (current.status !== 'DRAFT') {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'EVENT_NOT_EDITABLE',
        'Somente eventos em rascunho podem ser editados.',
      );
    }

    const startsAt = input.startsAt ?? current.startsAt.toISOString();
    const endsAt = input.endsAt ?? current.endsAt.toISOString();
    const timezone = input.timezone ?? current.timezone;
    this.assertSchedule(startsAt, endsAt, timezone);

    const result = await this.prisma.event.updateMany({
      where: { id: eventId, organizerId, status: 'DRAFT' },
      data: {
        ...(input.startsAt ? { startsAt: new Date(input.startsAt) } : {}),
        ...(input.endsAt ? { endsAt: new Date(input.endsAt) } : {}),
        ...(input.timezone ? { timezone: input.timezone } : {}),
        ...(input.venueName ? { venueName: input.venueName } : {}),
        ...(input.address ? { address: input.address } : {}),
        ...(input.city ? { city: input.city } : {}),
        ...(input.priceCents !== undefined
          ? { priceCents: input.priceCents }
          : {}),
        ...(input.capacity !== undefined
          ? {
              capacity: input.capacity,
              availableQuantity: input.capacity,
            }
          : {}),
      },
    });

    if (result.count !== 1) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'EVENT_NOT_EDITABLE',
        'Somente eventos em rascunho podem ser editados.',
      );
    }

    const event = await this.findOwnedEvent(organizerId, eventId);

    return this.toOrganizerEvent(event);
  }

  async publish(organizerId: string, eventId: string): Promise<OrganizerEvent> {
    const current = await this.findOwnedEvent(organizerId, eventId);

    if (current.status === 'PUBLISHED') {
      return this.toOrganizerEvent(current);
    }

    if (current.status !== 'DRAFT') {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'EVENT_NOT_PUBLISHABLE',
        'O evento não pode ser publicado no estado atual.',
      );
    }

    this.assertPublishable(current);
    const result = await this.prisma.event.updateMany({
      where: { id: eventId, organizerId, status: 'DRAFT' },
      data: { status: 'PUBLISHED' },
    });

    const event = await this.findOwnedEvent(organizerId, eventId);

    if (result.count === 0 && event.status !== 'PUBLISHED') {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'EVENT_NOT_PUBLISHABLE',
        'O evento não pode ser publicado no estado atual.',
      );
    }

    return this.toOrganizerEvent(event);
  }

  private async findOwnedEvent(
    organizerId: string,
    eventId: string,
  ): Promise<Event> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'EVENT_NOT_FOUND',
        'Evento não encontrado.',
      );
    }

    this.ownership.assertOwner(event.organizerId, organizerId);
    return event;
  }

  private assertSchedule(
    startsAtValue: string,
    endsAtValue: string,
    timezone: string,
  ): void {
    const startsAt = new Date(startsAtValue);
    const endsAt = new Date(endsAtValue);

    if (
      !this.isValidTimezone(timezone) ||
      !Number.isFinite(startsAt.getTime()) ||
      !Number.isFinite(endsAt.getTime()) ||
      startsAt.getTime() <= Date.now() ||
      endsAt.getTime() <= startsAt.getTime()
    ) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_EVENT_SCHEDULE',
        'Revise as datas e o fuso do evento.',
      );
    }
  }

  private assertPublishable(event: Event): void {
    if (
      !event.title.trim() ||
      !event.sourceTitle.trim() ||
      !event.venueName.trim() ||
      !event.address.trim() ||
      !event.city.trim() ||
      event.capacity < 1 ||
      event.priceCents < 100
    ) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'EVENT_NOT_PUBLISHABLE',
        'Preencha todos os campos obrigatórios antes de publicar.',
      );
    }

    this.assertSchedule(
      event.startsAt.toISOString(),
      event.endsAt.toISOString(),
      event.timezone,
    );
  }

  private isValidTimezone(timezone: string): boolean {
    try {
      new Intl.DateTimeFormat('pt-BR', { timeZone: timezone }).format();
      return true;
    } catch {
      return false;
    }
  }

  private toOrganizerEvent(event: Event): OrganizerEvent {
    return {
      id: event.id,
      externalProvider: event.externalProvider,
      externalId: event.externalId,
      sourceTitle: event.sourceTitle,
      title: event.title,
      description: event.description,
      posterUrl: event.posterUrl,
      runtimeMinutes: event.runtimeMinutes,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      timezone: event.timezone,
      venueName: event.venueName,
      address: event.address,
      city: event.city,
      priceCents: event.priceCents,
      capacity: event.capacity,
      availableQuantity: event.availableQuantity,
      status: event.status,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    };
  }

  private toPublicEvent(event: Event): PublicEvent {
    return {
      id: event.id,
      sourceTitle: event.sourceTitle,
      title: event.title,
      description: event.description,
      posterUrl: event.posterUrl,
      runtimeMinutes: event.runtimeMinutes,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      timezone: event.timezone,
      venueName: event.venueName,
      address: event.address,
      city: event.city,
      priceCents: event.priceCents,
      availableQuantity: event.availableQuantity,
      status: 'PUBLISHED',
    };
  }
}
