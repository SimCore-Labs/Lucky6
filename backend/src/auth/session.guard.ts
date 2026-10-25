import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AuthenticatedRequest extends FastifyRequest {
  authenticatedWallet: {
    id: string;
    address: string;
    balance: bigint;
    userId: string;
  };
  sessionTokenHash: string;
}

function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of header?.split(';') ?? []) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) cookies.set(name, value);
  }
  return cookies;
}

@Injectable()
export class SessionGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.allowedOrigins = new Set(
      (config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      const origin = request.headers.origin;
      if (typeof origin !== 'string' || !this.allowedOrigins.has(origin)) {
        throw new ForbiddenException('Request origin is not allowed.');
      }
    }

    const token = parseCookies(request.headers.cookie).get('session');
    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
      throw new UnauthorizedException('Wallet authentication is required.');
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const session = await this.prisma.walletSession.findUnique({
      where: { tokenHash },
      include: { wallet: true },
    });

    if (!session) {
      throw new UnauthorizedException('Wallet session is invalid or expired.');
    }

    if (session.expiresAt <= new Date()) {
      await this.prisma.walletSession.delete({ where: { id: session.id } });
      throw new UnauthorizedException('Wallet session is invalid or expired.');
    }

    request.authenticatedWallet = session.wallet;
    request.sessionTokenHash = tokenHash;
    return true;
  }
}
