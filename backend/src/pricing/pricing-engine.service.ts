import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  calculateDecimalOdds,
  calculateMarketProbabilities,
  probabilityForSelection,
  type MarketProbabilities,
} from './market-pricing.js';

export type BaseProbabilities = MarketProbabilities;

@Injectable()
export class PricingEngineService implements OnModuleInit {
  private readonly logger = new Logger(PricingEngineService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.updateMarketOddsForActiveMarkets();
  }

  calculateBaseProbabilities(jackpotProbability = 0.02): BaseProbabilities {
    return calculateMarketProbabilities(jackpotProbability);
  }

  calculateOddsFromProbability(
    probability: number,
    houseMargin = 0.08,
    _exposureAdjustment = 0,
  ): number {
    const odds = calculateDecimalOdds(probability, houseMargin);
    if (odds === null) {
      throw new Error('Cannot calculate odds for an invalid probability.');
    }
    return odds;
  }

  async updateMarketOddsForActiveMarkets(): Promise<void> {
    const config = await this.prisma.pricingConfig.findUnique({
      where: { key: 'default' },
    });
    const houseMargin = config ? Number(config.houseMargin) : 0.08;
    const jackpotProbability =
      (config?.parameters as { jackpotAppearanceProbability?: number } | null)
        ?.jackpotAppearanceProbability ?? 0.02;
    const probabilities = calculateMarketProbabilities(jackpotProbability);
    const markets = await this.prisma.market.findMany({
      where: { active: true },
      include: { selections: true },
    });

    for (const market of markets) {
      for (const selection of market.selections) {
        const probability = probabilityForSelection(
          market.type,
          selection.value,
          probabilities,
        );
        const oddsValue =
          probability === null
            ? null
            : calculateDecimalOdds(probability, houseMargin);

        if (oddsValue === null) {
          await this.prisma.marketOdds.updateMany({
            where: { selectionId: selection.id, active: true },
            data: { active: false },
          });
          this.logger.warn(
            `Disabled unsupported or unpriceable selection ${market.type}:${selection.value}.`,
          );
          continue;
        }

        const latestOdds = await this.prisma.marketOdds.findFirst({
          where: { selectionId: selection.id },
          orderBy: { version: 'desc' },
        });
        if (
          latestOdds?.active &&
          Number(latestOdds.oddsValue) === oddsValue
        ) {
          continue;
        }

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
            version: (latestOdds?.version ?? 0) + 1,
            active: true,
          },
        });
      }
    }

    this.logger.log('Market odds updated successfully.');
  }
}
