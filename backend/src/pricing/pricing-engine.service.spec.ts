import { PricingEngineService } from './pricing-engine.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  calculateDecimalOdds,
  calculateMarketProbabilities,
  probabilityForSelection,
} from './market-pricing.js';

describe('PricingEngineService base probabilities', () => {
  const service = new PricingEngineService({} as PrismaService);

  it('models three equal color groups and the jackpot draw branch', () => {
    const probabilities = service.calculateBaseProbabilities(0.02);
    const majorityTotal = Object.values(probabilities.colorMajority).reduce(
      (sum, probability) => sum + probability,
      0,
    );
    const firstBallTotal = Object.values(probabilities.firstBallColor).reduce(
      (sum, probability) => sum + probability,
      0,
    );

    expect(probabilities.colorMajority.RED).toBeCloseTo(
      probabilities.colorMajority.BLUE,
    );
    expect(probabilities.colorMajority.BLUE).toBeCloseTo(
      probabilities.colorMajority.GREEN,
    );
    expect(majorityTotal).toBeCloseTo(1);
    expect(firstBallTotal).toBeCloseTo(1);
    expect(probabilities.firstBallColor.BLACK).toBeCloseTo(0.02 / 6);
    expect(probabilities.firstBallColor.RED).toBeCloseTo(
      (1 - 0.02) / 3 + (0.02 * 5) / 18,
    );
  });

  it('calculates complete exact color-count and sum distributions', () => {
    const probabilities = calculateMarketProbabilities(0.02);

    for (const color of ['RED', 'BLUE', 'GREEN']) {
      expect(
        probabilities.colorCount[color].reduce(
          (sum, probability) => sum + probability,
          0,
        ),
      ).toBeCloseTo(1);
    }
    expect(
      Object.values(probabilities.sumHighMidLow).reduce(
        (sum, probability) => sum + probability,
        0,
      ),
    ).toBeCloseTo(1);
    expect(
      Object.values(probabilities.sumOverUnder).reduce(
        (sum, probability) => sum + probability,
        0,
      ),
    ).toBeCloseTo(1);
    expect(
      Object.values(probabilities.sumOddEven).reduce(
        (sum, probability) => sum + probability,
        0,
      ),
    ).toBeCloseTo(1);
    expect(probabilities.sumOverUnder.OVER).toBeCloseTo(0.77619614, 7);
    expect(probabilities.colorCount.RED[3]).toBeCloseTo(0.22506275, 7);
  });

  it('prices exact colors, over/under, and the jackpot number', () => {
    const probabilities = calculateMarketProbabilities();

    expect(
      probabilityForSelection('COLOR_COUNT', 'RED:3', probabilities),
    ).toBeCloseTo(0.22506275, 7);
    expect(
      probabilityForSelection('SUM_OVER_UNDER', 'UNDER', probabilities),
    ).toBeCloseTo(0.22380386, 7);
    expect(
      probabilityForSelection('INDIVIDUAL_NUMBER', '49', probabilities),
    ).toBe(0.02);
    expect(
      probabilityForSelection('UNKNOWN', 'YES', probabilities),
    ).toBeNull();
    expect(calculateDecimalOdds(0.02, 0.08)).toBe(46);
    expect(calculateDecimalOdds(0, 0.08)).toBeNull();
  });
});
