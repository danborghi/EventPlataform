import type { AuthUser } from '@event-platform/contracts';
import type { Request } from 'express';

export interface JwtPayload {
  sub: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}
