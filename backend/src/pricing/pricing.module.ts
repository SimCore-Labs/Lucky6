import { Injectable, Module } from '@nestjs/common';
import { PricingEngineService } from './pricing-engine.service.js';

@Module({
  providers: [PricingEngineService],
  exports: [PricingEngineService],
})
export class PricingModule {}
