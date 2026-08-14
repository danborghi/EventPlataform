import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';
import { PublicEventsController } from './public-events.controller.js';

@Module({
  imports: [AuthModule, CatalogModule],
  controllers: [EventsController, PublicEventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
