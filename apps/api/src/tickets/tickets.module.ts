import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SharedTicketsController } from './shared-tickets.controller.js';
import { TicketTokenService } from './ticket-token.service.js';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SharedTicketsController, TicketsController],
  providers: [TicketTokenService, TicketsService],
  exports: [TicketTokenService],
})
export class TicketsModule {}
