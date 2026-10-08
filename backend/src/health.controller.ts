import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.js';
import { RedisService } from './redis/redis.service.js';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check(): Promise<{
    status: 'ok';
    checks: { database: 'ok'; redis: 'ok' };
  }> {
    const [database, redis] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
    ]);

    if (database.status === 'rejected') {
      this.logger.error(
        'Database health check failed',
        database.reason instanceof Error
          ? database.reason.stack
          : String(database.reason),
      );
    }
    if (redis.status === 'rejected') {
      this.logger.error(
        'Redis health check failed',
        redis.reason instanceof Error
          ? redis.reason.stack
          : String(redis.reason),
      );
    }
    if (database.status === 'rejected' || redis.status === 'rejected') {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        checks: {
          database: database.status === 'fulfilled' ? 'ok' : 'unavailable',
          redis: redis.status === 'fulfilled' ? 'ok' : 'unavailable',
        },
      });
    }

    return { status: 'ok', checks: { database: 'ok', redis: 'ok' } };
  }
}
