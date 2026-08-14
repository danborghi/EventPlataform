import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception.js';

@Injectable()
export class OwnershipService {
  assertOwner(resourceOwnerId: string, authenticatedUserId: string): void {
    if (resourceOwnerId !== authenticatedUserId) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Você não tem permissão para acessar este recurso.',
      );
    }
  }
}
