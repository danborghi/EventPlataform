import type { AuthUser } from '@event-platform/contracts';
import {
  HttpStatus,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiException } from '../../common/errors/api.exception.js';
import { AuthService } from '../auth.service.js';
import type { AuthenticatedRequest, JwtPayload } from '../auth.types.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);
    let payload: JwtPayload;

    if (!token) {
      throw this.unauthenticated();
    }

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw this.unauthenticated();
    }

    if (!payload.sub || typeof payload.sub !== 'string') {
      throw this.unauthenticated();
    }

    const user: AuthUser = await this.authService.findAuthenticatedUser(
      payload.sub,
    );
    request.user = user;

    return true;
  }

  private extractBearerToken(authorization?: string): string | undefined {
    const [scheme, token, extra] = authorization?.split(' ') ?? [];
    return scheme === 'Bearer' && token && !extra ? token : undefined;
  }

  private unauthenticated(): ApiException {
    return new ApiException(
      HttpStatus.UNAUTHORIZED,
      'UNAUTHENTICATED',
      'Autenticação necessária.',
    );
  }
}
