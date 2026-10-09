import { NotFoundException } from '@nestjs/common';
import { GameController } from './game.controller.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('GameController current draw', () => {
  it('reads the engine-owned active draw states without creating draws', async () => {
    const draw = {
      id: 'draw-id',
      drawNumber: 10001,
      status: 'CLOSED',
      openAt: new Date('2026-10-09T15:00:00.000Z'),
      closeAt: new Date('2026-10-09T15:04:00.000Z'),
      drawAt: new Date('2026-10-09T15:04:30.000Z'),
      resultAt: null,
      balls: [],
      statistics: null,
    };
    const latestDraw = {
      ...draw,
      id: 'result-draw-id',
      drawNumber: 10000,
      status: 'SETTLED',
      resultAt: new Date('2026-10-09T15:04:35.000Z'),
      balls: [
        { number: 3, color: 'GREEN', orderIndex: 0 },
        { number: 14, color: 'BLUE', orderIndex: 1 },
        { number: 25, color: 'BLUE', orderIndex: 2 },
        { number: 32, color: 'BLUE', orderIndex: 3 },
        { number: 41, color: 'BLUE', orderIndex: 4 },
        { number: 48, color: 'GREEN', orderIndex: 5 },
      ],
      statistics: { totalSum: 163, has49: false, majorityColor: 'BLUE' },
    };
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(draw)
      .mockResolvedValueOnce(latestDraw);
    const prisma = {
      draw: { findFirst },
    } as unknown as PrismaService;
    const controller = new GameController(prisma);

    await expect(controller.getCurrentDraw()).resolves.toEqual({
      id: draw.id,
      drawNumber: draw.drawNumber,
      status: draw.status,
      openAt: draw.openAt.toISOString(),
      closeAt: draw.closeAt.toISOString(),
      drawAt: draw.drawAt.toISOString(),
      resultAt: null,
      balls: [],
      statistics: null,
      latestResult: {
        id: latestDraw.id,
        drawNumber: latestDraw.drawNumber,
        resultAt: latestDraw.resultAt.toISOString(),
        balls: latestDraw.balls,
        statistics: latestDraw.statistics,
      },
    });
    expect(findFirst).toHaveBeenNthCalledWith(1, {
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
    expect(findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        status: { in: ['RESULT_READY', 'SETTLEMENT_PENDING', 'SETTLED'] },
        balls: { some: {} },
      },
      orderBy: { drawNumber: 'desc' },
      include: { balls: true, statistics: true },
    });
  });

  describe('GameController markets', () => {
    it('does not return selections with inactive odds', async () => {
      const findMany = vi.fn().mockResolvedValue([
        {
          id: 'market-id',
          type: 'FIRST_BALL_COLOR',
          title: 'First Ball Color',
          description: 'Predict the first ball color.',
          selections: [
            {
              id: 'red-id',
              value: 'RED',
              label: 'Red',
              odds: [{ oddsValue: 2.77, version: 2 }],
            },
            {
              id: 'yellow-id',
              value: 'YELLOW',
              label: 'Yellow',
              odds: [],
            },
          ],
        },
      ]);
      const prisma = {
        market: { findMany },
      } as unknown as PrismaService;
      const controller = new GameController(prisma);

      await expect(controller.getMarkets()).resolves.toEqual([
        {
          id: 'market-id',
          type: 'FIRST_BALL_COLOR',
          title: 'First Ball Color',
          description: 'Predict the first ball color.',
          selections: [
            {
              id: 'red-id',
              value: 'RED',
              label: 'Red',
              currentOdds: 2.77,
              oddsVersion: 2,
            },
          ],
        },
      ]);
    });
  });

  it('returns not found when the engine has not created an active draw', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = {
      draw: { findFirst },
    } as unknown as PrismaService;
    const controller = new GameController(prisma);

    await expect(controller.getCurrentDraw()).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});
