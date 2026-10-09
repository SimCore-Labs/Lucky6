import { Module } from '@nestjs/common';
import { GameController } from './game.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [GameController],
})
export class GameModule {}
