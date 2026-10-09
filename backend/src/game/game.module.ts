import { Module } from '@nestjs/common';
import { GameController } from './game.controller.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, PricingModule],
  controllers: [GameController],
})
export class GameModule {}
