import type {
  AuthUser,
  LoginResponse,
  UserRole,
} from '@event-platform/contracts';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { ApiException } from '../common/errors/api.exception.js';
import { PrismaService } from '../database/prisma.service.js';
import { readJwtConfiguration } from './auth.config.js';
import type { JwtPayload } from './auth.types.js';
import type { LoginDto } from './dto/login.dto.js';

const publicUserSelection = {
  id: true,
  name: true,
  email: true,
  role: true,
} as const;

// Valid bcrypt hash used only to keep failed login timing similar for unknown e-mails.
const dummyPasswordHash =
  '$2b$12$6yrzdBgspazdUmFcU7Eg9Ox2TnTivF1cMnjZJRKUWnLEonc5uhtky';

@Injectable()
export class AuthService {
  private readonly expiresInSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    config: ConfigService,
  ) {
    this.expiresInSeconds = readJwtConfiguration(config).expiresInSeconds;
  }

  async login(credentials: LoginDto): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: credentials.email.trim().toLowerCase() },
      select: { ...publicUserSelection, passwordHash: true },
    });

    const passwordMatches = await compare(
      credentials.password,
      user?.passwordHash ?? dummyPasswordHash,
    );

    if (!user || !passwordMatches) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
        'E-mail ou senha inválidos.',
      );
    }

    const publicUser = this.toAuthUser(user);
    const payload: JwtPayload = { sub: user.id };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      expiresIn: this.expiresInSeconds,
      user: publicUser,
    };
  }

  async findAuthenticatedUser(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelection,
    });

    if (!user) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHENTICATED',
        'Autenticação necessária.',
      );
    }

    return this.toAuthUser(user);
  }

  private toAuthUser(user: {
    id: string;
    name: string;
    email: string;
    role: string;
  }): AuthUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as UserRole,
    };
  }
}
