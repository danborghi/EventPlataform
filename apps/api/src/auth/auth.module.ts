import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '../database/prisma.module.js';
import { AuthController } from './auth.controller.js';
import { readJwtConfiguration } from './auth.config.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { IpRateLimitGuard } from './guards/ip-rate-limit.guard.js';
import { LoginRateLimitGuard } from './guards/login-rate-limit.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { readLoginRateLimitConfiguration } from './login-rate-limit.config.js';
import { OwnershipService } from './ownership.service.js';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const jwt = readJwtConfiguration(config);

        return {
          secret: jwt.secret,
          signOptions: { expiresIn: jwt.expiresInSeconds },
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const rateLimit = readLoginRateLimitConfiguration(config);

        return [
          {
            limit: rateLimit.limit,
            ttl: rateLimit.windowMs,
          },
        ];
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    IpRateLimitGuard,
    LoginRateLimitGuard,
    RolesGuard,
    OwnershipService,
  ],
  exports: [
    JwtModule,
    AuthService,
    JwtAuthGuard,
    IpRateLimitGuard,
    RolesGuard,
    OwnershipService,
  ],
})
export class AuthModule {}
