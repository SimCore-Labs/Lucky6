import { PrismaLibSql } from '@prisma/adapter-libsql';

export function createTursoAdapter(
  databaseUrl: string | undefined,
  authToken: string | undefined,
): PrismaLibSql {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be configured with the Turso database URL.');
  }
  if (!authToken) {
    throw new Error('TURSO_AUTH_TOKEN must be configured for Turso authentication.');
  }

  const protocol = new URL(databaseUrl).protocol;
  if (protocol !== 'libsql:' && protocol !== 'https:') {
    throw new Error('DATABASE_URL must use a libSQL/Turso URL, not a local or PostgreSQL URL.');
  }

  return new PrismaLibSql({ url: databaseUrl, authToken });
}
