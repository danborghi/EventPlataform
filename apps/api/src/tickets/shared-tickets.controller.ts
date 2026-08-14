import type { SharedTicketResponse } from '@event-platform/contracts';
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IpRateLimitGuard } from '../auth/guards/ip-rate-limit.guard.js';
import { TicketsService } from './tickets.service.js';

@Controller('tickets/shared')
@ApiTags('Shared tickets')
export class SharedTicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get(':shareToken')
  @UseGuards(IpRateLimitGuard)
  details(
    @Param('shareToken') shareToken: string,
  ): Promise<SharedTicketResponse> {
    return this.ticketsService.getShared(shareToken);
  }
}
