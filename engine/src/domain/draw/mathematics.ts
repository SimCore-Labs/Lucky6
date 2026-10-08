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
 * 1-12: BLUE
 * 13-24: YELLOW
 * 25-36: RED
 * 37-48: GREEN
 * 49: BLACK
 */
export function getBallColor(number: number): BallColor {
  if (number === 49) return 'BLACK';
  if (number >= 1 && number <= 12) return 'BLUE';
  if (number >= 13 && number <= 24) return 'YELLOW';
  if (number >= 25 && number <= 36) return 'RED';
  if (number >= 37 && number <= 48) return 'GREEN';
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
    BLUE: 0,
    YELLOW: 0,
    RED: 0,
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

  // Determine majority color among normal colors (BLUE, YELLOW, RED, GREEN)
  let majorityColor: BallColor | null = null;
  let maxCount = 0;
  for (const c of ['BLUE', 'YELLOW', 'RED', 'GREEN'] as BallColor[]) {
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
