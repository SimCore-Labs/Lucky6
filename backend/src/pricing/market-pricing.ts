export const PICK_SIX_SCHEDULE_VERSION = 1;
export const MAX_BET_STAKE = 50n;
export const MAX_GROSS_PAYOUT = 1_000_000n;

export const PICK_SIX_TIER_MULTIPLIERS = {
  excludes49: { 3: 31, 4: 250, 5: 4_000, 6: 5_000 },
  includes49: { 3: 54, 4: 450, 5: 15_000, 6: 20_000 },
} as const;

export interface MarketProbabilities {
  individualNumber: number;
  blackJackpot: number;
  colorMajority: Record<string, number>;
  sumHighMidLow: Record<string, number>;
  sumOverUnder: Record<string, number>;
  sumOddEven: Record<string, number>;
  firstBallColor: Record<string, number>;
  colorCount: Record<string, number[]>;
}

function combination(total: number, selected: number): number {
  if (selected < 0 || selected > total) return 0;
  let result = 1;
  const count = Math.min(selected, total - selected);
  for (let index = 1; index <= count; index++) {
    result = (result * (total - count + index)) / index;
  }
  return result;
}

function sumDistribution(selectedCount: 5 | 6): Map<number, number> {
  const counts = Array.from(
    { length: selectedCount + 1 },
    () => new Map<number, number>(),
  );
  counts[0].set(0, 1);

  for (let number = 1; number <= 48; number++) {
    for (
      let count = Math.min(selectedCount, number);
      count >= 1;
      count--
    ) {
      for (const [sum, ways] of counts[count - 1]) {
        const nextSum = sum + number;
        counts[count].set(nextSum, (counts[count].get(nextSum) ?? 0) + ways);
      }
    }
  }

  return counts[selectedCount];
}

function colorMajorityProbabilities(normalBallCount: 5 | 6) {
  const outcomes: Record<string, number> = {
    RED: 0,
    BLUE: 0,
    GREEN: 0,
    NO_MAJORITY: 0,
  };
  const totalCombinations = combination(48, normalBallCount);

  for (let red = 0; red <= normalBallCount; red++) {
    for (let blue = 0; blue <= normalBallCount - red; blue++) {
      const green = normalBallCount - red - blue;
      const ways =
        combination(16, red) *
        combination(16, blue) *
        combination(16, green);
      const counts = [red, blue, green];
      const maximum = Math.max(...counts);
      const winners = counts.filter((count) => count === maximum).length;
      const outcome =
        winners === 1
          ? ['RED', 'BLUE', 'GREEN'][counts.indexOf(maximum)]
          : 'NO_MAJORITY';
      outcomes[outcome] += ways / totalCombinations;
    }
  }

  return outcomes;
}

function exactColorCount(normalBallCount: 5 | 6): number[] {
  const totalCombinations = combination(48, normalBallCount);
  return Array.from({ length: 7 }, (_, count) => {
    return (
      (combination(16, count) *
        combination(32, normalBallCount - count)) /
      totalCombinations
    );
  });
}

function weightedSumProbability(
  normalDistribution: Map<number, number>,
  jackpotDistribution: Map<number, number>,
  probability: number,
  condition: (sum: number) => boolean,
): number {
  const normalTotal = combination(48, 6);
  const jackpotTotal = combination(48, 5);
  let normalCount = 0;
  let jackpotCount = 0;

  for (const [sum, ways] of normalDistribution) {
    if (condition(sum)) normalCount += ways;
  }
  for (const [sum, ways] of jackpotDistribution) {
    if (condition(sum + 49)) jackpotCount += ways;
  }

  return (
    ((1 - probability) * normalCount) / normalTotal +
    (probability * jackpotCount) / jackpotTotal
  );
}

export function calculateMarketProbabilities(
  jackpotProbability = 0.02,
): MarketProbabilities {
  if (
    !Number.isFinite(jackpotProbability) ||
    jackpotProbability < 0 ||
    jackpotProbability > 1
  ) {
    throw new Error('Jackpot probability must be between 0 and 1.');
  }

  const normalSumDistribution = sumDistribution(6);
  const jackpotSumDistribution = sumDistribution(5);
  const normalMajority = colorMajorityProbabilities(6);
  const jackpotMajority = colorMajorityProbabilities(5);
  const normalColorCount = exactColorCount(6);
  const jackpotColorCount = exactColorCount(5);
  const mix = (normal: number, jackpot: number) =>
    (1 - jackpotProbability) * normal + jackpotProbability * jackpot;

  const sumHighMidLow = {
    LOW: weightedSumProbability(
      normalSumDistribution,
      jackpotSumDistribution,
      jackpotProbability,
      (sum) => sum >= 21 && sum <= 120,
    ),
    MID: weightedSumProbability(
      normalSumDistribution,
      jackpotSumDistribution,
      jackpotProbability,
      (sum) => sum >= 121 && sum <= 170,
    ),
    HIGH: weightedSumProbability(
      normalSumDistribution,
      jackpotSumDistribution,
      jackpotProbability,
      (sum) => sum >= 171 && sum <= 279,
    ),
  };

  const sumOverUnder = {
    UNDER: weightedSumProbability(
      normalSumDistribution,
      jackpotSumDistribution,
      jackpotProbability,
      (sum) => sum <= 122,
    ),
    OVER: weightedSumProbability(
      normalSumDistribution,
      jackpotSumDistribution,
      jackpotProbability,
      (sum) => sum >= 123,
    ),
  };

  const sumOddEven = {
    ODD: weightedSumProbability(
      normalSumDistribution,
      jackpotSumDistribution,
      jackpotProbability,
      (sum) => sum % 2 === 1,
    ),
    EVEN: weightedSumProbability(
      normalSumDistribution,
      jackpotSumDistribution,
      jackpotProbability,
      (sum) => sum % 2 === 0,
    ),
  };

  const colors = ['RED', 'BLUE', 'GREEN'];
  const colorCount = Object.fromEntries(
    colors.map((color) => [
      color,
      normalColorCount.map((normal, count) =>
        mix(normal, jackpotColorCount[count]),
      ),
    ]),
  );

  return {
    individualNumber: ((1 - jackpotProbability) * 6 + jackpotProbability * 5) / 48,
    blackJackpot: jackpotProbability,
    colorMajority: Object.fromEntries(
      Object.keys(normalMajority).map((outcome) => [
        outcome,
        mix(normalMajority[outcome], jackpotMajority[outcome]),
      ]),
    ),
    sumHighMidLow,
    sumOverUnder,
    sumOddEven,
    firstBallColor: {
      RED: (1 - jackpotProbability) / 3 + (jackpotProbability * 5) / 18,
      BLUE: (1 - jackpotProbability) / 3 + (jackpotProbability * 5) / 18,
      GREEN: (1 - jackpotProbability) / 3 + (jackpotProbability * 5) / 18,
      BLACK: jackpotProbability / 6,
    },
    colorCount: {
      ...colorCount,
      BLACK: [1 - jackpotProbability, jackpotProbability],
    },
  };
}

export function probabilityForSelection(
  marketType: string,
  value: string,
  probabilities: MarketProbabilities,
): number | null {
  if (marketType === 'INDIVIDUAL_NUMBER') {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1 || number > 49) return null;
    return number === 49
      ? probabilities.blackJackpot
      : probabilities.individualNumber;
  }

  if (marketType === 'BLACK_JACKPOT') {
    if (value === 'YES') return probabilities.blackJackpot;
    if (value === 'NO') return 1 - probabilities.blackJackpot;
    return null;
  }

  if (marketType === 'COLOR_MAJORITY') {
    return probabilities.colorMajority[value] ?? null;
  }

  if (marketType === 'SUM_HIGH_MID_LOW') {
    return probabilities.sumHighMidLow[value] ?? null;
  }

  if (marketType === 'SUM_OVER_UNDER') {
    return probabilities.sumOverUnder[value] ?? null;
  }

  if (marketType === 'SUM_ODD_EVEN') {
    return probabilities.sumOddEven[value] ?? null;
  }

  if (marketType === 'FIRST_BALL_COLOR') {
    return probabilities.firstBallColor[value] ?? null;
  }

  if (marketType === 'COLOR_COUNT') {
    const match = /^(RED|BLUE|GREEN):([0-6])$/.exec(value);
    if (match) {
      return probabilities.colorCount[match[1]][Number(match[2])];
    }
    if (value === 'BLACK:1') return probabilities.colorCount.BLACK[1];
    return null;
  }

  return null;
}

export function calculateDecimalOdds(
  probability: number,
  houseMargin: number,
): number | null {
  if (
    !Number.isFinite(probability) ||
    probability <= 0 ||
    probability > 1 ||
    !Number.isFinite(houseMargin) ||
    houseMargin < 0 ||
    houseMargin >= 1
  ) {
    return null;
  }

  const rawOdds = (1 - houseMargin) / probability;
  const roundedDown = Math.floor(rawOdds * 100 + 1e-9) / 100;
  return Math.max(roundedDown, 1.01);
}
