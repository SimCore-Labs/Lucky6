import { Module } from '@nestjs/common';
import { GameController } from './game.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [GameController],
})
export class GameModule {}
