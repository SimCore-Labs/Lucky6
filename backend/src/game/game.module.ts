import { Module } from '@nestjs/common';
import { GameController } from './game.controller.js';
import { PricingModule } from '../pricing/pricing.module.js';

@Module({
  imports: [PricingModule],
  controllers: [GameController],
})
export class GameModule {}
