import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface BaseProbabilities {
  individualNumber: number;
  blackJackpot: number; // e.g. 0.02
  colorMajority: Record<string, number>;
  sumHighMidLow: Record<string, number>;
  sumOddEven: Record<string, number>;
  firstBallColor: Record<string, number>;
}

@Injectable()
export class PricingEngineService implements OnModuleInit {
  private readonly logger = new Logger(PricingEngineService.name);

  constructor(private readonly prisma: PrismaService) {}

  private combination(total: number, selected: number): number {
    if (selected < 0 || selected > total) return 0;
    const count = Math.min(selected, total - selected);
    let result = 1;
    for (let index = 1; index <= count; index++) {
      result = (result * (total - count + index)) / index;
    }
    return result;
  }

  private colorMajorityProbabilities(normalBallCount: 5 | 6) {
    const outcomes = {
      RED: 0,
      BLUE: 0,
      GREEN: 0,
      NO_MAJORITY: 0,
    };
    const totalCombinations = this.combination(48, normalBallCount);

    for (let red = 0; red <= normalBallCount; red++) {
      for (let blue = 0; blue <= normalBallCount - red; blue++) {
        const green = normalBallCount - red - blue;
        const ways =
          this.combination(16, red) *
          this.combination(16, blue) *
          this.combination(16, green);
        const counts = [red, blue, green];
        const maximum = Math.max(...counts);
        const winners = counts.filter((count) => count === maximum).length;
        const outcome =
          winners === 1
            ? (['RED', 'BLUE', 'GREEN'][counts.indexOf(maximum)] as
                | 'RED'
                | 'BLUE'
                | 'GREEN')
            : 'NO_MAJORITY';
        outcomes[outcome] += ways / totalCombinations;
      }
    }

    return outcomes;
  }

  async onModuleInit(): Promise<void> {
    await this.updateMarketOddsForActiveMarkets();
  }

  /**
   * Calculates base theoretical probability distributions for Lucky Six markets.
   */
  calculateBaseProbabilities(jackpotProb = 0.02): BaseProbabilities {
    const normalDrawMajority = this.colorMajorityProbabilities(6);
    const jackpotDrawMajority = this.colorMajorityProbabilities(5);
    const colorMajority = {
      RED:
        normalDrawMajority.RED * (1 - jackpotProb) +
        jackpotDrawMajority.RED * jackpotProb,
      BLUE:
        normalDrawMajority.BLUE * (1 - jackpotProb) +
        jackpotDrawMajority.BLUE * jackpotProb,
      GREEN:
        normalDrawMajority.GREEN * (1 - jackpotProb) +
        jackpotDrawMajority.GREEN * jackpotProb,
      NO_MAJORITY:
        normalDrawMajority.NO_MAJORITY * (1 - jackpotProb) +
        jackpotDrawMajority.NO_MAJORITY * jackpotProb,
    };

    return {
      individualNumber:
        ((1 - jackpotProb) * 6 + jackpotProb * 5) / 48,
      blackJackpot: jackpotProb,
      colorMajority,
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
        RED: (1 - jackpotProb) / 3 + (jackpotProb * 5) / 18,
        BLUE: (1 - jackpotProb) / 3 + (jackpotProb * 5) / 18,
        GREEN: (1 - jackpotProb) / 3 + (jackpotProb * 5) / 18,
        BLACK: jackpotProb / 6,
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
        let supportedSelection = true;
        if (market.type === 'INDIVIDUAL_NUMBER') {
          prob = baseProbs.individualNumber;
        } else if (market.type === 'BLACK_JACKPOT') {
          prob =
            selection.value === 'YES'
              ? baseProbs.blackJackpot
              : 1 - baseProbs.blackJackpot;
        } else if (market.type === 'COLOR_MAJORITY') {
          const probability = baseProbs.colorMajority[selection.value];
          if (probability === undefined) supportedSelection = false;
          else prob = probability;
        } else if (market.type === 'SUM_HIGH_MID_LOW') {
          prob = baseProbs.sumHighMidLow[selection.value] ?? 0.33;
        } else if (market.type === 'SUM_ODD_EVEN') {
          prob = baseProbs.sumOddEven[selection.value] ?? 0.5;
        } else if (market.type === 'FIRST_BALL_COLOR') {
          const probability = baseProbs.firstBallColor[selection.value];
          if (probability === undefined) supportedSelection = false;
          else prob = probability;
        }

        if (!supportedSelection) {
          await this.prisma.marketOdds.updateMany({
            where: { selectionId: selection.id, active: true },
            data: { active: false },
          });
          continue;
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

        if (
          !latestOdds ||
          !latestOdds.active ||
          Number(latestOdds.oddsValue) !== oddsValue
        ) {
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
