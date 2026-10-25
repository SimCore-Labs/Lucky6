import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../backend/dist/generated/prisma/client.js';
import { createTursoAdapter } from '../../backend/dist/prisma/turso-adapter.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      adapter: createTursoAdapter(
        process.env.DATABASE_URL,
        process.env.TURSO_AUTH_TOKEN,
      ),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
