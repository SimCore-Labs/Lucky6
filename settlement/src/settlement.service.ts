import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';
import { SettlementEvaluatorService } from './domain/settlement-evaluator.service.js';
import type { BallColor } from '@lucky-six/contracts';

function calculateSingleSelectionPayout(
  stake: bigint,
  lockedOdds: string,
): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(lockedOdds);
  if (!match) {
    throw new Error(`Invalid locked decimal odds: ${lockedOdds}`);
  }
  const oddsHundredths =
    BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  return (stake * oddsHundredths) / 100n;
}

@Injectable()
export class SettlementService implements OnModuleInit {
  private readonly logger = new Logger(SettlementService.name);
  private isSettling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly evaluator: SettlementEvaluatorService,
  ) {}

  onModuleInit() {
    this.logger.log('Initializing Settlement Engine listener & poller...');

    // 1. Listen for Redis draw.completed event
    this.redis.subscribe('lucky-six:events', (channel, message) => {
      try {
        const parsed = JSON.parse(message);
        if (parsed.event === 'draw.completed' && parsed.payload?.drawId) {
          this.logger.log(`Received 'draw.completed' event for drawId: ${parsed.payload.drawId}`);
          this.settleDraw(parsed.payload.drawId).catch((err) => {
            this.logger.error(`Error settling draw ${parsed.payload.drawId}: ${String(err)}`, err.stack);
          });
        }
      } catch (e) {
        this.logger.warn(`Error handling Redis message in SettlementService: ${String(e)}`);
      }
    });

    // 2. Fallback periodic polling every 5 seconds for pending draws
    setInterval(() => {
      this.pollPendingSettlements().catch((err) => {
        this.logger.error(`Error polling pending settlements: ${String(err)}`, err.stack);
      });
    }, 5000);
  }

  async pollPendingSettlements(): Promise<void> {
    if (this.isSettling) return;
    this.isSettling = true;

    try {
      const pendingDraws = await this.prisma.draw.findMany({
        where: {
          status: { in: ['RESULT_READY', 'SETTLEMENT_PENDING'] },
        },
        orderBy: { drawNumber: 'asc' },
      });

      for (const draw of pendingDraws) {
        await this.settleDraw(draw.id);
      }
    } finally {
      this.isSettling = false;
    }
  }

  /**
   * Idempotently settles all ACCEPTED bets for a specific draw ID.
   */
  async settleDraw(drawId: string): Promise<void> {
    const draw = await this.prisma.draw.findUnique({
      where: { id: drawId },
      include: {
        balls: { orderBy: { orderIndex: 'asc' } },
        statistics: true,
      },
    });

    if (!draw || !draw.statistics) {
      this.logger.warn(`Draw ${drawId} or statistics not found for settlement.`);
      return;
    }

    const drawData = {
      balls: draw.balls.map((b) => ({
        number: b.number,
        color: b.color as BallColor,
        orderIndex: b.orderIndex,
      })),
      statistics: {
        totalSum: draw.statistics.totalSum,
        has49: draw.statistics.has49,
        majorityColor: draw.statistics.majorityColor as BallColor | null,
      },
    };

    // Find all pending ACCEPTED bets for this draw
    const pendingBets = await this.prisma.bet.findMany({
      where: {
        drawId,
        status: 'ACCEPTED',
      },
      include: {
        selections: {
          include: {
            selection: {
              include: { market: true },
            },
          },
        },
        pickSixTicket: true,
        wallet: true,
      },
    });

    this.logger.log(`Found ${pendingBets.length} pending bets for Draw #${draw.drawNumber}`);

    let settledCount = 0;
    let totalPayoutBigInt = 0n;

    for (const bet of pendingBets) {
      await this.prisma.$transaction(async (tx) => {
        // Re-check bet status inside transaction for strict idempotency
        const currentBet = await tx.bet.findUnique({
          where: { id: bet.id },
          include: { settlement: true },
        });

        if (!currentBet || currentBet.status !== 'ACCEPTED' || currentBet.settlement) {
          // Already settled or cancelled
          return;
        }

        let matchedCount: number | null = null;
        let winningTier: number | null = null;
        let payoutAmount = 0n;
        let betWon = false;

        if (bet.pickSixTicket) {
          const selectedNumbers: unknown = JSON.parse(
            bet.pickSixTicket.numbers,
          );
          const tierMultipliers: unknown = JSON.parse(
            bet.pickSixTicket.tierMultipliers,
          );
          if (
            !Array.isArray(selectedNumbers) ||
            !selectedNumbers.every(
              (number): number is number => typeof number === 'number',
            ) ||
            !tierMultipliers ||
            typeof tierMultipliers !== 'object'
          ) {
            throw new Error(`Pick-six ticket ${bet.pickSixTicket.id} is invalid.`);
          }
          matchedCount = this.evaluator.countPickSixMatches(
            selectedNumbers,
            drawData,
          );
          winningTier = matchedCount >= 3 ? matchedCount : null;
          const multiplier = winningTier
            ? (tierMultipliers as Record<string, unknown>)[String(winningTier)]
            : undefined;
          if (
            winningTier &&
            (typeof multiplier !== 'number' ||
              !Number.isInteger(multiplier) ||
              multiplier < 1)
          ) {
            throw new Error(
              `Pick-six ticket ${bet.pickSixTicket.id} has an invalid tier multiplier.`,
            );
          }
          if (winningTier) {
            payoutAmount = bet.stake * BigInt(Number(multiplier));
            betWon = true;
          }
          await tx.pickSixTicket.update({
            where: { id: bet.pickSixTicket.id },
            data: { matchedCount, winningTier },
          });
        } else {
          if (bet.selections.length !== 1) {
            throw new Error(
              `Bet ${bet.id} must have exactly one selection or one pick-six ticket.`,
            );
          }
          const [selection] = bet.selections;
          betWon = this.evaluator.evaluateSelection(
            {
              marketType: selection.selection.market.type,
              selectionValue: selection.selection.value,
            },
            drawData,
          );
          if (betWon) {
            payoutAmount = calculateSingleSelectionPayout(
              bet.stake,
              selection.lockedOdds.toString(),
            );
          }
        }

        if (betWon) {

          // Debit/Credit Wallet & Ledger Entry
          await tx.wallet.update({
            where: { id: bet.walletId },
            data: { balance: { increment: payoutAmount } },
          });

          const ledgerAccount = await tx.ledgerAccount.upsert({
            where: { walletId: bet.walletId },
            update: {},
            create: { walletId: bet.walletId },
          });
          await tx.ledgerEntry.create({
            data: {
              accountId: ledgerAccount.id,
              amount: payoutAmount,
              type: 'BET_WIN',
              reference: `SETTLEMENT_BET_${bet.id}`,
            },
          });

          // Mark bet WON & record Settlement
          await tx.bet.update({
            where: { id: bet.id },
            data: { status: 'WON' },
          });

          await tx.settlement.create({
            data: {
              betId: bet.id,
              status: 'SETTLED',
              payout: payoutAmount,
            },
          });

          settledCount++;
          totalPayoutBigInt += payoutAmount;
          this.logger.log(
            `Bet ${bet.id} WON${winningTier ? ` (${winningTier} matches)` : ''}. Payout: ${payoutAmount.toString()} SIM Credits`,
          );
        } else {
          // Bet LOST
          await tx.bet.update({
            where: { id: bet.id },
            data: { status: 'LOST' },
          });

          await tx.settlement.create({
            data: {
              betId: bet.id,
              status: 'SETTLED',
              payout: 0n,
            },
          });

          settledCount++;
          this.logger.log(`Bet ${bet.id} LOST.`);
        }
      });
    }

    // Mark draw as SETTLED
    await this.prisma.draw.update({
      where: { id: drawId },
      data: { status: 'SETTLED' },
    });

    this.logger.log(`Draw #${draw.drawNumber} settlement complete. Settled bets: ${settledCount}`);

    await this.redis.publish('lucky-six:events', {
      event: 'settlement.completed',
      payload: {
        drawId: draw.id,
        drawNumber: draw.drawNumber,
        settledBetsCount: settledCount,
        totalPayout: totalPayoutBigInt.toString(),
        completedAt: new Date().toISOString(),
      },
    });
  }
}
