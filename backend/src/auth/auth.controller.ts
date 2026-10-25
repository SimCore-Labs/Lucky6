import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { SessionGuard } from './session.guard.js';
import type { AuthenticatedRequest } from './session.guard.js';

const authNonceSchema = z.object({
  address: z.string().min(32).max(44),
});

const authVerifySchema = z.object({
  address: z.string().min(32).max(44),
  signature: z.string().min(1).max(256),
  signatureEncoding: z.enum(['base58', 'base64']).default('base64'),
  nonce: z.string().regex(/^[a-f0-9]{32}$/),
});

function isSolanaAddress(address: string): boolean {
  try {
    return bs58.decode(address).length === 32;
  } catch {
    return false;
  }
}

function challengeMessage(challenge: {
  address: string;
  domain: string;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
}): string {
  return [
    'Lucky6 wallet sign-in',
    `Domain: ${challenge.domain}`,
    `Wallet: ${challenge.address}`,
    `Nonce: ${challenge.nonce}`,
    `Issued At: ${challenge.issuedAt.toISOString()}`,
    `Expiration Time: ${challenge.expiresAt.toISOString()}`,
  ].join('\n');
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Post('nonce')
  async getNonce(
    @Req() request: FastifyRequest,
    @Body() body: unknown,
  ) {
    const parse = authNonceSchema.safeParse(body);
    if (!parse.success || !isSolanaAddress(parse.data.address)) {
      throw new BadRequestException('Invalid wallet address.');
    }

    const allowedOrigins = new Set(
      (this.config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    );
    const requestOrigin = request.headers.origin;
    if (
      typeof requestOrigin === 'string' &&
      !allowedOrigins.has(requestOrigin)
    ) {
      throw new ForbiddenException('Request origin is not allowed.');
    }

    const configuredDomain = this.config.get<string>('AUTH_DOMAIN');
    const domain =
      typeof requestOrigin === 'string'
        ? new URL(requestOrigin).host
        : configuredDomain ?? 'Lucky6';
    const address = parse.data.address;
    const nonce = randomBytes(16).toString('hex');
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 5 * 60 * 1000);

    const challenge = await this.prisma.authChallenge.create({
      data: {
        nonce,
        address,
        domain,
        purpose: 'Authentication',
        issuedAt,
        expiresAt,
      },
    });

    return {
      nonce,
      message: challengeMessage(challenge),
      expiresAt: expiresAt.toISOString(),
    };
  }

  @Post('verify')
  async verify(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const parse = authVerifySchema.safeParse(request.body);
    if (
      !parse.success ||
      !isSolanaAddress(parse.data.address)
    ) {
      throw new BadRequestException('Invalid authentication payload.');
    }

    const { address, nonce, signature, signatureEncoding } = parse.data;
    const challenge = await this.prisma.authChallenge.findUnique({
      where: { nonce },
    });
    const now = new Date();

    if (
      !challenge ||
      challenge.address !== address ||
      challenge.purpose !== 'Authentication' ||
      challenge.usedAt !== null ||
      challenge.expiresAt <= now
    ) {
      throw new UnauthorizedException(
        'Invalid or expired authentication challenge.',
      );
    }

    const allowedOrigins = new Set(
      (this.config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    );
    const requestOrigin = request.headers.origin;
    if (
      typeof requestOrigin === 'string' &&
      (!allowedOrigins.has(requestOrigin) ||
        new URL(requestOrigin).host !== challenge.domain)
    ) {
      throw new ForbiddenException('Request origin is not allowed.');
    }

    const publicKey = bs58.decode(address);
    let signatureBytes: Uint8Array;
    try {
      signatureBytes =
        signatureEncoding === 'base58'
          ? bs58.decode(signature)
          : Buffer.from(signature, 'base64');
    } catch {
      throw new UnauthorizedException('Invalid wallet signature.');
    }
    if (
      publicKey.length !== 32 ||
      signatureBytes.length !== 64 ||
      (signatureEncoding === 'base64' &&
        Buffer.from(signatureBytes).toString('base64') !== signature)
    ) {
      throw new UnauthorizedException('Invalid wallet signature.');
    }

    const validSignature = nacl.sign.detached.verify(
      new TextEncoder().encode(challengeMessage(challenge)),
      signatureBytes,
      publicKey,
    );
    if (!validSignature) {
      throw new UnauthorizedException('Invalid wallet ed25519 signature.');
    }

    const consumed = await this.prisma.authChallenge.updateMany({
      where: {
        nonce,
        address,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) {
      throw new UnauthorizedException(
        'Authentication challenge has already been used.',
      );
    }

    const wallet = await this.prisma.wallet.upsert({
      where: { address },
      update: {},
      create: {
        address,
        user: { create: {} },
      },
    });

    const sessionToken = randomBytes(32).toString('hex');
    const sessionTokenHash = createHash('sha256')
      .update(sessionToken)
      .digest('hex');
    const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.walletSession.create({
      data: {
        walletId: wallet.id,
        tokenHash: sessionTokenHash,
        expiresAt: sessionExpiresAt,
      },
    });

    const production = this.config.get<string>('NODE_ENV') === 'production';
    const cookieOptions = [
      `session=${sessionToken}`,
      'Path=/',
      'HttpOnly',
      production ? 'SameSite=None' : 'SameSite=Lax',
      `Max-Age=${24 * 60 * 60}`,
      ...(production ? ['Secure'] : []),
    ];
    reply.header('Set-Cookie', cookieOptions.join('; '));

    return {
      authenticated: true,
      address,
      walletId: wallet.id,
      balance: wallet.balance.toString(),
      expiresAt: sessionExpiresAt.toISOString(),
    };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  async getSession(@Req() request: AuthenticatedRequest) {
    return {
      authenticated: true,
      walletId: request.authenticatedWallet.id,
      address: request.authenticatedWallet.address,
      balance: request.authenticatedWallet.balance.toString(),
    };
  }

  @Post('logout')
  @UseGuards(SessionGuard)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.prisma.walletSession.deleteMany({
      where: { tokenHash: request.sessionTokenHash },
    });
    const secure = this.config.get<string>('NODE_ENV') === 'production';
    reply.header(
      'Set-Cookie',
      [
        'session=',
        'Path=/',
        'HttpOnly',
        secure ? 'SameSite=None' : 'SameSite=Lax',
        'Max-Age=0',
        ...(secure ? ['Secure'] : []),
      ].join('; '),
    );
    return { authenticated: false };
  }
}
