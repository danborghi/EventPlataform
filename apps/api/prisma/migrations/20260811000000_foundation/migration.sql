-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ORGANIZER', 'CUSTOMER', 'GATE');

-- CreateEnum
CREATE TYPE "ExternalProvider" AS ENUM ('TMDB');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'DECLINED', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('VALID', 'USED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ValidationResult" AS ENUM ('VALID', 'INVALID', 'ALREADY_USED', 'WRONG_EVENT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "organizer_id" UUID NOT NULL,
    "external_provider" "ExternalProvider" NOT NULL,
    "external_id" VARCHAR(100) NOT NULL,
    "source_title" VARCHAR(200) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "poster_url" TEXT,
    "runtime_minutes" INTEGER,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "venue_name" VARCHAR(160) NOT NULL,
    "address" VARCHAR(255) NOT NULL,
    "city" VARCHAR(120) NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "available_quantity" INTEGER NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "total_price_cents" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "inventory_released_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'VALID',
    "qr_nonce_hash" CHAR(64) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "validated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_links" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_validations" (
    "id" UUID NOT NULL,
    "ticket_id" UUID,
    "event_id" UUID NOT NULL,
    "gate_user_id" UUID NOT NULL,
    "token_fingerprint" CHAR(16) NOT NULL,
    "result" "ValidationResult" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_validations_pkey" PRIMARY KEY ("id")
);

-- Domain invariants that must remain true independently of application code
ALTER TABLE "events"
    ADD CONSTRAINT "events_schedule_check" CHECK ("ends_at" > "starts_at"),
    ADD CONSTRAINT "events_price_check" CHECK ("price_cents" >= 100),
    ADD CONSTRAINT "events_capacity_check" CHECK ("capacity" > 0),
    ADD CONSTRAINT "events_availability_check" CHECK (
        "available_quantity" >= 0 AND "available_quantity" <= "capacity"
    ),
    ADD CONSTRAINT "events_runtime_check" CHECK (
        "runtime_minutes" IS NULL OR "runtime_minutes" > 0
    );

ALTER TABLE "reservations"
    ADD CONSTRAINT "reservations_quantity_check" CHECK ("quantity" BETWEEN 1 AND 6),
    ADD CONSTRAINT "reservations_price_check" CHECK ("unit_price_cents" >= 100),
    ADD CONSTRAINT "reservations_total_check" CHECK (
        "total_price_cents" = "unit_price_cents" * "quantity"
    ),
    ADD CONSTRAINT "reservations_expiration_check" CHECK ("expires_at" > "created_at");

ALTER TABLE "payments"
    ADD CONSTRAINT "payments_amount_check" CHECK ("amount_cents" >= 100);

ALTER TABLE "tickets"
    ADD CONSTRAINT "tickets_sequence_check" CHECK ("sequence" > 0),
    ADD CONSTRAINT "tickets_usage_check" CHECK (
        (
            "status" = 'USED'
            AND "used_at" IS NOT NULL
            AND "validated_by_id" IS NOT NULL
        )
        OR
        (
            "status" <> 'USED'
            AND "used_at" IS NULL
            AND "validated_by_id" IS NULL
        )
    );

ALTER TABLE "share_links"
    ADD CONSTRAINT "share_links_expiration_check" CHECK ("expires_at" > "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- Protect normalized e-mail uniqueness even if a future caller misses normalization
CREATE UNIQUE INDEX "users_email_normalized_key" ON "users"(LOWER("email"));

-- CreateIndex
CREATE INDEX "events_status_starts_at_idx" ON "events"("status", "starts_at");

-- CreateIndex
CREATE INDEX "events_organizer_id_created_at_idx" ON "events"("organizer_id", "created_at");

-- CreateIndex
CREATE INDEX "reservations_customer_id_created_at_idx" ON "reservations"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "reservations_event_id_status_idx" ON "reservations"("event_id", "status");

-- CreateIndex
CREATE INDEX "reservations_status_expires_at_idx" ON "reservations"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reservation_id_key" ON "payments"("reservation_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "tickets_customer_id_status_idx" ON "tickets"("customer_id", "status");

-- CreateIndex
CREATE INDEX "tickets_event_id_status_idx" ON "tickets"("event_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_reservation_id_sequence_key" ON "tickets"("reservation_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "share_links_token_hash_key" ON "share_links"("token_hash");

-- CreateIndex
CREATE INDEX "share_links_ticket_id_revoked_at_idx" ON "share_links"("ticket_id", "revoked_at");

-- CreateIndex
CREATE INDEX "ticket_validations_event_id_created_at_idx" ON "ticket_validations"("event_id", "created_at");

-- CreateIndex
CREATE INDEX "ticket_validations_ticket_id_created_at_idx" ON "ticket_validations"("ticket_id", "created_at");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_validated_by_id_fkey" FOREIGN KEY ("validated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_validations" ADD CONSTRAINT "ticket_validations_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_validations" ADD CONSTRAINT "ticket_validations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_validations" ADD CONSTRAINT "ticket_validations_gate_user_id_fkey" FOREIGN KEY ("gate_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
