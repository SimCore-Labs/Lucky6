import type { BallColor } from '@lucky-six/contracts';

export interface GeneratedBall {
  number: number;
  color: BallColor;
  orderIndex: number;
}

export interface DrawMathematicsResult {
  balls: GeneratedBall[];
  totalSum: number;
  has49: boolean;
  majorityColor: BallColor | null;
}

/**
 * Assigns color based on Lucky Six rules:
 * Numbers 1-48 repeat RED, BLUE, GREEN.
 * 49: BLACK
 */
export function getBallColor(number: number): BallColor {
  if (number === 49) return 'BLACK';
  if (Number.isInteger(number) && number >= 1 && number <= 48) {
    return (['RED', 'BLUE', 'GREEN'] as const)[(number - 1) % 3];
  }
  throw new Error(`Invalid ball number: ${number}`);
}

/**
 * Deterministically or pseudo-randomly generates 6 distinct balls for Lucky Six.
 * - Balls 1-48 are normal.
 * - Ball 49 is Black Jackpot, appearing with `jackpotProbability` probability.
 */
export function generateLuckySixDraw(
  jackpotProbability = 0.02,
  randomFn: () => number = Math.random,
): DrawMathematicsResult {
  const selectedNumbers: number[] = [];
  const include49 = randomFn() < jackpotProbability;

  const pool: number[] = [];
  for (let i = 1; i <= 48; i++) {
    pool.push(i);
  }

  // Shuffle pool using Fisher-Yates
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    const temp = pool[i];
    pool[i] = pool[j];
    pool[j] = temp;
  }

  if (include49) {
    // Replace one slot with 49
    selectedNumbers.push(...pool.slice(0, 5));
    selectedNumbers.push(49);
    // Shuffle final 6 order
    for (let i = selectedNumbers.length - 1; i > 0; i--) {
      const j = Math.floor(randomFn() * (i + 1));
      const temp = selectedNumbers[i];
      selectedNumbers[i] = selectedNumbers[j];
      selectedNumbers[j] = temp;
    }
  } else {
    selectedNumbers.push(...pool.slice(0, 6));
  }

  let totalSum = 0;
  let has49 = false;
  const colorCounts: Record<string, number> = {
    RED: 0,
    BLUE: 0,
    GREEN: 0,
    BLACK: 0,
  };

  const balls: GeneratedBall[] = selectedNumbers.map((num, idx) => {
    const color = getBallColor(num);
    totalSum += num;
    if (num === 49) has49 = true;
    colorCounts[color] = (colorCounts[color] || 0) + 1;
    return {
      number: num,
      color,
      orderIndex: idx,
    };
  });

  // Determine the majority among normal colors; black does not participate.
  let majorityColor: BallColor | null = null;
  let maxCount = 0;
  for (const c of ['RED', 'BLUE', 'GREEN'] as BallColor[]) {
    if (colorCounts[c] > maxCount) {
      maxCount = colorCounts[c];
      majorityColor = c;
    } else if (colorCounts[c] === maxCount && maxCount > 0) {
      majorityColor = null; // Tie
    }
  }

  return {
    balls,
    totalSum,
    has49,
    majorityColor,
  };
}
