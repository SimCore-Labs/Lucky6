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
        orderBy: { drawNumber: 'desc' },
        include: { balls: true, statistics: true },
      });

      // 1. If no active draw exists, create next draw in OPEN status
      if (!currentDraw) {
        const lastDraw = await this.prisma.draw.findFirst({
          orderBy: { drawNumber: 'desc' },
        });

        const nextDrawNumber = lastDraw ? lastDraw.drawNumber + 1 : 10001;
        const openAt = now;
        const closeAt = new Date(now.getTime() + 4 * 60 * 1000); // 4 minutes betting
        const drawAt = new Date(now.getTime() + 4.5 * 60 * 1000); // 30s closed period

        currentDraw = await this.prisma.draw.create({
          data: {
            drawNumber: nextDrawNumber,
            status: 'OPEN',
            openAt,
            closeAt,
            drawAt,
          },
          include: { balls: true, statistics: true },
        });

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
      if (currentDraw.status === 'CLOSED' && now >= currentDraw.drawAt) {
        this.logger.log(`Draw #${currentDraw.drawNumber} transition -> DRAWING`);

        await this.prisma.draw.update({
          where: { id: currentDraw.id },
          data: { status: 'DRAWING' },
        });

        await this.redis.publish('lucky-six:events', {
          event: 'draw.started',
          payload: {
            drawId: currentDraw.id,
            drawNumber: currentDraw.drawNumber,
          },
        });

        // Generate 6 balls and statistics using mathematics.ts
        const mathResult = generateLuckySixDraw();

        // Save balls and statistics in PostgreSQL
        for (const b of mathResult.balls) {
          await this.prisma.drawBall.create({
            data: {
              drawId: currentDraw.id,
              number: b.number,
              color: b.color,
              orderIndex: b.orderIndex,
            },
          });
        }

        await this.prisma.drawStatistic.create({
          data: {
            drawId: currentDraw.id,
            totalSum: mathResult.totalSum,
            has49: mathResult.has49,
            majorityColor: mathResult.majorityColor,
          },
        });

        await this.prisma.draw.update({
          where: { id: currentDraw.id },
          data: {
            status: 'SETTLEMENT_PENDING',
            resultAt: new Date(),
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
