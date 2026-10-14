import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { z } from 'zod';

const placeBetSchema = z.object({
  walletId: z.string().uuid(),
  drawId: z.string().uuid(),
  selectionId: z.string().uuid(),
  stake: z.union([z.number().positive(), z.string()]),
  idempotencyKey: z.string().optional(),
});

const completedDrawStatuses = ['RESULT_READY', 'SETTLEMENT_PENDING', 'SETTLED'] as const;

@Controller()
export class GameController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('draws/current')
  async getCurrentDraw() {
    const draw = await this.prisma.draw.findFirst({
      where: {
        status: {
          in: [
            'OPEN',
            'CLOSING',
            'CLOSED',
            'DRAWING',
            'RESULT_READY',
            'SETTLEMENT_PENDING',
          ],
        },
      },
      orderBy: { drawNumber: 'desc' },
      include: { balls: true, statistics: true },
    });

    if (!draw) {
      throw new NotFoundException('No active draw is currently available.');
    }

    const latestResult =
      draw.balls.length === 6
        ? draw
        : await this.prisma.draw.findFirst({
            where: {
              status: {
                in: ['RESULT_READY', 'SETTLEMENT_PENDING', 'SETTLED'],
              },
              balls: { some: {} },
            },
            orderBy: { drawNumber: 'desc' },
            include: { balls: true, statistics: true },
          });

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
      latestResult:
        latestResult?.balls.length === 6
          ? {
              id: latestResult.id,
              drawNumber: latestResult.drawNumber,
              resultAt: latestResult.resultAt?.toISOString() ?? null,
              balls: latestResult.balls.map((ball) => ({
                number: ball.number,
                color: ball.color,
                orderIndex: ball.orderIndex,
              })),
              statistics: latestResult.statistics
                ? {
                    totalSum: latestResult.statistics.totalSum,
                    has49: latestResult.statistics.has49,
                    majorityColor: latestResult.statistics.majorityColor,
                  }
                : null,
            }
          : null,
    };
  }

  @Get('draws/results')
  async getDrawResults(@Query('limit') rawLimit?: string) {
    const parsedLimit = rawLimit === undefined ? 10 : Number(rawLimit);
    if (
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > 50
    ) {
      throw new BadRequestException('Limit must be an integer between 1 and 50.');
    }

    const draws = await this.prisma.draw.findMany({
      where: {
        status: { in: [...completedDrawStatuses] },
        balls: { some: {} },
      },
      orderBy: { drawNumber: 'desc' },
      take: 20,
      include: { balls: true, statistics: true },
    });
    const latestDrawNumber = draws[0]?.drawNumber ?? null;

    const lastAppearances = latestDrawNumber === null
      ? []
      : await this.prisma.$queryRaw<
          { number: number; lastDrawNumber: number }[]
        >`
          SELECT ball."number", MAX(draw."drawNumber")::int AS "lastDrawNumber"
          FROM "DrawBall" AS ball
          INNER JOIN "Draw" AS draw ON draw."id" = ball."drawId"
          WHERE draw."status" IN ('RESULT_READY', 'SETTLEMENT_PENDING', 'SETTLED')
          GROUP BY ball."number"
        `;

    const latestAppearanceByNumber = new Map(
      lastAppearances.map(({ number, lastDrawNumber }) => [
        number,
        lastDrawNumber,
      ]),
    );
    const lateNumbers = latestDrawNumber === null
      ? []
      : Array.from({ length: 49 }, (_, index) => index + 1)
          .map((number) => {
            const lastDrawNumber = latestAppearanceByNumber.get(number);
            return {
              number,
              delay: lastDrawNumber === undefined
                ? null
                : latestDrawNumber - lastDrawNumber,
            };
          })
          .filter(
            (item): item is { number: number; delay: number } =>
              item.delay !== null,
          )
          .sort((first, second) => {
            return second.delay - first.delay || first.number - second.number;
          })
          .slice(0, 5);

    const numberCounts = new Map<number, number>();
    const winningColors: Record<string, number> = {
      DRAW: 0,
      RED: 0,
      BLUE: 0,
      GREEN: 0,
      YELLOW: 0,
    };
    const sumBands = { LOW: 0, MID: 0, HIGH: 0 };

    for (const draw of draws) {
      for (const ball of draw.balls) {
        numberCounts.set(ball.number, (numberCounts.get(ball.number) ?? 0) + 1);
      }

      const majorityColor = draw.statistics?.majorityColor;
      const winningColor = majorityColor ?? 'DRAW';
      if (winningColor in winningColors) winningColors[winningColor] += 1;

      const totalSum =
        draw.statistics?.totalSum ??
        draw.balls.reduce((total, ball) => total + ball.number, 0);
      if (totalSum <= 120) sumBands.LOW += 1;
      else if (totalSum <= 170) sumBands.MID += 1;
      else sumBands.HIGH += 1;
    }

    const hotNumbers = [...numberCounts.entries()]
      .map(([number, count]) => ({ number, count }))
      .sort((first, second) => second.count - first.count || first.number - second.number)
      .slice(0, 5);

    return {
      results: draws.slice(0, parsedLimit).map((draw) => ({
        id: draw.id,
        drawNumber: draw.drawNumber,
        resultAt: draw.resultAt?.toISOString() ?? null,
        balls: [...draw.balls]
          .sort((first, second) => first.orderIndex - second.orderIndex)
          .map(({ number, color, orderIndex }) => ({
            number,
            color,
            orderIndex,
          })),
        totalSum:
          draw.statistics?.totalSum ??
          draw.balls.reduce((total, ball) => total + ball.number, 0),
        winningColor: draw.statistics?.majorityColor ?? 'DRAW',
      })),
      statistics: {
        drawsAnalyzed: draws.length,
        hotNumbers,
        lateNumbers,
        maxDelay:
          latestDrawNumber === null
            ? 0
            : [...latestAppearanceByNumber.values()].reduce(
                (maximum, lastDrawNumber) =>
                  Math.max(maximum, latestDrawNumber - lastDrawNumber),
                0,
              ),
        winningColors,
        sumBands,
      },
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
      selections: m.selections
        .filter((selection) => selection.odds.length > 0)
        .map((selection) => ({
          id: selection.id,
          value: selection.value,
          label: selection.label,
          currentOdds: Number(selection.odds[0].oddsValue),
          oddsVersion: selection.odds[0].version,
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
        idempotencyKey: bet.idempotencyKey,
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
