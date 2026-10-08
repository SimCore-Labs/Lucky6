import { Injectable, Logger } from '@nestjs/common';

export interface PriceOracle {
  getSolPriceUsd(): Promise<number>;
}

@Injectable()
export class MockPriceOracleService implements PriceOracle {
  private readonly logger = new Logger(MockPriceOracleService.name);

  async getSolPriceUsd(): Promise<number> {
    const fixedPrice = Number(process.env.SOL_PRICE_USD ?? 150.0);
    this.logger.log(`PriceOracle: Returning SOL/USD rate $${fixedPrice}`);
    return fixedPrice;
  }
}
