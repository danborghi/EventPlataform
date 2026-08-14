import type {
  AuthUser,
  CustomerTicket,
  CustomerTicketListResponse,
  TicketQrResponse,
  TicketShareLinkResponse,
} from '@event-platform/contracts';
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { TicketParamsDto } from './dto/ticket-params.dto.js';
import { TicketsQueryDto } from './dto/tickets-query.dto.js';
import { TicketsService } from './tickets.service.js';

@Controller('tickets')
@ApiTags('Tickets')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CUSTOMER')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get('me')
  listMine(
    @CurrentUser() user: AuthUser,
    @Query() query: TicketsQueryDto,
  ): Promise<CustomerTicketListResponse> {
    return this.ticketsService.listMine(user.id, query.page, query.status);
  }

  @Get(':ticketId')
  details(
    @CurrentUser() user: AuthUser,
    @Param() params: TicketParamsDto,
  ): Promise<CustomerTicket> {
    return this.ticketsService.getMine(user.id, params.ticketId);
  }

  @Get(':ticketId/qr')
  qr(
    @CurrentUser() user: AuthUser,
    @Param() params: TicketParamsDto,
  ): Promise<TicketQrResponse> {
    return this.ticketsService.getQr(user.id, params.ticketId);
  }

  @Post(':ticketId/share-links')
  share(
    @CurrentUser() user: AuthUser,
    @Param() params: TicketParamsDto,
  ): Promise<TicketShareLinkResponse> {
    return this.ticketsService.createShareLink(user.id, params.ticketId);
  }

  @Delete(':ticketId/share-link')
  @HttpCode(204)
  async revokeShare(
    @CurrentUser() user: AuthUser,
    @Param() params: TicketParamsDto,
  ): Promise<void> {
    await this.ticketsService.revokeShareLink(user.id, params.ticketId);
  }
}
