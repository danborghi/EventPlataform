import type {
  AuthUser,
  GateEventListResponse,
  GateValidationResponse,
} from '@event-platform/contracts';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { IpRateLimitGuard } from '../auth/guards/ip-rate-limit.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { GateEventParamsDto } from './dto/gate-event-params.dto.js';
import { GateEventsQueryDto } from './dto/gate-events-query.dto.js';
import { ValidateTicketDto } from './dto/validate-ticket.dto.js';
import { GateService } from './gate.service.js';

@Controller('gate')
@ApiTags('Gate')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('GATE')
export class GateController {
  constructor(private readonly gateService: GateService) {}

  @Get('events')
  listEvents(
    @Query() query: GateEventsQueryDto,
  ): Promise<GateEventListResponse> {
    return this.gateService.listEvents(query.q);
  }

  @Post('events/:eventId/validate')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @UseGuards(IpRateLimitGuard)
  validate(
    @CurrentUser() user: AuthUser,
    @Param() params: GateEventParamsDto,
    @Body() input: ValidateTicketDto,
  ): Promise<GateValidationResponse> {
    return this.gateService.validate(user.id, params.eventId, input.code);
  }
}
