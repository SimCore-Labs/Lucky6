import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';
import { SettlementEvaluatorService } from './domain/settlement-evaluator.service.js';
import { SettlementService } from './settlement.service.js';

@Module({
  providers: [
    PrismaService,
    RedisService,
    SettlementEvaluatorService,
    SettlementService,
  ],
})
class SettlementModule {}

const port = Number(process.env.PORT ?? 4200);
const app = await NestFactory.create<NestFastifyApplication>(
  SettlementModule,
  new FastifyAdapter(),
);

app.getHttpAdapter()
  .getInstance()
  .get('/health/live', async () => ({
    service: '@lucky-six/settlement',
    status: 'ok',
    process: 'alive',
    phase: 'ready',
  }));

await app.listen(port, '127.0.0.1');
console.info(`Settlement engine listening on 127.0.0.1:${port}`);
