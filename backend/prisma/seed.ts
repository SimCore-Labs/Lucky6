import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding market catalogue and pricing configuration...');

  // 1. Pricing Config
  await prisma.pricingConfig.upsert({
    where: { key: 'default' },
    update: {},
    create: {
      key: 'default',
      houseMargin: 0.08, // 8% default margin
      exposureFactor: 0.05,
      parameters: {
        jackpotAppearanceProbability: 0.02,
      },
    },
  });

  // 2. Individual Numbers Market (1 - 48)
  const numMarket = await prisma.market.upsert({
    where: { type: 'INDIVIDUAL_NUMBER' },
    update: {},
    create: {
      type: 'INDIVIDUAL_NUMBER',
      title: 'Individual Numbers',
      description: 'Bet on whether a specific number (1-48) is drawn.',
      active: true,
    },
  });

  for (let i = 1; i <= 48; i++) {
    const val = i.toString();
    await prisma.marketSelection.upsert({
      where: {
        marketId_value: {
          marketId: numMarket.id,
          value: val,
        },
      },
      update: {},
      create: {
        marketId: numMarket.id,
        value: val,
        label: `Number ${val}`,
      },
    });
  }

  // 3. Black 49 / Jackpot Market
  const jackpotMarket = await prisma.market.upsert({
    where: { type: 'BLACK_JACKPOT' },
    update: {},
    create: {
      type: 'BLACK_JACKPOT',
      title: '49 Black Jackpot',
      description: 'Bet on whether ball 49 (Black Jackpot) appears in the draw.',
      active: true,
    },
  });

  for (const [val, label] of [
    ['YES', 'Ball 49 Appears'],
    ['NO', 'No Ball 49'],
  ]) {
    await prisma.marketSelection.upsert({
      where: {
        marketId_value: {
          marketId: jackpotMarket.id,
          value: val,
        },
      },
      update: {},
      create: {
        marketId: jackpotMarket.id,
        value: val,
        label,
      },
    });
  }

  // 4. Color Majority Market
  const colorMajorityMarket = await prisma.market.upsert({
    where: { type: 'COLOR_MAJORITY' },
    update: {},
    create: {
      type: 'COLOR_MAJORITY',
      title: 'Color Majority',
      description: 'Which color will have the majority of drawn balls?',
      active: true,
    },
  });

  for (const [val, label] of [
    ['BLUE', 'Blue Majority'],
    ['YELLOW', 'Yellow Majority'],
    ['RED', 'Red Majority'],
    ['GREEN', 'Green Majority'],
    ['NO_MAJORITY', 'No Majority / Tie'],
  ]) {
    await prisma.marketSelection.upsert({
      where: {
        marketId_value: {
          marketId: colorMajorityMarket.id,
          value: val,
        },
      },
      update: {},
      create: {
        marketId: colorMajorityMarket.id,
        value: val,
        label,
      },
    });
  }

  // 5. Sum High / Mid / Low Market
  const sumHmlMarket = await prisma.market.upsert({
    where: { type: 'SUM_HIGH_MID_LOW' },
    update: {},
    create: {
      type: 'SUM_HIGH_MID_LOW',
      title: 'Total Sum (High/Mid/Low)',
      description: 'Total sum of drawn ball numbers.',
      active: true,
    },
  });

  for (const [val, label] of [
    ['LOW', 'Low (15 - 120)'],
    ['MID', 'Mid (121 - 170)'],
    ['HIGH', 'High (171 - 280)'],
  ]) {
    await prisma.marketSelection.upsert({
      where: {
        marketId_value: {
          marketId: sumHmlMarket.id,
          value: val,
        },
      },
      update: {},
      create: {
        marketId: sumHmlMarket.id,
        value: val,
        label,
      },
    });
  }

  // 6. Sum Odd / Even Market
  const sumOddEvenMarket = await prisma.market.upsert({
    where: { type: 'SUM_ODD_EVEN' },
    update: {},
    create: {
      type: 'SUM_ODD_EVEN',
      title: 'Total Sum Odd or Even',
      description: 'Is the total sum of drawn ball numbers Odd or Even?',
      active: true,
    },
  });

  for (const [val, label] of [
    ['ODD', 'Sum is Odd'],
    ['EVEN', 'Sum is Even'],
  ]) {
    await prisma.marketSelection.upsert({
      where: {
        marketId_value: {
          marketId: sumOddEvenMarket.id,
          value: val,
        },
      },
      update: {},
      create: {
        marketId: sumOddEvenMarket.id,
        value: val,
        label,
      },
    });
  }

  // 7. First Ball Color Market
  const firstBallColorMarket = await prisma.market.upsert({
    where: { type: 'FIRST_BALL_COLOR' },
    update: {},
    create: {
      type: 'FIRST_BALL_COLOR',
      title: 'First Ball Color',
      description: 'The color of the first drawn ball.',
      active: true,
    },
  });

  for (const color of ['BLUE', 'YELLOW', 'RED', 'GREEN', 'BLACK']) {
    await prisma.marketSelection.upsert({
      where: {
        marketId_value: {
          marketId: firstBallColorMarket.id,
          value: color,
        },
      },
      update: {},
      create: {
        marketId: firstBallColorMarket.id,
        value: color,
        label: `${color} First Ball`,
      },
    });
  }

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
