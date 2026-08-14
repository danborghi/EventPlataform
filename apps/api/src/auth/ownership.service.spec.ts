import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception.js';
import { OwnershipService } from './ownership.service.js';

describe('OwnershipService', () => {
  const service = new OwnershipService();

  it('allows the resource owner', () => {
    expect(() => service.assertOwner('user-id', 'user-id')).not.toThrow();
  });

  it('returns FORBIDDEN for another user', () => {
    try {
      service.assertOwner('owner-id', 'another-user-id');
      throw new Error('Expected ownership validation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiException);
      expect(error).toMatchObject({
        code: 'FORBIDDEN',
        status: HttpStatus.FORBIDDEN,
      });
    }
  });
});
