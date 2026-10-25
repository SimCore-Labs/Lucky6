import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';
import { SolanaPaymentService } from './domain/solana-payment.service.js';

const PAYMENT_FINALIZATION_GRACE_MS = 2 * 60 * 1000;

@Injectable()
export class PaymentWorkerService implements OnModuleInit {
  private readonly logger = new Logger(PaymentWorkerService.name);
  private isProcessing = false;
  private lastReconciledOrderId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly solanaPayment: SolanaPaymentService,
  ) {}

  onModuleInit() {
    this.logger.log('Initializing Payment Worker polling loop...');

    // Polling loop every 5 seconds
    setInterval(() => {
      this.pollPendingPayments().catch((err) => {
        this.logger.error(`Error polling pending payments: ${String(err)}`, err.stack);
      });
    }, 5000);
  }

  async pollPendingPayments(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = new Date();

      // Only unsigned orders expire automatically; a submitted chain transaction
      // may still be awaiting finalization.
      await this.prisma.paymentOrder.updateMany({
        where: {
          status: 'PENDING',
          expiresAt: { lt: new Date(now.getTime() - PAYMENT_FINALIZATION_GRACE_MS) },
        },
        data: {
          status: 'EXPIRED',
        },
      });

      const loadBatch = (afterId: string | null) =>
        this.prisma.paymentOrder.findMany({
          where: {
            status: { in: ['PENDING', 'SUBMITTED', 'CONFIRMING'] },
            ...(afterId ? { id: { gt: afterId } } : {}),
          },
          orderBy: { id: 'asc' },
          take: 25,
          include: {
            transactions: true,
            wallet: true,
          },
        });
      let pendingOrders = await loadBatch(this.lastReconciledOrderId);
      if (pendingOrders.length === 0 && this.lastReconciledOrderId !== null) {
        this.lastReconciledOrderId = null;
        pendingOrders = await loadBatch(null);
      }
      if (pendingOrders.length > 0) {
        this.lastReconciledOrderId =
          pendingOrders[pendingOrders.length - 1].id;
      }

      for (const order of pendingOrders) {
        if (order.transactions.length > 0) {
          for (const tx of order.transactions) {
            await this.processPaymentVerification(order.id, tx.signature);
          }
        } else if (order.status === 'PENDING') {
          const signatures = await this.solanaPayment.getRecentSignatures(
            order.reference,
          );
          for (const signature of signatures.slice(0, 3)) {
            if (await this.recordDiscoveredSignature(order.id, signature)) {
              await this.processPaymentVerification(order.id, signature);
              break;
            }
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async recordDiscoveredSignature(
    orderId: string,
    signature: string,
  ): Promise<boolean> {
    const existing = await this.prisma.paymentTransaction.findUnique({
      where: { signature },
    });
    if (existing) return existing.orderId === orderId;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await tx.paymentOrder.findUnique({
          where: { id: orderId },
        });
        if (!order || order.status !== 'PENDING') return false;

        await tx.paymentOrder.update({
          where: { id: orderId },
          data: { status: 'SUBMITTED' },
        });
        await tx.paymentTransaction.create({
          data: { orderId, signature, lamports: 0n },
        });
        return true;
      });
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        const duplicate = await this.prisma.paymentTransaction.findUnique({
          where: { signature },
        });
        return duplicate?.orderId === orderId;
      }
      throw error;
    }
  }

  /**
   * Atomically verifies payment signature, credits ledger, and updates payment order status idempotently.
   */
  async processPaymentVerification(
    orderId: string,
    signature: string,
  ): Promise<boolean> {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { id: orderId },
      include: { wallet: true },
    });
    if (!order) {
      this.logger.warn(`PaymentOrder ${orderId} not found.`);
      return false;
    }
    if (order.status === 'CREDITED') return true;
    if (!['SUBMITTED', 'CONFIRMING'].includes(order.status)) return false;

    const transaction = await this.prisma.paymentTransaction.findUnique({
      where: { signature },
    });
    if (!transaction || transaction.orderId !== order.id) {
      this.logger.error(
        `Payment transaction ${signature} is not linked to order ${order.id}.`,
      );
      return false;
    }

    const treasuryAddress = process.env.TREASURY_WALLET_ADDRESS;
    if (!treasuryAddress) {
      throw new Error('TREASURY_WALLET_ADDRESS is not configured.');
    }
    const verifyRes = await this.solanaPayment.verifyTransactionSignature(
      signature,
      treasuryAddress,
      order.expectedLamports,
      order.wallet.address,
      order.reference,
      order.createdAt,
      order.expiresAt,
    );

    if (verifyRes.status === 'PENDING') {
      await this.prisma.$transaction(async (tx) => {
        await tx.paymentTransaction.updateMany({
          where: { id: transaction.id, orderId: order.id },
          data: { lamports: 0n },
        });
        await tx.paymentOrder.updateMany({
          where: { id: order.id, status: 'SUBMITTED' },
          data: { status: 'CONFIRMING' },
        });
      });
      return false;
    }

    const credited = await this.prisma.$transaction(async (tx) => {
      const currentOrder = await tx.paymentOrder.findUnique({
        where: { id: order.id },
      });
      if (!currentOrder) return false;
      if (currentOrder.status === 'CREDITED') return true;
      if (!['SUBMITTED', 'CONFIRMING'].includes(currentOrder.status)) {
        return false;
      }

      await tx.paymentTransaction.update({
        where: { id: transaction.id },
        data: { lamports: verifyRes.actualLamports },
      });

      if (verifyRes.status !== 'VERIFIED') {
        await tx.paymentOrder.update({
          where: { id: currentOrder.id },
          data: {
            status:
              verifyRes.status === 'UNDERPAID'
                ? 'UNDERPAID'
                : verifyRes.status === 'OVERPAID'
                  ? 'OVERPAID'
                  : verifyRes.status === 'EXPIRED'
                    ? 'EXPIRED'
                    : verifyRes.status === 'REQUIRES_REVIEW'
                      ? 'REQUIRES_REVIEW'
                      : 'FAILED',
          },
        });
        return false;
      }

      const claimed = await tx.paymentOrder.updateMany({
        where: {
          id: currentOrder.id,
          status: { in: ['SUBMITTED', 'CONFIRMING'] },
        },
        data: { status: 'CREDITED' },
      });
      if (claimed.count !== 1) return false;

      await tx.wallet.update({
        where: { id: currentOrder.walletId },
        data: { balance: { increment: currentOrder.creditsToIssue } },
      });
      const ledgerAccount = await tx.ledgerAccount.upsert({
        where: { walletId: currentOrder.walletId },
        update: {},
        create: { walletId: currentOrder.walletId },
      });
      await tx.ledgerEntry.create({
        data: {
          accountId: ledgerAccount.id,
          amount: currentOrder.creditsToIssue,
          type: 'CREDIT_PURCHASE',
          reference: `PAYMENT_ORDER_${currentOrder.id}`,
        },
      });
      return true;
    });

    if (credited) {
      await this.redis.publish('lucky-six:events', {
        event: 'wallet.updated',
        payload: {
          walletId: order.walletId,
          creditsAdded: order.creditsToIssue.toString(),
        },
      });
      this.logger.log(
        `PaymentOrder ${order.id} verified & credited ${order.creditsToIssue.toString()} credits.`,
      );
    } else {
      this.logger.warn(
        `PaymentOrder ${order.id} verification result: ${verifyRes.status}.`,
      );
    }
    return credited;
  }
}
