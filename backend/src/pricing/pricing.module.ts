import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PricingEngineService } from './pricing-engine.service.js';

@Module({
  imports: [PrismaModule],
  providers: [PricingEngineService],
  exports: [PricingEngineService],
})
export class PricingModule {}
