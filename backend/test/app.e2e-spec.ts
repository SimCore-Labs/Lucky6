import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { RedisService } from './../src/redis/redis.service.js';

describe('AppController (e2e)', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: vi.fn() })
      .overrideProvider(RedisService)
      .useValue({ ping: vi.fn().mockResolvedValue('PONG') })
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({ service: 'lucky-six-api', status: 'ok' });
  });

  it('/health checks both external dependencies', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({
        status: 'ok',
        checks: { database: 'ok', redis: 'ok' },
      });
  });

  it('/health reports Redis as unavailable when its check fails', async () => {
    vi.spyOn(app.get(RedisService), 'ping').mockRejectedValue(
      new Error('Redis unavailable'),
    );

    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(503);

    expect(response.body.checks.redis).toBe('unavailable');
    expect(response.body.checks.database).toBe('ok');
  });

  afterEach(async () => {
    await app.close();
  });
});
