import type { AuthUser } from '@event-platform/contracts';
import { type ExecutionContext, HttpStatus } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { ApiException } from '../../common/errors/api.exception.js';
import { RolesGuard } from './roles.guard.js';

function createContext(user?: AuthUser): ExecutionContext {
  return {
    getHandler: () => createContext,
    getClass: () => RolesGuard,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows the required role', () => {
    const reflector = {
      getAllAndOverride: () => ['ORGANIZER'],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const user: AuthUser = {
      id: 'user-id',
      name: 'Organizer',
      email: 'organizer@example.com',
      role: 'ORGANIZER',
    };

    expect(guard.canActivate(createContext(user))).toBe(true);
  });

  it('returns FORBIDDEN for a different role', () => {
    const reflector = {
      getAllAndOverride: () => ['ORGANIZER'],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const user: AuthUser = {
      id: 'user-id',
      name: 'Customer',
      email: 'customer@example.com',
      role: 'CUSTOMER',
    };

    try {
      guard.canActivate(createContext(user));
      throw new Error('Expected RolesGuard to reject the request.');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiException);
      expect(error).toMatchObject({
        code: 'FORBIDDEN',
        status: HttpStatus.FORBIDDEN,
      });
    }
  });

  it('allows routes without role metadata', () => {
    const reflector = {
      getAllAndOverride: () => undefined,
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(createContext())).toBe(true);
  });
});
