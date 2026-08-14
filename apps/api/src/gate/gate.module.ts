import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import { GateController } from './gate.controller.js';
import { GateService } from './gate.service.js';

@Module({
  imports: [AuthModule, TicketsModule],
  controllers: [GateController],
  providers: [GateService],
})
export class GateModule {}
