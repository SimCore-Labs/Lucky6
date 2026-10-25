import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { AuthController } from './auth.controller.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('AuthController', () => {
  it('only creates a session after verifying and atomically consuming a wallet challenge', async () => {
    const keypair = nacl.sign.keyPair();
    const address = bs58.encode(keypair.publicKey);
    const issuedAt = new Date(Date.now() - 1_000);
    const expiresAt = new Date(Date.now() + 60_000);
    let challenge = {
      address,
      domain: 'lucky6ix.vercel.app',
      nonce: '0123456789abcdef0123456789abcdef',
      issuedAt,
      expiresAt,
      purpose: 'Authentication',
      usedAt: null,
    };
    const createChallenge = vi.fn().mockImplementation(({ data }) => {
      challenge = { ...data, usedAt: null };
      return challenge;
    });
    const findChallenge = vi.fn().mockImplementation(({ where }) =>
      where.nonce === challenge.nonce ? challenge : null,
    );
    const consumeChallenge = vi.fn().mockResolvedValue({ count: 1 });
    const wallet = {
      id: 'wallet-id',
      address,
      balance: 0n,
    };
    const upsertWallet = vi.fn().mockResolvedValue(wallet);
    const createSession = vi.fn().mockResolvedValue({});
    const prisma = {
      authChallenge: {
        create: createChallenge,
        findUnique: findChallenge,
        updateMany: consumeChallenge,
      },
      wallet: { upsert: upsertWallet },
      walletSession: { create: createSession },
    } as unknown as PrismaService;
    const config = {
      get: (key: string) => {
        if (key === 'CORS_ORIGIN') return 'https://lucky6ix.vercel.app';
        if (key === 'NODE_ENV') return 'production';
        return undefined;
      },
    } as ConfigService;
    const controller = new AuthController(prisma, config);
    const request = {
      headers: { origin: 'https://lucky6ix.vercel.app' },
      body: undefined,
    };
    const nonce = await controller.getNonce(
      request as never,
      { address },
    );
    const signature = nacl.sign.detached(
      new TextEncoder().encode(nonce.message),
      keypair.secretKey,
    );
    request.body = {
      address,
      nonce: nonce.nonce,
      signature: Buffer.from(signature).toString('base64'),
      signatureEncoding: 'base64',
    };
    const reply = { header: vi.fn() };

    await expect(
      controller.verify(request as never, reply as never),
    ).resolves.toMatchObject({
      authenticated: true,
      address,
      walletId: 'wallet-id',
      balance: '0',
    });

    expect(createChallenge).toHaveBeenCalledOnce();
    expect(upsertWallet.mock.calls[0][0].create).not.toHaveProperty('balance');
    expect(consumeChallenge).toHaveBeenCalledWith({
      where: {
        nonce: nonce.nonce,
        address,
        usedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { usedAt: expect.any(Date) },
    });
    expect(createSession).toHaveBeenCalledOnce();
    expect(createSession.mock.calls[0][0].data.tokenHash).not.toContain(
      challenge.nonce,
    );
    expect(reply.header).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringMatching(/^session=[a-f0-9]{64};.*HttpOnly.*Secure/),
    );
  });

  it('rejects the former test signature bypass without consuming a nonce', async () => {
    const challenge = {
      address: '11111111111111111111111111111111',
      domain: 'Lucky6',
      nonce: '0123456789abcdef0123456789abcdef',
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      purpose: 'Authentication',
      usedAt: null,
    };
    const consumeChallenge = vi.fn();
    const prisma = {
      authChallenge: {
        findUnique: vi.fn().mockResolvedValue(challenge),
        updateMany: consumeChallenge,
      },
    } as unknown as PrismaService;
    const config = {
      get: () => undefined,
    } as unknown as ConfigService;
    const controller = new AuthController(prisma, config);

    await expect(
      controller.verify(
        {
          headers: {},
          body: {
            address: challenge.address,
            nonce: challenge.nonce,
            signature: 'TEST_SIGNATURE_bypass',
            signatureEncoding: 'base64',
          },
        } as never,
        { header: vi.fn() } as never,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(consumeChallenge).not.toHaveBeenCalled();
  });

  it('does not consume an invalid signature challenge', async () => {
    const keypair = nacl.sign.keyPair();
    const address = bs58.encode(keypair.publicKey);
    const challenge = {
      address,
      domain: 'Lucky6',
      nonce: '0123456789abcdef0123456789abcdef',
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      purpose: 'Authentication',
      usedAt: null,
    };
    const consumeChallenge = vi.fn();
    const prisma = {
      authChallenge: {
        findUnique: vi.fn().mockResolvedValue(challenge),
        updateMany: consumeChallenge,
      },
    } as unknown as PrismaService;
    const config = {
      get: () => undefined,
    } as unknown as ConfigService;
    const controller = new AuthController(prisma, config);

    await expect(
      controller.verify(
        {
          headers: {},
          body: {
            address,
            nonce: challenge.nonce,
            signature: Buffer.alloc(64).toString('base64'),
            signatureEncoding: 'base64',
          },
        } as never,
        { header: vi.fn() } as never,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(consumeChallenge).not.toHaveBeenCalled();
  });
});
