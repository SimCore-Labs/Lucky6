import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Module } from '@nestjs/common';
import { SolanaPaymentService } from './domain/solana-payment.service.js';

@Module({
  providers: [SolanaPaymentService],
})
class PaymentWorkerModule {}

const port = Number(process.env.PORT ?? 4300);
const app = await NestFactory.create<NestFastifyApplication>(
  PaymentWorkerModule,
  new FastifyAdapter(),
);

app.getHttpAdapter()
  .getInstance()
  .get('/health/live', async () => ({
    service: '@lucky-six/payment-worker',
    status: 'ok',
    process: 'alive',
    phase: 'ready',
  }));

await app.listen(port, '127.0.0.1');
console.info(`Payment worker listening on 127.0.0.1:${port}`);
