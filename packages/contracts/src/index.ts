export const USER_ROLES = ['ORGANIZER', 'CUSTOMER', 'GATE'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELED'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const RESERVATION_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'DECLINED',
  'EXPIRED',
  'CANCELED',
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const TICKET_STATUSES = ['VALID', 'USED', 'CANCELED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const VALIDATION_RESULTS = [
  'VALID',
  'INVALID',
  'ALREADY_USED',
  'WRONG_EVENT',
] as const;
export type ValidationResult = (typeof VALIDATION_RESULTS)[number];

export interface LiveHealthResponse {
  status: 'ok';
}

export interface ReadyHealthResponse {
  status: 'ready';
  dependencies: {
    database: 'up';
  };
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
    requestId: string;
  };
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface CatalogMovieSummary {
  externalProvider: 'TMDB';
  externalId: string;
  title: string;
  originalTitle: string;
  overview: string;
  posterUrl: string | null;
  releaseDate: string | null;
}

export interface CatalogMovieDetail extends CatalogMovieSummary {
  runtimeMinutes: number | null;
  genres: string[];
}

export type CatalogMovieListResponse = PaginatedResponse<CatalogMovieSummary>;

export interface CreateOrganizerEventRequest {
  externalProvider: 'TMDB';
  externalId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  venueName: string;
  address: string;
  city: string;
  capacity: number;
  priceCents: number;
}

export interface UpdateOrganizerEventRequest {
  startsAt?: string;
  endsAt?: string;
  timezone?: string;
  venueName?: string;
  address?: string;
  city?: string;
  capacity?: number;
  priceCents?: number;
}

export interface OrganizerEvent {
  id: string;
  externalProvider: 'TMDB';
  externalId: string;
  sourceTitle: string;
  title: string;
  description: string;
  posterUrl: string | null;
  runtimeMinutes: number | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  venueName: string;
  address: string;
  city: string;
  priceCents: number;
  capacity: number;
  availableQuantity: number;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizerEventDetail extends OrganizerEvent {
  reservedQuantity: number;
  soldQuantity: number;
}

export type OrganizerEventListResponse = PaginatedResponse<OrganizerEvent>;

export interface PublicEvent {
  id: string;
  sourceTitle: string;
  title: string;
  description: string;
  posterUrl: string | null;
  runtimeMinutes: number | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  venueName: string;
  address: string;
  city: string;
  priceCents: number;
  availableQuantity: number;
  status: 'PUBLISHED';
}

export type PublicEventListResponse = PaginatedResponse<PublicEvent>;

export interface CreateReservationRequest {
  eventId: string;
  quantity: number;
}

export interface ReservationEventSummary {
  id: string;
  title: string;
  posterUrl: string | null;
  startsAt: string;
  timezone: string;
  venueName: string;
  city: string;
}

export interface ReservationTicketSummary {
  id: string;
  sequence: number;
  status: TicketStatus;
}

export interface CustomerReservation {
  id: string;
  event: ReservationEventSummary;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  status: ReservationStatus;
  expiresAt: string;
  tickets: ReservationTicketSummary[];
}

export type PaymentSimulationResult = 'APPROVED' | 'DECLINED';

export interface SimulatePaymentRequest {
  simulationResult: PaymentSimulationResult;
}

export interface SimulatedPaymentResponse {
  payment: {
    id: string;
    status: PaymentSimulationResult;
    amountCents: number;
  };
  reservation: {
    id: string;
    status: Extract<ReservationStatus, 'PAID' | 'DECLINED'>;
  };
  tickets: ReservationTicketSummary[];
}

export interface TicketEventSummary {
  id: string;
  title: string;
  posterUrl: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  venueName: string;
  address: string;
  city: string;
}

export interface CustomerTicket {
  id: string;
  sequence: number;
  status: TicketStatus;
  usedAt: string | null;
  event: TicketEventSummary;
  hasActiveShareLink: boolean;
}

export type CustomerTicketListResponse = PaginatedResponse<CustomerTicket>;

export interface TicketQrResponse {
  code: string;
  expiresAt: string;
}

export interface TicketShareLinkResponse {
  url: string;
  expiresAt: string;
}

export interface SharedTicketResponse {
  ticket: {
    sequence: number;
    status: TicketStatus;
  };
  event: TicketEventSummary;
  qr: TicketQrResponse | null;
}

export interface GateEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  venueName: string;
  city: string;
}

export interface GateEventListResponse {
  data: GateEvent[];
}

export interface ValidateTicketRequest {
  code: string;
}

export type GateValidationResponse =
  | {
      result: 'VALID';
      validatedAt: string;
      ticket: { id: string; sequence: number };
      event: GateEvent;
    }
  | {
      result: 'ALREADY_USED';
      usedAt: string;
      event: GateEvent;
    }
  | { result: 'INVALID' }
  | { result: 'WRONG_EVENT' };
