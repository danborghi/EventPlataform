import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class LoginRateLimitGuard extends ThrottlerGuard {
  protected getTracker(request: Record<string, unknown>): Promise<string> {
    const ip = typeof request.ip === 'string' ? request.ip : 'unknown';
    const body = request.body;
    const email =
      typeof body === 'object' &&
      body !== null &&
      'email' in body &&
      typeof body.email === 'string'
        ? body.email.trim().toLowerCase()
        : 'unknown';

    return Promise.resolve(`${ip}:${email}`);
  }
}
