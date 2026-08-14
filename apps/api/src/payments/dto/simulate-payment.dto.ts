import type {
  PaymentSimulationResult,
  SimulatePaymentRequest,
} from '@event-platform/contracts';
import { IsIn } from 'class-validator';

export class SimulatePaymentDto implements SimulatePaymentRequest {
  @IsIn(['APPROVED', 'DECLINED'], {
    message: 'O resultado deve ser APPROVED ou DECLINED.',
  })
  simulationResult!: PaymentSimulationResult;
}
