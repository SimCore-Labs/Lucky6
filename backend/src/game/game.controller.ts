import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/session.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  MAX_BET_STAKE,
  MAX_GROSS_PAYOUT,
  PICK_SIX_SCHEDULE_VERSION,
  PICK_SIX_TIER_MULTIPLIERS,
} from '../pricing/market-pricing.js';
import { z } from 'zod';

const betBaseSchema = z.object({
  kind: z.enum(['SELECTION', 'PICK_SIX']),
  drawId: z.string().uuid(),
  stake: z.union([
    z.number().int().positive().safe(),
    z.string().regex(/^[1-9]\d*$/),
  ]),
  idempotencyKey: z.string().uuid(),
});
const selectionBetSchema = betBaseSchema.extend({
  kind: z.literal('SELECTION'),
  selectionId: z.string().uuid(),
  oddsVersion: z.number().int().positive(),
});
const pickSixBetSchema = betBaseSchema.extend({
  kind: z.literal('PICK_SIX'),
  numbers: z.array(z.number().int().min(1).max(49)).length(6),
});
const placeBetSchema = z.discriminatedUnion('kind', [
  selectionBetSchema,
  pickSixBetSchema,
]);

function payoutForOdds(stake: bigint, oddsValue: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(oddsValue);
  if (!match) throw new BadRequestException('Market odds are invalid.');
  const oddsHundredths =
    BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  return (stake * oddsHundredths) / 100n;
}

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
          SELECT ball."number", CAST(MAX(draw."drawNumber") AS INTEGER) AS "lastDrawNumber"
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

    const hasPickSixMarket = markets.some(
      (market) => market.type === 'PICK_SIX',
    );
    const publishedMarkets = markets
      .filter((market) => market.type !== 'PICK_SIX')
      .map((market) => ({
      id: market.id,
      type: market.type,
      title: market.title,
      description: market.description,
      selections: market.selections
        .filter((selection) => selection.odds.length > 0)
        .map((selection) => ({
          id: selection.id,
          value: selection.value,
          label: selection.label,
          currentOdds: Number(selection.odds[0].oddsValue),
          oddsVersion: selection.odds[0].version,
        })),
      }));

    if (!hasPickSixMarket) return publishedMarkets;

    return [
      ...publishedMarkets,
      {
        id: 'PICK_SIX',
        type: 'PICK_SIX',
        title: 'Pick six numbers',
        description: 'Choose six distinct numbers; 3 or more matches win.',
        selections: [],
        payoutScheduleVersion: PICK_SIX_SCHEDULE_VERSION,
        maxStake: MAX_BET_STAKE.toString(),
        maxGrossPayout: MAX_GROSS_PAYOUT.toString(),
        payoutTiers: {
          excludes49: PICK_SIX_TIER_MULTIPLIERS.excludes49,
          includes49: PICK_SIX_TIER_MULTIPLIERS.includes49,
        },
      },
    ];
  }

  @Post('bets')
  @UseGuards(SessionGuard)
  async placeBet(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const parse = placeBetSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException('Invalid bet payload.');
    }
    const input = parse.data;
    const stakeBigInt = BigInt(input.stake.toString());
    if (stakeBigInt > MAX_BET_STAKE) {
      throw new BadRequestException(
        `Stake cannot exceed ${MAX_BET_STAKE.toString()} credits.`,
      );
    }
    if (
      input.kind === 'PICK_SIX' &&
      new Set(input.numbers).size !== input.numbers.length
    ) {
      throw new BadRequestException(
        'Pick-six numbers must be distinct.',
      );
    }

    const walletId = request.authenticatedWallet.id;
    const { drawId, idempotencyKey } = input;
    const checkExistingBet = async () => {
      const existingBet = await this.prisma.bet.findUnique({
        where: { walletId_idempotencyKey: { walletId, idempotencyKey } },
        include: { selections: true, pickSixTicket: true },
      });
      if (!existingBet) return null;
      const payloadMatches =
        existingBet.drawId === drawId &&
        existingBet.stake === stakeBigInt &&
        (input.kind === 'PICK_SIX'
          ? existingBet.pickSixTicket?.numbers ===
            JSON.stringify(input.numbers.slice().sort((a, b) => a - b))
          : existingBet.selections.length === 1 &&
            existingBet.selections[0].selectionId ===
              input.selectionId);
      if (!payloadMatches) {
        throw new ConflictException(
          'This idempotency key was already used for a different bet.',
        );
      }
      return {
        id: existingBet.id,
        status: existingBet.status,
        stake: existingBet.stake.toString(),
        idempotencyKey: existingBet.idempotencyKey,
      };
    };

    const existingBet = await checkExistingBet();
    if (existingBet) return existingBet;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const draw = await tx.draw.findUnique({ where: { id: drawId } });
        if (!draw) throw new NotFoundException('Draw not found.');
        if (draw.status !== 'OPEN' || new Date() >= draw.closeAt) {
          throw new BadRequestException('Betting is closed for this draw.');
        }

        const walletDebit = await tx.wallet.updateMany({
          where: {
            id: walletId,
            balance: { gte: stakeBigInt },
          },
          data: { balance: { decrement: stakeBigInt } },
        });
        if (walletDebit.count !== 1) {
          throw new BadRequestException('Insufficient balance.');
        }

        let betCreateData: Prisma.BetCreateInput;
        let betResponseDetails: Record<string, unknown>;

        if (input.kind === 'PICK_SIX') {
          const pickSixMarket = await tx.market.findUnique({
            where: { type: 'PICK_SIX' },
          });
          if (!pickSixMarket?.active) {
            throw new NotFoundException(
              'Pick-six is not currently an active market.',
            );
          }
          const numbers = input.numbers
            .slice()
            .sort((first, second) => first - second);
          const includes49 = numbers.includes(49);
          const tierMultipliers = includes49
            ? PICK_SIX_TIER_MULTIPLIERS.includes49
            : PICK_SIX_TIER_MULTIPLIERS.excludes49;
          const highestMultiplier = BigInt(tierMultipliers[6]);
          if (stakeBigInt * highestMultiplier > MAX_GROSS_PAYOUT) {
            throw new BadRequestException(
              'Potential payout exceeds the current ticket payout limit.',
            );
          }
          betCreateData = {
            wallet: { connect: { id: walletId } },
            draw: { connect: { id: drawId } },
            stake: stakeBigInt,
            idempotencyKey,
            status: 'ACCEPTED',
            pickSixTicket: {
              create: {
                numbers: JSON.stringify(numbers),
                tierMultipliers: JSON.stringify(tierMultipliers),
                scheduleIncludes49: includes49,
                scheduleVersion: PICK_SIX_SCHEDULE_VERSION,
              },
            },
          };
          betResponseDetails = {
            marketType: 'PICK_SIX',
            numbers,
            scheduleVersion: PICK_SIX_SCHEDULE_VERSION,
            tierMultipliers,
          };
        } else {
          const selection = await tx.marketSelection.findUnique({
            where: { id: input.selectionId },
            include: {
              market: true,
              odds: {
                where: { active: true },
                orderBy: { version: 'desc' },
                take: 1,
              },
            },
          });
          const activeOdds = selection?.odds[0];
          if (!selection || !selection.market.active || !activeOdds) {
            throw new NotFoundException(
              'Active market selection or odds not found.',
            );
          }
          if (activeOdds.version !== input.oddsVersion) {
            throw new ConflictException({
              message: 'Market odds changed; review and confirm the new price.',
              currentOdds: activeOdds.oddsValue.toString(),
              oddsVersion: activeOdds.version,
            });
          }
          const potentialPayout = payoutForOdds(
            stakeBigInt,
            activeOdds.oddsValue.toString(),
          );
          if (potentialPayout > MAX_GROSS_PAYOUT) {
            throw new BadRequestException(
              'Potential payout exceeds the current bet payout limit.',
            );
          }
          betCreateData = {
            wallet: { connect: { id: walletId } },
            draw: { connect: { id: drawId } },
            stake: stakeBigInt,
            idempotencyKey,
            status: 'ACCEPTED',
            selections: {
              create: {
                selection: { connect: { id: selection.id } },
                lockedOdds: activeOdds.oddsValue,
              },
            },
          };
          betResponseDetails = {
            marketType: selection.market.type,
            selectionId: selection.id,
            selectionLabel: selection.label,
            lockedOdds: activeOdds.oddsValue.toString(),
            oddsVersion: activeOdds.version,
            maximumGrossPayout: potentialPayout.toString(),
          };
        }

        const bet = await tx.bet.create({
          data: betCreateData,
          include: { selections: true, pickSixTicket: true },
        });
        const ledgerAccount = await tx.ledgerAccount.upsert({
          where: { walletId },
          update: {},
          create: { walletId },
        });
        await tx.ledgerEntry.create({
          data: {
            accountId: ledgerAccount.id,
            amount: -stakeBigInt,
            type: 'BET_STAKE',
            reference: `BET_${bet.id}`,
          },
        });

        return {
          id: bet.id,
          walletId,
          drawId,
          drawNumber: draw.drawNumber,
          stake: bet.stake.toString(),
          status: bet.status,
          idempotencyKey: bet.idempotencyKey,
          createdAt: bet.createdAt.toISOString(),
          ...betResponseDetails,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const racedBet = await checkExistingBet();
        if (racedBet) return racedBet;
      }
      throw error;
    }
  }

  @Get('wallet/me')
  @UseGuards(SessionGuard)
  getMyBalance(@Req() request: AuthenticatedRequest) {
    return {
      walletId: request.authenticatedWallet.id,
      address: request.authenticatedWallet.address,
      balance: request.authenticatedWallet.balance.toString(),
    };
  }

  @Get('wallet/:walletId/balance')
  @UseGuards(SessionGuard)
  async getBalance(
    @Param('walletId') walletId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    if (walletId !== request.authenticatedWallet.id) {
      throw new NotFoundException('Wallet not found.');
    }
    return this.getMyBalance(request);
  }

  @Get('bets/mine')
  @UseGuards(SessionGuard)
  async getMyBets(
    @Req() request: AuthenticatedRequest,
    @Query('limit') rawLimit?: string,
  ) {
    const limit = rawLimit === undefined ? 20 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new BadRequestException('Limit must be an integer between 1 and 50.');
    }
    const bets = await this.prisma.bet.findMany({
      where: { walletId: request.authenticatedWallet.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        draw: { select: { drawNumber: true, status: true, resultAt: true } },
        selections: {
          include: {
            selection: { include: { market: { select: { title: true, type: true } } } },
          },
        },
        pickSixTicket: true,
        settlement: true,
      },
    });
    return bets.map((bet) => ({
      id: bet.id,
      drawId: bet.drawId,
      drawNumber: bet.draw.drawNumber,
      status: bet.status,
      stake: bet.stake.toString(),
      createdAt: bet.createdAt.toISOString(),
      settlement: bet.settlement
        ? {
            status: bet.settlement.status,
            payout: bet.settlement.payout.toString(),
            createdAt: bet.settlement.createdAt.toISOString(),
          }
        : null,
      selections: bet.selections.map((selection) => ({
        marketType: selection.selection.market.type,
        marketTitle: selection.selection.market.title,
        selectionId: selection.selectionId,
        selectionLabel: selection.selection.label,
        lockedOdds: selection.lockedOdds.toString(),
      })),
      pickSixTicket: bet.pickSixTicket
        ? {
            numbers: JSON.parse(bet.pickSixTicket.numbers),
            matchedCount: bet.pickSixTicket.matchedCount,
            winningTier: bet.pickSixTicket.winningTier,
            scheduleVersion: bet.pickSixTicket.scheduleVersion,
          }
        : null,
    }));
  }
}
