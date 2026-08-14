import type {
  AuthUser,
  OrganizerEvent,
  OrganizerEventDetail,
  OrganizerEventListResponse,
} from '@event-platform/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { CreateOrganizerEventDto } from './dto/create-organizer-event.dto.js';
import { EventParamsDto } from './dto/event-params.dto.js';
import { OrganizerEventsQueryDto } from './dto/organizer-events-query.dto.js';
import { UpdateOrganizerEventDto } from './dto/update-organizer-event.dto.js';
import { EventsService } from './events.service.js';

@Controller('organizer/events')
@ApiTags('Organizer events')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ORGANIZER')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: OrganizerEventsQueryDto,
  ): Promise<OrganizerEventListResponse> {
    return this.eventsService.listOrganizerEvents(
      user.id,
      query.status,
      query.page,
    );
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() input: CreateOrganizerEventDto,
  ): Promise<OrganizerEvent> {
    return this.eventsService.createDraft(user.id, input);
  }

  @Get(':eventId')
  details(
    @CurrentUser() user: AuthUser,
    @Param() params: EventParamsDto,
  ): Promise<OrganizerEventDetail> {
    return this.eventsService.getOrganizerEvent(user.id, params.eventId);
  }

  @Patch(':eventId')
  update(
    @CurrentUser() user: AuthUser,
    @Param() params: EventParamsDto,
    @Body() input: UpdateOrganizerEventDto,
  ): Promise<OrganizerEvent> {
    return this.eventsService.updateDraft(user.id, params.eventId, input);
  }

  @Post(':eventId/publish')
  @HttpCode(200)
  publish(
    @CurrentUser() user: AuthUser,
    @Param() params: EventParamsDto,
  ): Promise<OrganizerEvent> {
    return this.eventsService.publish(user.id, params.eventId);
  }
}
