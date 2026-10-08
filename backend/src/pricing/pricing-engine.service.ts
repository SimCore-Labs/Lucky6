import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface BaseProbabilities {
  individualNumber: number; // e.g. 6 / 48 = 0.125
  blackJackpot: number; // e.g. 0.02
  colorMajority: Record<string, number>;
  sumHighMidLow: Record<string, number>;
  sumOddEven: Record<string, number>;
  firstBallColor: Record<string, number>;
}

@Injectable()
export class PricingEngineService {
  private readonly logger = new Logger(PricingEngineService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculates base theoretical probability distributions for Lucky Six markets.
   */
  calculateBaseProbabilities(jackpotProb = 0.02): BaseProbabilities {
    return {
      individualNumber: 6 / 48, // 0.125
      blackJackpot: jackpotProb,
      colorMajority: {
        BLUE: 0.22,
        YELLOW: 0.22,
        RED: 0.22,
        GREEN: 0.22,
        NO_MAJORITY: 0.12,
      },
      sumHighMidLow: {
        LOW: 0.33,
        MID: 0.34,
        HIGH: 0.33,
      },
      sumOddEven: {
        ODD: 0.5,
        EVEN: 0.5,
      },
      firstBallColor: {
        BLUE: (1 - jackpotProb) / 4,
        YELLOW: (1 - jackpotProb) / 4,
        RED: (1 - jackpotProb) / 4,
        GREEN: (1 - jackpotProb) / 4,
        BLACK: jackpotProb,
      },
    };
  }

  /**
   * Converts a true probability into offered odds applying house margin and exposure factor.
   * Offered Odds = (1 - HouseMargin) / Probability
   */
  calculateOddsFromProbability(
    probability: number,
    houseMargin = 0.08,
    exposureAdjustment = 0,
  ): number {
    if (probability <= 0) return 1.01;
    const adjustedProb = Math.min(
      Math.max(probability + exposureAdjustment, 0.001),
      0.999,
    );
    const rawOdds = (1 - houseMargin) / adjustedProb;
    // Round to 2 decimal places, minimum 1.01
    return Math.max(Math.round(rawOdds * 100) / 100, 1.01);
  }

  /**
   * Updates or generates new Odds Versions for active market selections in DB.
   */
  async updateMarketOddsForActiveMarkets(): Promise<void> {
    const config = await this.prisma.pricingConfig.findUnique({
      where: { key: 'default' },
    });
    const houseMargin = config ? Number(config.houseMargin) : 0.08;
    const jackpotProb =
      (config?.parameters as { jackpotAppearanceProbability?: number })
        ?.jackpotAppearanceProbability ?? 0.02;

    const baseProbs = this.calculateBaseProbabilities(jackpotProb);
    const markets = await this.prisma.market.findMany({
      where: { active: true },
      include: { selections: true },
    });

    for (const market of markets) {
      for (const selection of market.selections) {
        let prob = 0.1;
        if (market.type === 'INDIVIDUAL_NUMBER') {
          prob = baseProbs.individualNumber;
        } else if (market.type === 'BLACK_JACKPOT') {
          prob =
            selection.value === 'YES'
              ? baseProbs.blackJackpot
              : 1 - baseProbs.blackJackpot;
        } else if (market.type === 'COLOR_MAJORITY') {
          prob = baseProbs.colorMajority[selection.value] ?? 0.2;
        } else if (market.type === 'SUM_HIGH_MID_LOW') {
          prob = baseProbs.sumHighMidLow[selection.value] ?? 0.33;
        } else if (market.type === 'SUM_ODD_EVEN') {
          prob = baseProbs.sumOddEven[selection.value] ?? 0.5;
        } else if (market.type === 'FIRST_BALL_COLOR') {
          prob = baseProbs.firstBallColor[selection.value] ?? 0.2;
        }

        const oddsValue = this.calculateOddsFromProbability(
          prob,
          houseMargin,
        );

        // Get current latest odds version for this selection
        const latestOdds = await this.prisma.marketOdds.findFirst({
          where: { selectionId: selection.id },
          orderBy: { version: 'desc' },
        });

        const nextVersion = latestOdds ? latestOdds.version + 1 : 1;

        if (!latestOdds || Number(latestOdds.oddsValue) !== oddsValue) {
          if (latestOdds) {
            await this.prisma.marketOdds.updateMany({
              where: { selectionId: selection.id, active: true },
              data: { active: false },
            });
          }

          await this.prisma.marketOdds.create({
            data: {
              selectionId: selection.id,
              oddsValue,
              version: nextVersion,
              active: true,
            },
          });
        }
      }
    }

    this.logger.log('Market odds updated successfully.');
  }
}
