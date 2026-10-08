import { describe, it, expect } from 'vitest';
import { generateLuckySixDraw, getBallColor } from './mathematics.js';

describe('Lucky Six Mathematics', () => {
  it('correctly maps ball numbers to colors', () => {
    expect(getBallColor(1)).toBe('BLUE');
    expect(getBallColor(12)).toBe('BLUE');
    expect(getBallColor(13)).toBe('YELLOW');
    expect(getBallColor(24)).toBe('YELLOW');
    expect(getBallColor(25)).toBe('RED');
    expect(getBallColor(36)).toBe('RED');
    expect(getBallColor(37)).toBe('GREEN');
    expect(getBallColor(48)).toBe('GREEN');
    expect(getBallColor(49)).toBe('BLACK');
  });

  it('generates 6 unique balls with total sum and color majority', () => {
    const result = generateLuckySixDraw(0); // 0% chance of 49
    expect(result.balls.length).toBe(6);
    expect(result.has49).toBe(false);
    const numSet = new Set(result.balls.map((b) => b.number));
    expect(numSet.size).toBe(6);
    expect(result.totalSum).toBe(
      result.balls.reduce((acc, b) => acc + b.number, 0),
    );
  });

  it('includes ball 49 when jackpot probability triggers', () => {
    const result = generateLuckySixDraw(1.0); // 100% chance of 49
    expect(result.balls.length).toBe(6);
    expect(result.has49).toBe(true);
    expect(result.balls.some((b) => b.number === 49)).toBe(true);
  });
});
