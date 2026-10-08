import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true,
      connectTimeout: 5_000,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => Math.min(attempt * 200, 2_000),
    });
  }

  async ping(): Promise<'PONG'> {
    const result = await this.client.ping();
    if (result !== 'PONG') {
      throw new Error(`Unexpected Redis health response: ${String(result)}`);
    }
    return result;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status !== 'end') {
      await this.client.quit();
    }
  }
}
