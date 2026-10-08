import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private publisher: Redis;
  private subscriber: Redis;

  constructor() {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    const options = {
      tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
      maxRetriesPerRequest: null,
    };
    this.publisher = new Redis(redisUrl, options);
    this.subscriber = new Redis(redisUrl, options);
  }

  async onModuleInit(): Promise<void> {
    // Subscriber ready
  }

  subscribe(channel: string, callback: (channel: string, message: string) => void): void {
    this.subscriber.subscribe(channel);
    this.subscriber.on('message', callback);
  }

  async publish(channel: string, message: unknown): Promise<number> {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    return await this.publisher.publish(channel, payload);
  }

  async onModuleDestroy(): Promise<void> {
    await this.publisher.quit();
    await this.subscriber.quit();
  }
}
