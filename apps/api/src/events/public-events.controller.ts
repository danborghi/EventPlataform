import type {
  PublicEvent,
  PublicEventListResponse,
} from '@event-platform/contracts';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EventParamsDto } from './dto/event-params.dto.js';
import { PublicEventsQueryDto } from './dto/public-events-query.dto.js';
import { EventsService } from './events.service.js';

@Controller('events')
@ApiTags('Public events')
export class PublicEventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  list(@Query() query: PublicEventsQueryDto): Promise<PublicEventListResponse> {
    return this.eventsService.listPublicEvents(
      query.q,
      query.page,
      query.pageSize,
    );
  }

  @Get(':eventId')
  details(@Param() params: EventParamsDto): Promise<PublicEvent> {
    return this.eventsService.getPublicEvent(params.eventId);
  }
}
