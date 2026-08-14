import type { AuthUser, CustomerReservation } from '@event-platform/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';
import { ReservationParamsDto } from './dto/reservation-params.dto.js';
import { ReservationsService } from './reservations.service.js';

@Controller('reservations')
@ApiTags('Reservations')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CUSTOMER')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() input: CreateReservationDto,
  ): Promise<CustomerReservation> {
    return this.reservationsService.create(user.id, input);
  }

  @Get(':reservationId')
  details(
    @CurrentUser() user: AuthUser,
    @Param() params: ReservationParamsDto,
  ): Promise<CustomerReservation> {
    return this.reservationsService.get(user.id, params.reservationId);
  }

  @Post(':reservationId/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param() params: ReservationParamsDto,
  ): Promise<CustomerReservation> {
    return this.reservationsService.cancel(user.id, params.reservationId);
  }
}
