import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import type { ServiceHealth } from '@lucky-six/contracts';
import { Module } from '@nestjs/common';

@Module({})
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
    phase: 'foundation',
  } satisfies ServiceHealth & { process: string; phase: string }));

await app.listen(port, '127.0.0.1');
console.info(`Draw engine foundation listening on 127.0.0.1:${port}`);
