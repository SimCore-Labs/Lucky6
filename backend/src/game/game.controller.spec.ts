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

  describe('GameController draw results', () => {
    it('returns recent results and statistics from completed draws', async () => {
      const latestDraw = {
        id: 'latest-result',
        drawNumber: 10,
        resultAt: new Date('2026-10-14T12:00:00.000Z'),
        balls: [
          { number: 49, color: 'BLACK', orderIndex: 5 },
          { number: 1, color: 'RED', orderIndex: 0 },
          { number: 2, color: 'BLUE', orderIndex: 1 },
          { number: 3, color: 'GREEN', orderIndex: 2 },
          { number: 24, color: 'RED', orderIndex: 3 },
          { number: 25, color: 'BLUE', orderIndex: 4 },
        ],
        statistics: { totalSum: 104, has49: true, majorityColor: null },
      };
      const previousDraw = {
        id: 'previous-result',
        drawNumber: 9,
        resultAt: new Date('2026-10-14T11:55:00.000Z'),
        balls: [
          { number: 1, color: 'RED', orderIndex: 0 },
          { number: 4, color: 'RED', orderIndex: 1 },
          { number: 5, color: 'BLUE', orderIndex: 2 },
          { number: 6, color: 'GREEN', orderIndex: 3 },
          { number: 7, color: 'RED', orderIndex: 4 },
          { number: 8, color: 'BLUE', orderIndex: 5 },
        ],
        statistics: { totalSum: 31, has49: false, majorityColor: 'RED' },
      };
      const findMany = vi.fn().mockResolvedValue([latestDraw, previousDraw]);
      const queryRaw = vi.fn().mockResolvedValue([
        { number: 1, lastDrawNumber: 9 },
        { number: 2, lastDrawNumber: 10 },
        { number: 3, lastDrawNumber: 10 },
        { number: 4, lastDrawNumber: 9 },
        { number: 5, lastDrawNumber: 9 },
        { number: 6, lastDrawNumber: 9 },
        { number: 7, lastDrawNumber: 9 },
        { number: 8, lastDrawNumber: 9 },
        { number: 49, lastDrawNumber: 10 },
      ]);
      const prisma = {
        draw: { findMany },
        $queryRaw: queryRaw,
      } as unknown as PrismaService;
      const controller = new GameController(prisma);

      const response = await controller.getDrawResults('1');

      expect(findMany).toHaveBeenCalledWith({
        where: {
          status: { in: ['RESULT_READY', 'SETTLEMENT_PENDING', 'SETTLED'] },
          balls: { some: {} },
        },
        orderBy: { drawNumber: 'desc' },
        take: 20,
        include: { balls: true, statistics: true },
      });
      expect(queryRaw).toHaveBeenCalledOnce();
      expect(response.results).toEqual([
        {
          id: 'latest-result',
          drawNumber: 10,
          resultAt: latestDraw.resultAt.toISOString(),
          balls: [...latestDraw.balls].sort(
            (first, second) => first.orderIndex - second.orderIndex,
          ),
          totalSum: 104,
          winningColor: 'DRAW',
        },
      ]);
      expect(response.statistics).toMatchObject({
        drawsAnalyzed: 2,
        hotNumbers: [
          { number: 1, count: 2 },
          { number: 2, count: 1 },
          { number: 3, count: 1 },
          { number: 4, count: 1 },
          { number: 5, count: 1 },
        ],
        lateNumbers: expect.arrayContaining([{ number: 1, delay: 1 }]),
        maxDelay: 1,
        winningColors: { DRAW: 1, RED: 1, BLUE: 0, GREEN: 0, YELLOW: 0 },
        sumBands: { LOW: 2, MID: 0, HIGH: 0 },
      });
    });

    it('rejects a result limit outside the supported range', async () => {
      const controller = new GameController({} as PrismaService);

      await expect(controller.getDrawResults('51')).rejects.toThrow(
        'Limit must be an integer between 1 and 50.',
      );
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
