import type {
  AuthUser,
  SimulatedPaymentResponse,
} from '@event-platform/contracts';
import {
  Body,
  Controller,
  Headers,
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
import { ReservationParamsDto } from '../reservations/dto/reservation-params.dto.js';
import { SimulatePaymentDto } from './dto/simulate-payment.dto.js';
import { PaymentsService } from './payments.service.js';

@Controller('reservations')
@ApiTags('Payments')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CUSTOMER')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(':reservationId/payment')
  @HttpCode(200)
  simulate(
    @CurrentUser() user: AuthUser,
    @Param() params: ReservationParamsDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: SimulatePaymentDto,
  ): Promise<SimulatedPaymentResponse> {
    return this.paymentsService.simulate(
      user.id,
      params.reservationId,
      idempotencyKey,
      input.simulationResult,
    );
  }
}
