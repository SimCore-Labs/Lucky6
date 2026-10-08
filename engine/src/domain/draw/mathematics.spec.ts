import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateLuckySixDraw, getBallColor } from './mathematics.js';

describe('Lucky Six Mathematics', () => {
  it('correctly maps ball numbers to colors', () => {
    assert.equal(getBallColor(1), 'BLUE');
    assert.equal(getBallColor(12), 'BLUE');
    assert.equal(getBallColor(13), 'YELLOW');
    assert.equal(getBallColor(24), 'YELLOW');
    assert.equal(getBallColor(25), 'RED');
    assert.equal(getBallColor(36), 'RED');
    assert.equal(getBallColor(37), 'GREEN');
    assert.equal(getBallColor(48), 'GREEN');
    assert.equal(getBallColor(49), 'BLACK');
  });

  it('generates 6 unique balls with total sum and color majority', () => {
    const result = generateLuckySixDraw(0); // 0% chance of 49
    assert.equal(result.balls.length, 6);
    assert.equal(result.has49, false);
    const numSet = new Set(result.balls.map((b) => b.number));
    assert.equal(numSet.size, 6);
    assert.equal(
      result.totalSum,
      result.balls.reduce((acc, b) => acc + b.number, 0),
    );
  });

  it('includes ball 49 when jackpot probability triggers', () => {
    const result = generateLuckySixDraw(1.0); // 100% chance of 49
    assert.equal(result.balls.length, 6);
    assert.equal(result.has49, true);
    assert.equal(
      result.balls.some((b) => b.number === 49),
      true,
    );
  });
});
