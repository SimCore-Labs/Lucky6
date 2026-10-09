import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawSchedulerService } from './draw-scheduler.service.js';

const generatedResult = {
  balls: [
    { number: 1, color: 'RED', orderIndex: 0 },
    { number: 2, color: 'BLUE', orderIndex: 1 },
    { number: 3, color: 'GREEN', orderIndex: 2 },
    { number: 4, color: 'RED', orderIndex: 3 },
    { number: 5, color: 'BLUE', orderIndex: 4 },
    { number: 49, color: 'BLACK', orderIndex: 5 },
  ],
  totalSum: 64,
  has49: true,
  majorityColor: null,
};

vi.mock('./domain/draw/mathematics.js', () => ({
  generateLuckySixDraw: vi.fn(() => generatedResult),
}));

describe('DrawSchedulerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes the oldest unfinished draw first', async () => {
    const draw = {
      id: 'draw-id',
      drawNumber: 10001,
      status: 'OPEN',
      closeAt: new Date(Date.now() + 60_000),
      drawAt: new Date(Date.now() + 90_000),
      balls: [],
      statistics: null,
    };
    const findFirst = vi.fn().mockResolvedValue(draw);
    const prisma = {
      draw: { findFirst },
    } as never;
    const redis = { publish: vi.fn() } as never;
    const scheduler = new DrawSchedulerService(prisma, redis);

    await scheduler.processDrawLifecycle();

    expect(findFirst).toHaveBeenCalledWith({
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
  });

  it('recovers a DRAWING record and commits all result data atomically', async () => {
    const draw = {
      id: 'draw-id',
      drawNumber: 10001,
      status: 'DRAWING',
      closeAt: new Date(Date.now() - 60_000),
      drawAt: new Date(Date.now() - 30_000),
      balls: [],
      statistics: null,
    };
    const createMany = vi.fn();
    const createStatistic = vi.fn();
    const update = vi.fn();
    const findUnique = vi.fn().mockResolvedValue({ ...draw });
    const transaction = vi.fn(async (callback) =>
      callback({
        $queryRaw: vi.fn(),
        draw: { findUnique, update },
        drawBall: { createMany },
        drawStatistic: { create: createStatistic },
      }),
    );
    const prisma = {
      draw: { findFirst: vi.fn().mockResolvedValue(draw) },
      $transaction: transaction,
    } as never;
    const publish = vi.fn().mockResolvedValue(1);
    const redis = { publish } as never;
    const scheduler = new DrawSchedulerService(prisma, redis);

    await scheduler.processDrawLifecycle();

    expect(transaction).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith({
      where: { id: draw.id },
      data: { status: 'SETTLEMENT_PENDING', resultAt: expect.any(Date) },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: generatedResult.balls.map((ball) => ({
        ...ball,
        drawId: draw.id,
      })),
    });
    expect(createStatistic).toHaveBeenCalledWith({
      data: {
        drawId: draw.id,
        totalSum: generatedResult.totalSum,
        has49: generatedResult.has49,
        majorityColor: generatedResult.majorityColor,
      },
    });
    expect(publish).toHaveBeenCalledWith(
      'lucky-six:events',
      expect.objectContaining({ event: 'draw.completed' }),
    );
  });
});
