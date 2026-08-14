import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { EventsModule } from './events/events.module.js';
import { GateModule } from './gate/gate.module.js';
import { HealthModule } from './health/health.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { ReservationsModule } from './reservations/reservations.module.js';
import { TicketsModule } from './tickets/tickets.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: ['.env', 'apps/api/.env'],
      isGlobal: true,
    }),
    AuthModule,
    CatalogModule,
    EventsModule,
    GateModule,
    HealthModule,
    PaymentsModule,
    ReservationsModule,
    TicketsModule,
  ],
})
export class AppModule {}
