import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class IpRateLimitGuard extends ThrottlerGuard {
  protected getTracker(request: Record<string, unknown>): Promise<string> {
    return Promise.resolve(
      typeof request.ip === 'string' ? request.ip : 'unknown',
    );
  }
}
