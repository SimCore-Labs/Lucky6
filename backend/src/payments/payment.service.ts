import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import bs58 from 'bs58';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const MIN_CREDIT_PURCHASE = 100;
const MAX_CREDIT_PURCHASE = 100_000;
const PAYMENT_ORDER_LIFETIME_MS = 15 * 60 * 1000;
const CREDIT_USD_CENTS = 1n;
const LAMPORTS_PER_SOL = 1_000_000_000n;

function asLamports(credits: number, solPriceUsd: number): bigint {
  if (!Number.isFinite(solPriceUsd) || solPriceUsd <= 0) {
    throw new ServiceUnavailableException('A valid SOL price is unavailable.');
  }
  const priceParts = solPriceUsd.toFixed(6).split('.');
  const priceMicros =
    BigInt(priceParts[0]) * 1_000_000n +
    BigInt((priceParts[1] ?? '').padEnd(6, '0'));
  const numerator = BigInt(credits) * CREDIT_USD_CENTS * 10_000_000_000_000n;
  return (numerator + priceMicros - 1n) / priceMicros;
}

function formatSol(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const fraction = (lamports % LAMPORTS_PER_SOL)
    .toString()
    .padStart(9, '0');
  return `${whole.toString()}.${fraction}`;
}

function validSolanaAddress(address: string): boolean {
  try {
    return bs58.decode(address).length === 32;
  } catch {
    return false;
  }
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private cachedPrice: { usd: number; observedAt: number } | null = null;
  private pendingPriceRequest: Promise<{ usd: number; observedAt: number }> | null =
    null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async getSolPrice(): Promise<{ usd: number; observedAt: number }> {
    const now = Date.now();
    if (
      this.cachedPrice &&
      now - this.cachedPrice.observedAt <= 30_000
    ) {
      return this.cachedPrice;
    }
    if (this.pendingPriceRequest) return this.pendingPriceRequest;

    this.pendingPriceRequest = (async () => {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_last_updated_at=true',
        { signal: AbortSignal.timeout(8_000) },
      );
      if (!response.ok) {
        throw new ServiceUnavailableException(
          `SOL price provider returned HTTP ${response.status}.`,
        );
      }
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== 'object' ||
        !('solana' in result) ||
        !result.solana ||
        typeof result.solana !== 'object' ||
        !('usd' in result.solana) ||
        !('last_updated_at' in result.solana)
      ) {
        throw new ServiceUnavailableException(
          'SOL price provider returned an invalid quote.',
        );
      }

      const usd = result.solana.usd;
      const updatedAt = result.solana.last_updated_at;
      if (
        typeof usd !== 'number' ||
        !Number.isFinite(usd) ||
        usd <= 0 ||
        typeof updatedAt !== 'number'
      ) {
        throw new ServiceUnavailableException(
          'SOL price provider returned an invalid quote.',
        );
      }
      const observedAt = updatedAt * 1000;
      if (Date.now() - observedAt > 180_000 || observedAt > Date.now() + 30_000) {
        throw new ServiceUnavailableException('SOL price quote is stale.');
      }
      this.cachedPrice = { usd, observedAt };
      return this.cachedPrice;
    })();

    try {
      const quote = await this.pendingPriceRequest;
      this.logger.debug(`Refreshed SOL/USD quote at ${quote.observedAt}.`);
      return quote;
    } finally {
      this.pendingPriceRequest = null;
    }
  }

  private validateCredits(value: unknown): number {
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < MIN_CREDIT_PURCHASE ||
      value > MAX_CREDIT_PURCHASE
    ) {
      throw new BadRequestException(
        `Credit amount must be an integer between ${MIN_CREDIT_PURCHASE} and ${MAX_CREDIT_PURCHASE}.`,
      );
    }
    return value;
  }

  private async buildQuote(creditsValue: unknown) {
    const credits = this.validateCredits(creditsValue);
    const price = await this.getSolPrice();
    const expectedLamports = asLamports(credits, price.usd);
    return {
      credits: credits.toString(),
      creditPriceUsd: '0.01',
      solPriceUsd: price.usd,
      priceObservedAt: new Date(price.observedAt).toISOString(),
      expectedLamports: expectedLamports.toString(),
      expectedSol: formatSol(expectedLamports),
      expiresInSeconds: PAYMENT_ORDER_LIFETIME_MS / 1000,
    };
  }

  async quote(creditsValue: unknown) {
    return this.buildQuote(creditsValue);
  }

  async createOrder(
    wallet: { id: string },
    creditsValue: unknown,
    idempotencyKey: string,
  ) {
    const quote = await this.buildQuote(creditsValue);
    const treasuryAddress =
      this.config.get<string>('TREASURY_WALLET_ADDRESS') ?? '';
    if (!validSolanaAddress(treasuryAddress)) {
      throw new ServiceUnavailableException(
        'SOL payment destination is not configured correctly.',
      );
    }
    const credits = BigInt(quote.credits);
    const existing = await this.prisma.paymentOrder.findUnique({
      where: {
        walletId_idempotencyKey: {
          walletId: wallet.id,
          idempotencyKey,
        },
      },
    });
    if (existing) {
      if (existing.creditsToIssue !== credits) {
        throw new ConflictException(
          'This idempotency key was already used for a different credit amount.',
        );
      }
      return this.serializeOrder(existing, treasuryAddress);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + PAYMENT_ORDER_LIFETIME_MS);
    try {
      const order = await this.prisma.paymentOrder.create({
        data: {
          reference: bs58.encode(randomBytes(32)),
          walletId: wallet.id,
          idempotencyKey,
          expectedLamports: BigInt(quote.expectedLamports),
          creditsToIssue: credits,
          status: 'PENDING',
          createdAt: now,
          expiresAt,
        },
      });
      return {
        ...this.serializeOrder(order, treasuryAddress),
        solPriceUsd: quote.solPriceUsd,
        priceObservedAt: quote.priceObservedAt,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const racedOrder = await this.prisma.paymentOrder.findUnique({
          where: {
            walletId_idempotencyKey: {
              walletId: wallet.id,
              idempotencyKey,
            },
          },
        });
        if (racedOrder && racedOrder.creditsToIssue === credits) {
          return this.serializeOrder(racedOrder, treasuryAddress);
        }
      }
      throw error;
    }
  }

  private serializeOrder(
    order: {
      id: string;
      reference: string;
      expectedLamports: bigint;
      creditsToIssue: bigint;
      status: string;
      createdAt: Date;
      expiresAt: Date;
    },
    treasuryAddress: string,
  ) {
    return {
      id: order.id,
      reference: order.reference,
      treasuryAddress,
      expectedLamports: order.expectedLamports.toString(),
      expectedSol: formatSol(order.expectedLamports),
      credits: order.creditsToIssue.toString(),
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      expiresAt: order.expiresAt.toISOString(),
    };
  }

  async submitSignature(
    walletId: string,
    orderId: string,
    signature: string,
  ) {
    let decodedSignature: Uint8Array;
    try {
      decodedSignature = bs58.decode(signature);
    } catch {
      throw new BadRequestException('Invalid Solana transaction signature.');
    }
    if (decodedSignature.length !== 64) {
      throw new BadRequestException('Invalid Solana transaction signature.');
    }
    const order = await this.prisma.paymentOrder.findFirst({
      where: { id: orderId, walletId },
    });
    if (!order) throw new NotFoundException('Payment order not found.');
    if (order.status === 'CREDITED') {
      return { id: order.id, status: order.status };
    }
    if (order.status === 'SUBMITTED' || order.status === 'CONFIRMING') {
      const submittedTransaction = await this.prisma.paymentTransaction.findFirst({
        where: { orderId: order.id },
      });
      if (submittedTransaction?.signature === signature) {
        return { id: order.id, status: order.status };
      }
      throw new ConflictException(
        'A transaction signature has already been submitted for this order.',
      );
    }
    if (order.status !== 'PENDING' && order.status !== 'EXPIRED') {
      throw new ConflictException('Payment order is no longer accepting a signature.');
    }

    const existingSignature = await this.prisma.paymentTransaction.findUnique({
      where: { signature },
    });
    if (existingSignature) {
      if (existingSignature.orderId === order.id) {
        return { id: order.id, status: order.status };
      }
      throw new ConflictException(
        'This transaction signature has already been submitted.',
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.paymentOrder.updateMany({
          where: {
            id: order.id,
            walletId,
            status: { in: ['PENDING', 'EXPIRED'] },
          },
          data: { status: 'SUBMITTED' },
        });
        if (changed.count !== 1) {
          throw new ConflictException(
            'Payment order is no longer accepting signatures.',
          );
        }
        await tx.paymentTransaction.create({
          data: {
            orderId: order.id,
            signature,
            lamports: 0n,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicate = await this.prisma.paymentTransaction.findUnique({
          where: { signature },
        });
        if (duplicate?.orderId === order.id) {
          return { id: order.id, status: 'SUBMITTED' };
        }
        throw new ConflictException(
          'This transaction signature has already been submitted.',
        );
      }
      throw error;
    }

    return { id: order.id, status: 'SUBMITTED' };
  }

  async getOrder(walletId: string, orderId: string) {
    const order = await this.prisma.paymentOrder.findFirst({
      where: { id: orderId, walletId },
      include: { transactions: true },
    });
    if (!order) throw new NotFoundException('Payment order not found.');
    return {
      ...this.serializeOrder(
        order,
        this.config.get<string>('TREASURY_WALLET_ADDRESS') ?? '',
      ),
      transactions: order.transactions.map((transaction) => ({
        signature: transaction.signature,
        status: order.status,
        lamports: transaction.lamports.toString(),
        verificationDate: transaction.verificationDate.toISOString(),
      })),
    };
  }

  async getHistory(walletId: string, rawLimit?: string) {
    const limit = rawLimit === undefined ? 20 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new BadRequestException('Limit must be an integer between 1 and 50.');
    }
    const orders = await this.prisma.paymentOrder.findMany({
      where: { walletId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { transactions: true },
    });
    return orders.map((order) => ({
      ...this.serializeOrder(
        order,
        this.config.get<string>('TREASURY_WALLET_ADDRESS') ?? '',
      ),
      transactions: order.transactions.map((transaction) => ({
        signature: transaction.signature,
        lamports: transaction.lamports.toString(),
        verificationDate: transaction.verificationDate.toISOString(),
      })),
    }));
  }
}
