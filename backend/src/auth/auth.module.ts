import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthController } from './auth.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
})
export class AuthModule {}
