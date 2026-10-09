import { PricingEngineService } from './pricing-engine.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

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
});
