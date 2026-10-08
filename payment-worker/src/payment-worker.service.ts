import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';
import { SolanaPaymentService } from './domain/solana-payment.service.js';

@Injectable()
export class PaymentWorkerService implements OnModuleInit {
  private readonly logger = new Logger(PaymentWorkerService.name);
  private isProcessing = false;

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

      // 1. Mark expired payment orders
      await this.prisma.paymentOrder.updateMany({
        where: {
          status: 'PENDING',
          expiresAt: { lt: now },
        },
        data: {
          status: 'EXPIRED',
        },
      });

      // 2. Find pending/confirming payment orders with transactions submitted
      const pendingOrders = await this.prisma.paymentOrder.findMany({
        where: {
          status: { in: ['PENDING', 'SUBMITTED', 'CONFIRMING'] },
        },
        include: {
          transactions: true,
          wallet: true,
        },
      });

      for (const order of pendingOrders) {
        if (order.transactions.length > 0) {
          for (const tx of order.transactions) {
            await this.processPaymentVerification(order.id, tx.signature);
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Atomically verifies payment signature, credits ledger, and updates payment order status idempotently.
   */
  async processPaymentVerification(
    orderId: string,
    signature: string,
    actualLamportsOverride?: bigint,
  ): Promise<boolean> {
    return await this.prisma.$transaction(async (tx) => {
      const order = await tx.paymentOrder.findUnique({
        where: { id: orderId },
        include: { wallet: true, transactions: true },
      });

      if (!order) {
        this.logger.warn(`PaymentOrder ${orderId} not found.`);
        return false;
      }

      // Check if order is already credited or expired/failed
      if (order.status === 'CREDITED') {
        this.logger.log(`PaymentOrder ${orderId} is already CREDITED. Skipping.`);
        return true;
      }

      if (order.status === 'EXPIRED') {
        this.logger.warn(`PaymentOrder ${orderId} is EXPIRED.`);
        return false;
      }

      // Check if signature has already been processed for another order
      const existingTx = await tx.paymentTransaction.findFirst({
        where: { signature },
      });

      if (existingTx && existingTx.orderId !== orderId) {
        this.logger.warn(`Transaction signature ${signature} already used for order ${existingTx.orderId}!`);
        await tx.paymentOrder.update({
          where: { id: orderId },
          data: { status: 'FAILED' },
        });
        return false;
      }

      // Verify transaction on-chain / via Solana Payment Service
      const treasuryAddress = process.env.TREASURY_WALLET_ADDRESS ?? '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R';
      const verifyRes = await this.solanaPayment.verifyTransactionSignature(
        signature,
        treasuryAddress,
        order.expectedLamports,
        actualLamportsOverride,
      );

      // Record transaction record if not present
      if (!existingTx) {
        await tx.paymentTransaction.create({
          data: {
            orderId: order.id,
            signature,
            lamports: verifyRes.actualLamports,
          },
        });
      }

      if (verifyRes.status === 'VERIFIED' || verifyRes.status === 'OVERPAID') {
        // Credit User Ledger Account & Wallet Balance
        await tx.wallet.update({
          where: { id: order.walletId },
          data: { balance: { increment: order.creditsToIssue } },
        });

        let ledgerAccount = await tx.ledgerAccount.findUnique({
          where: { walletId: order.walletId },
        });

        if (!ledgerAccount) {
          ledgerAccount = await tx.ledgerAccount.create({
            data: { walletId: order.walletId },
          });
        }

        await tx.ledgerEntry.create({
          data: {
            accountId: ledgerAccount.id,
            amount: order.creditsToIssue,
            type: 'CREDIT_PURCHASE',
            reference: `PAYMENT_ORDER_${order.id}`,
          },
        });

        await tx.paymentOrder.update({
          where: { id: order.id },
          data: { status: 'CREDITED' },
        });

        this.logger.log(`PaymentOrder ${order.id} verified & CREDITED ${order.creditsToIssue.toString()} SIM Credits!`);

        await this.redis.publish('lucky-six:events', {
          event: 'wallet.updated',
          payload: {
            walletId: order.walletId,
            creditsAdded: order.creditsToIssue.toString(),
          },
        });

        return true;
      } else if (verifyRes.status === 'UNDERPAID') {
        await tx.paymentOrder.update({
          where: { id: order.id },
          data: { status: 'UNDERPAID' },
        });
        this.logger.warn(`PaymentOrder ${order.id} is UNDERPAID.`);
        return false;
      } else {
        await tx.paymentOrder.update({
          where: { id: order.id },
          data: { status: 'FAILED' },
        });
        this.logger.warn(`PaymentOrder ${order.id} verification FAILED.`);
        return false;
      }
    });
  }
}
