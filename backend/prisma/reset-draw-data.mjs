import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

if (!process.argv.includes('--confirm-reset-draw-data')) {
  throw new Error('Pass --confirm-reset-draw-data to delete draws and their bets.');
}

if (!process.argv.includes('--services-stopped')) {
  throw new Error('Stop all Lucky Six backend services before resetting draw data.');
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL must be configured before resetting draw data.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

try {
  const draws = await prisma.draw.findMany({ select: { id: true } });
  const drawIds = draws.map((draw) => draw.id);
  const bets = drawIds.length
    ? await prisma.bet.findMany({
        where: { drawId: { in: drawIds } },
        select: { id: true },
      })
    : [];
  const betIds = bets.map((bet) => bet.id);

  const deleted = await prisma.$transaction(async (tx) => {
    const settlements = betIds.length
      ? await tx.settlement.deleteMany({
          where: { betId: { in: betIds } },
        })
      : { count: 0 };
    const betSelections = betIds.length
      ? await tx.betSelection.deleteMany({
          where: { betId: { in: betIds } },
        })
      : { count: 0 };
    const deletedBets = drawIds.length
      ? await tx.bet.deleteMany({
          where: { drawId: { in: drawIds } },
        })
      : { count: 0 };
    const statistics = drawIds.length
      ? await tx.drawStatistic.deleteMany({
          where: { drawId: { in: drawIds } },
        })
      : { count: 0 };
    const balls = drawIds.length
      ? await tx.drawBall.deleteMany({
          where: { drawId: { in: drawIds } },
        })
      : { count: 0 };
    const deletedDraws = drawIds.length
      ? await tx.draw.deleteMany({
          where: { id: { in: drawIds } },
        })
      : { count: 0 };

    return {
      draws: deletedDraws.count,
      balls: balls.count,
      statistics: statistics.count,
      bets: deletedBets.count,
      betSelections: betSelections.count,
      settlements: settlements.count,
    };
  });

  console.info(
    `Reset draw data: ${JSON.stringify(deleted)}. Wallets, balances, payments, and ledger entries were preserved.`,
  );
} finally {
  await prisma.$disconnect();
}
