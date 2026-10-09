import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:Ayomidemuiz20@muiz-dev-solutions-db.cdkwoegsgo9h.eu-north-1.rds.amazonaws.com:5432/lucky6?sslmode=no-verify';
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

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

  console.log('\n✅ Seeding completed successfully!');
  console.log('   Markets seeded: 2 (First Ball Color, Sum Over/Under)');
  console.log('   Selections seeded: 6 (4 colors + 2 sum options)');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
