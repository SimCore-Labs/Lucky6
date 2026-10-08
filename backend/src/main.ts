import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  const config = app.get(ConfigService);
  const origins = config.get<string>(
    'CORS_ORIGIN',
    'http://localhost:3000',
  );

  await app.register(helmet);
  await app.register(cors, {
    origin: origins ? origins.split(',').map((origin) => origin.trim()) : false,
    credentials: true,
  });

  await app.listen(Number(config.get('PORT') ?? 4000), '0.0.0.0');
}

await bootstrap();
