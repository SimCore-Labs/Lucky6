import { PrismaClient } from '../src/generated/prisma/client.js';
import 'dotenv/config';
import { createTursoAdapter } from '../src/prisma/turso-adapter.js';
import {
  calculateDecimalOdds,
  calculateMarketProbabilities,
  probabilityForSelection,
} from '../src/pricing/market-pricing.js';

const prisma = new PrismaClient({
  adapter: createTursoAdapter(
    process.env.DATABASE_URL,
    process.env.TURSO_AUTH_TOKEN,
  ),
});

async function upsertOddsForSelection(selectionId: string, oddsValue: number) {
  // Check if an odds record already exists for this selection at version 1
  const existing = await prisma.marketOdds.findFirst({
    where: { selectionId, version: 1 },
  });
  if (!existing) {
    await prisma.marketOdds.create({
      data: { selectionId, oddsValue, version: 1 },
    });
  }
}

async function seedMarket(
  type: string,
  title: string,
  description: string,
  selections: { value: string; label: string }[],
) {
  const market = await prisma.market.upsert({
    where: { type },
    update: { title, description, active: true },
    create: { type, title, description, active: true },
  });
  const probabilities = calculateMarketProbabilities();

  for (const item of selections) {
    const selection = await prisma.marketSelection.upsert({
      where: { marketId_value: { marketId: market.id, value: item.value } },
      update: { label: item.label },
      create: { marketId: market.id, value: item.value, label: item.label },
    });
    const probability = probabilityForSelection(type, item.value, probabilities);
    const odds = probability
      ? calculateDecimalOdds(probability, 0.08)
      : null;
    if (odds === null) {
      throw new Error(`No valid price for seeded selection ${type}:${item.value}.`);
    }
    await upsertOddsForSelection(selection.id, odds);
  }

  return market;
}

async function main() {
  console.log('Seeding Database...');

  // ─── 1. Markets ───────────────────────────────────────────────
  const firstBallColor = await prisma.market.upsert({
    where: { type: 'FIRST_BALL_COLOR' },
    update: {},
    create: {
      title: 'First Ball Color',
      description: 'Predict the color of the first drawn ball.',
      type: 'FIRST_BALL_COLOR',
      active: true,
    },
  });

  const sumOverUnder = await prisma.market.upsert({
    where: { type: 'SUM_OVER_UNDER' },
    update: {},
    create: {
      title: 'Sum Over/Under 122.5',
      description: 'Predict if the total of the 6 drawn balls will be over or under 122.5.',
      type: 'SUM_OVER_UNDER',
      active: true,
    },
  });

  console.log(`  Markets upserted: ${firstBallColor.id}, ${sumOverUnder.id}`);

  // ─── 2. Selections & Odds for First Ball Color ─────────────────
  const colors = [
    { value: 'RED', label: 'Red', odds: 2.77 },
    { value: 'BLUE', label: 'Blue', odds: 2.77 },
    { value: 'GREEN', label: 'Green', odds: 2.77 },
    { value: 'BLACK', label: 'Black Jackpot (49)', odds: 276.0 },
  ];

  for (const color of colors) {
    // Upsert by composite unique key [marketId, value]
    const selection = await prisma.marketSelection.upsert({
      where: { marketId_value: { marketId: firstBallColor.id, value: color.value } },
      update: { label: color.label },
      create: {
        marketId: firstBallColor.id,
        value: color.value,
        label: color.label,
      },
    });
    await upsertOddsForSelection(selection.id, color.odds);
    console.log(`  Selection upserted: ${color.label}`);
  }

  // ─── 3. Selections & Odds for Sum Over/Under ───────────────────
  // With 6 balls drawn from 1–48 range (+49 black), average total ≈ 122.5
  const sumOptions = [
    { value: 'OVER',  label: 'Over 122.5',  odds: 1.9 },
    { value: 'UNDER', label: 'Under 122.5', odds: 1.9 },
  ];

  for (const opt of sumOptions) {
    const selection = await prisma.marketSelection.upsert({
      where: { marketId_value: { marketId: sumOverUnder.id, value: opt.value } },
      update: { label: opt.label },
      create: {
        marketId: sumOverUnder.id,
        value: opt.value,
        label: opt.label,
      },
    });
    await upsertOddsForSelection(selection.id, opt.odds);
    console.log(`  Selection upserted: ${opt.label}`);
  }

  await seedMarket(
    'INDIVIDUAL_NUMBER',
    'Number appears',
    'Predict one number that appears in the six-ball draw.',
    Array.from({ length: 49 }, (_, index) => {
      const number = index + 1;
      return { value: String(number), label: `Number ${number}` };
    }),
  );
  await seedMarket(
    'BLACK_JACKPOT',
    'Black jackpot',
    'Predict whether ball 49 appears in the draw.',
    [
      { value: 'YES', label: '49 appears' },
      { value: 'NO', label: '49 does not appear' },
    ],
  );
  await seedMarket(
    'COLOR_MAJORITY',
    'Majority color',
    'Predict which normal color appears most often; tied counts are no majority.',
    [
      { value: 'RED', label: 'Red' },
      { value: 'BLUE', label: 'Blue' },
      { value: 'GREEN', label: 'Green' },
      { value: 'NO_MAJORITY', label: 'No majority' },
    ],
  );
  await seedMarket(
    'SUM_HIGH_MID_LOW',
    'Total sum band',
    'Predict the range containing the sum of all six numbers.',
    [
      { value: 'LOW', label: 'Low (21–120)' },
      { value: 'MID', label: 'Mid (121–170)' },
      { value: 'HIGH', label: 'High (171–279)' },
    ],
  );
  await seedMarket(
    'SUM_ODD_EVEN',
    'Total sum parity',
    'Predict whether the total of all six numbers is odd or even.',
    [
      { value: 'ODD', label: 'Odd' },
      { value: 'EVEN', label: 'Even' },
    ],
  );
  await seedMarket(
    'SUM_OVER_UNDER',
    'Sum Over/Under 122.5',
    'Predict whether the total of all six drawn numbers is over or under 122.5.',
    [
      { value: 'OVER', label: 'Over 122.5' },
      { value: 'UNDER', label: 'Under 122.5' },
    ],
  );
  await seedMarket(
    'COLOR_COUNT',
    'Exact color count',
    'Predict the exact count of a selected color among the six drawn balls.',
    [
      ...(['RED', 'BLUE', 'GREEN'] as const).flatMap((color) =>
        Array.from({ length: 7 }, (_, count) => ({
          value: `${color}:${count}`,
          label: `Exactly ${count} ${color}`,
        })),
      ),
      { value: 'BLACK:1', label: 'Exactly 1 BLACK' },
    ],
  );
  await prisma.market.upsert({
    where: { type: 'PICK_SIX' },
    update: {
      title: 'Pick six numbers',
      description: 'Pick six numbers; win a tier by matching at least three.',
      active: true,
    },
    create: {
      type: 'PICK_SIX',
      title: 'Pick six numbers',
      description: 'Pick six numbers; win a tier by matching at least three.',
      active: true,
    },
  });

  console.log('\n✅ Seeding completed successfully!');
  console.log('   Markets seeded: 9');
  console.log('   Added number, jackpot, majority, sum, color-count, and pick-six markets.');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
