import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';
import { generateLuckySixDraw } from './domain/draw/mathematics.js';

@Injectable()
export class DrawSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(DrawSchedulerService.name);
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit() {
    this.logger.log('Initializing Draw Engine Scheduler Loop (5-min draw lifecycle)...');
    // Run scheduler loop every 3 seconds
    setInterval(() => {
      this.processDrawLifecycle().catch((err) => {
        this.logger.error(`Error in draw lifecycle loop: ${String(err)}`, err.stack);
      });
    }, 3000);
  }

  async processDrawLifecycle(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = new Date();

      // Find active draw
      let currentDraw = await this.prisma.draw.findFirst({
        where: {
          status: {
            in: ['OPEN', 'CLOSING', 'CLOSED', 'DRAWING', 'RESULT_READY', 'SETTLEMENT_PENDING'],
          },
        },
        orderBy: { drawNumber: 'asc' },
        include: { balls: true, statistics: true },
      });

      // 1. If no active draw exists, create next draw in OPEN status
      if (!currentDraw) {
        const openAt = now;
        const closeAt = new Date(now.getTime() + 4 * 60 * 1000); // 4 minutes betting
        const drawAt = new Date(now.getTime() + 4.5 * 60 * 1000); // 30s closed period

        const creation = await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(1145390147)`;

          const activeDraw = await tx.draw.findFirst({
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
            orderBy: { drawNumber: 'asc' },
            include: { balls: true, statistics: true },
          });
          if (activeDraw) return { draw: activeDraw, created: false };

          const lastDraw = await tx.draw.findFirst({
            orderBy: { drawNumber: 'desc' },
          });
          const nextDrawNumber = lastDraw ? lastDraw.drawNumber + 1 : 10001;
          const draw = await tx.draw.create({
            data: {
              drawNumber: nextDrawNumber,
              status: 'OPEN',
              openAt,
              closeAt,
              drawAt,
            },
            include: { balls: true, statistics: true },
          });
          return { draw, created: true };
        });

        currentDraw = creation.draw;

        if (creation.created) {
          this.logger.log(`Created new Draw #${currentDraw.drawNumber} [OPEN]`);

          await this.redis.publish('lucky-six:events', {
            event: 'draw.created',
            payload: {
              drawId: currentDraw.id,
              drawNumber: currentDraw.drawNumber,
              openAt: currentDraw.openAt.toISOString(),
              closeAt: currentDraw.closeAt.toISOString(),
              drawAt: currentDraw.drawAt.toISOString(),
            },
          });

          await this.redis.publish('lucky-six:events', {
            event: 'draw.open',
            payload: {
              drawId: currentDraw.id,
              drawNumber: currentDraw.drawNumber,
            },
          });
        }
      }

      // 2. Handle OPEN -> CLOSED transition
      if (currentDraw.status === 'OPEN' && now >= currentDraw.closeAt) {
        currentDraw = await this.prisma.draw.update({
          where: { id: currentDraw.id },
          data: { status: 'CLOSED' },
          include: { balls: true, statistics: true },
        });

        this.logger.log(`Draw #${currentDraw.drawNumber} transition -> CLOSED`);

        await this.redis.publish('lucky-six:events', {
          event: 'draw.closed',
          payload: {
            drawId: currentDraw.id,
            drawNumber: currentDraw.drawNumber,
          },
        });
      }

      // 3. Handle CLOSED -> DRAWING -> RESULT_READY transition
      if (
        currentDraw.status === 'DRAWING' ||
        (currentDraw.status === 'CLOSED' && now >= currentDraw.drawAt)
      ) {
        const needsDrawingTransition = currentDraw.status === 'CLOSED';
        if (needsDrawingTransition) {
          this.logger.log(`Draw #${currentDraw.drawNumber} transition -> DRAWING`);
        } else {
          this.logger.warn(
            `Recovering interrupted result generation for Draw #${currentDraw.drawNumber}`,
          );
        }

        const mathResult = generateLuckySixDraw();

        const saved = await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(1145390148)`;

          const drawToGenerate = await tx.draw.findUnique({
            where: { id: currentDraw.id },
          });
          if (
            !drawToGenerate ||
            !['CLOSED', 'DRAWING'].includes(drawToGenerate.status) ||
            (drawToGenerate.status === 'CLOSED' && now < drawToGenerate.drawAt)
          ) {
            return false;
          }

          if (drawToGenerate.status === 'CLOSED') {
            await tx.draw.update({
              where: { id: currentDraw.id },
              data: { status: 'DRAWING' },
            });
          }

          await tx.drawBall.createMany({
            data: mathResult.balls.map((ball) => ({
              drawId: currentDraw.id,
              number: ball.number,
              color: ball.color,
              orderIndex: ball.orderIndex,
            })),
          });

          await tx.drawStatistic.create({
            data: {
              drawId: currentDraw.id,
              totalSum: mathResult.totalSum,
              has49: mathResult.has49,
              majorityColor: mathResult.majorityColor,
            },
          });

          await tx.draw.update({
            where: { id: currentDraw.id },
            data: {
              status: 'SETTLEMENT_PENDING',
              resultAt: new Date(),
            },
          });
          return true;
        });

        if (!saved) return;

        await this.redis.publish('lucky-six:events', {
          event: 'draw.started',
          payload: {
            drawId: currentDraw.id,
            drawNumber: currentDraw.drawNumber,
          },
        });

        // Publish ball reveal events and completed draw event
        for (const b of mathResult.balls) {
          await this.redis.publish('lucky-six:events', {
            event: 'ball.drawn',
            payload: {
              drawId: currentDraw.id,
              drawNumber: currentDraw.drawNumber,
              ball: b,
            },
          });
        }

        await this.redis.publish('lucky-six:events', {
          event: 'draw.completed',
          payload: {
            drawId: currentDraw.id,
            drawNumber: currentDraw.drawNumber,
            completedAt: new Date().toISOString(),
            balls: mathResult.balls,
            statistics: {
              totalSum: mathResult.totalSum,
              has49: mathResult.has49,
              majorityColor: mathResult.majorityColor,
            },
          },
        });

        this.logger.log(`Draw #${currentDraw.drawNumber} results saved & published -> SETTLEMENT_PENDING`);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  // Helper method for testing or manual triggers
  generateDraw(jackpotProbability = 0.02) {
    return generateLuckySixDraw(jackpotProbability);
  }
}
