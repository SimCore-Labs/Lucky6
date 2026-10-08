import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import type { ServiceHealth } from '@lucky-six/contracts';
import { Module, Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { generateLuckySixDraw } from './domain/draw/mathematics.js';

@Injectable()
export class DrawSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(DrawSchedulerService.name);

  onModuleInit() {
    this.logger.log('Draw Engine initialized. Ready to process 5-minute draw lifecycle.');
  }

  generateDraw(jackpotProbability = 0.02) {
    return generateLuckySixDraw(jackpotProbability);
  }
}

@Module({
  providers: [DrawSchedulerService],
})
class EngineModule {}

const port = Number(process.env.PORT ?? 4100);
const app = await NestFactory.create<NestFastifyApplication>(
  EngineModule,
  new FastifyAdapter(),
);

app.getHttpAdapter()
  .getInstance()
  .get('/health/live', async () => ({
    service: '@lucky-six/engine',
    status: 'ok',
    process: 'alive',
    phase: 'ready',
  } satisfies ServiceHealth & { process: string; phase: string }));

await app.listen(port, '127.0.0.1');
console.info(`Draw engine listening on 127.0.0.1:${port}`);
