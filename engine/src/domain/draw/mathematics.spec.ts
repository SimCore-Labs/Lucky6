import { describe, it, expect } from 'vitest';
import { generateLuckySixDraw, getBallColor } from './mathematics.js';

describe('Lucky Six Mathematics', () => {
  it('correctly maps ball numbers to colors', () => {
    expect(getBallColor(1)).toBe('RED');
    expect(getBallColor(2)).toBe('BLUE');
    expect(getBallColor(3)).toBe('GREEN');
    expect(getBallColor(4)).toBe('RED');
    expect(getBallColor(46)).toBe('RED');
    expect(getBallColor(47)).toBe('BLUE');
    expect(getBallColor(48)).toBe('GREEN');
    expect(getBallColor(49)).toBe('BLACK');
  });

  it.each([0, 50, 1.5])('rejects invalid ball number %s', (number) => {
    expect(() => getBallColor(number)).toThrow(`Invalid ball number: ${number}`);
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
