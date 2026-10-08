import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PricingEngineService } from '../pricing/pricing-engine.service.js';
import { z } from 'zod';

const placeBetSchema = z.object({
  walletId: z.string().uuid(),
  drawId: z.string().uuid(),
  selectionId: z.string().uuid(),
  stake: z.union([z.number().positive(), z.string()]),
  idempotencyKey: z.string().optional(),
});

@Controller()
export class GameController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingEngine: PricingEngineService,
  ) {}

  @Get('draws/current')
  async getCurrentDraw() {
    let draw = await this.prisma.draw.findFirst({
      where: { status: { in: ['OPEN', 'CLOSING', 'SCHEDULED', 'DRAWING'] } },
      orderBy: { drawNumber: 'desc' },
      include: { balls: true, statistics: true },
    });

    if (!draw) {
      // Create initial active draw if none exists
      const now = new Date();
      draw = await this.prisma.draw.create({
        data: {
          drawNumber: 10001,
          status: 'OPEN',
          openAt: now,
          closeAt: new Date(now.getTime() + 4.5 * 60 * 1000), // 4.5 mins betting
          drawAt: new Date(now.getTime() + 5 * 60 * 1000), // 5 min draw
        },
        include: { balls: true, statistics: true },
      });

      // Update market odds
      await this.pricingEngine.updateMarketOddsForActiveMarkets();
    }

    return {
      id: draw.id,
      drawNumber: draw.drawNumber,
      status: draw.status,
      openAt: draw.openAt.toISOString(),
      closeAt: draw.closeAt.toISOString(),
      drawAt: draw.drawAt.toISOString(),
      resultAt: draw.resultAt?.toISOString() ?? null,
      balls: draw.balls.map((b) => ({
        number: b.number,
        color: b.color,
        orderIndex: b.orderIndex,
      })),
      statistics: draw.statistics
        ? {
            totalSum: draw.statistics.totalSum,
            has49: draw.statistics.has49,
            majorityColor: draw.statistics.majorityColor,
          }
        : null,
    };
  }

  @Get('markets')
  async getMarkets() {
    const markets = await this.prisma.market.findMany({
      where: { active: true },
      include: {
        selections: {
          include: {
            odds: {
              where: { active: true },
              orderBy: { version: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    return markets.map((m) => ({
      id: m.id,
      type: m.type,
      title: m.title,
      description: m.description,
      selections: m.selections.map((s) => ({
        id: s.id,
        value: s.value,
        label: s.label,
        currentOdds: s.odds[0] ? Number(s.odds[0].oddsValue) : 2.0,
        oddsVersion: s.odds[0] ? s.odds[0].version : 1,
      })),
    }));
  }

  @Post('bets')
  async placeBet(@Body() body: unknown) {
    const parse = placeBetSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException('Invalid bet payload.');
    }

    const { walletId, drawId, selectionId, stake, idempotencyKey } = parse.data;
    const stakeBigInt = BigInt(stake.toString());

    if (stakeBigInt <= 0n) {
      throw new BadRequestException('Stake must be greater than zero.');
    }

    // Check Idempotency Key
    if (idempotencyKey) {
      const existingBet = await this.prisma.bet.findUnique({
        where: { walletId_idempotencyKey: { walletId, idempotencyKey } },
        include: { selections: true },
      });
      if (existingBet) {
        return {
          id: existingBet.id,
          status: existingBet.status,
          stake: existingBet.stake.toString(),
          idempotencyKey: existingBet.idempotencyKey,
        };
      }
    }

    // Atomically validate draw and user balance inside database transaction
    return await this.prisma.$transaction(async (tx) => {
      const draw = await tx.draw.findUnique({ where: { id: drawId } });
      if (!draw) throw new NotFoundException('Draw not found.');

      if (draw.status !== 'OPEN' || new Date() >= draw.closeAt) {
        throw new BadRequestException('Betting is closed for this draw.');
      }

      const wallet = await tx.wallet.findUnique({ where: { id: walletId } });
      if (!wallet) throw new NotFoundException('Wallet not found.');

      if (wallet.balance < stakeBigInt) {
        throw new BadRequestException('Insufficient balance.');
      }

      const selection = await tx.marketSelection.findUnique({
        where: { id: selectionId },
        include: {
          odds: { where: { active: true }, orderBy: { version: 'desc' }, take: 1 },
        },
      });

      if (!selection || !selection.odds[0]) {
        throw new NotFoundException('Active market selection or odds not found.');
      }

      const lockedOdds = selection.odds[0].oddsValue;

      // Debit balance & create ledger entry
      await tx.wallet.update({
        where: { id: walletId },
        data: { balance: { decrement: stakeBigInt } },
      });

      const ledgerAccount = await tx.ledgerAccount.findUnique({
        where: { walletId },
      });

      if (ledgerAccount) {
        await tx.ledgerEntry.create({
          data: {
            accountId: ledgerAccount.id,
            amount: -stakeBigInt,
            type: 'BET_STAKE',
            reference: `BET_DRAW_${draw.drawNumber}`,
          },
        });
      }

      // Create bet record
      const bet = await tx.bet.create({
        data: {
          walletId,
          drawId,
          stake: stakeBigInt,
          idempotencyKey,
          status: 'ACCEPTED',
          selections: {
            create: {
              selectionId,
              lockedOdds,
            },
          },
        },
        include: { selections: true },
      });

      return {
        id: bet.id,
        walletId: bet.walletId,
        drawId: bet.drawId,
        stake: bet.stake.toString(),
        status: bet.status,
        createdAt: bet.createdAt.toISOString(),
        selections: bet.selections.map((s) => ({
          selectionId: s.selectionId,
          lockedOdds: Number(s.lockedOdds),
        })),
      };
    });
  }

  @Get('wallet/:walletId/balance')
  async getBalance(@Param('walletId') walletId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });
    if (!wallet) throw new NotFoundException('Wallet not found.');
    return { walletId: wallet.id, balance: wallet.balance.toString() };
  }
}
