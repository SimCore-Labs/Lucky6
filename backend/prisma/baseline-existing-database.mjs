import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL must be configured before baselining the database.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
const require = createRequire(import.meta.url);
const prismaCli = require.resolve('prisma');
const backendDirectory = new URL('..', import.meta.url);

function normalizeSql(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),;])\s*/g, '$1')
    .trim()
    .toLowerCase();
}

function runPrisma(args) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: backendDirectory,
    encoding: 'utf8',
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Prisma ${args.join(' ')} failed:\n${result.stderr || result.stdout}`,
    );
  }

  return result.stdout;
}

try {
  const [schemaState] = await prisma.$queryRaw`
    SELECT
      to_regclass('public."_prisma_migrations"') IS NOT NULL AS "hasMigrationTable",
      to_regclass('public."Draw"') IS NOT NULL AS "hasDrawTable"
  `;

  const [tableState] = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS "tableCount"
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname <> '_prisma_migrations'
  `;

  if (tableState.tableCount === 0) {
    console.info('No existing application tables found; Prisma will apply the baseline normally.');
  } else {
    const [migrationState] = schemaState.hasMigrationTable
      ? await prisma.$queryRaw`
          SELECT COUNT(*)::int AS "migrationCount"
          FROM "_prisma_migrations"
        `
      : [{ migrationCount: 0 }];

    if (migrationState.migrationCount > 0) {
      console.info('Prisma migration history already exists; skipping baseline.');
    } else {
      if (!schemaState.hasDrawTable) {
        throw new Error(
          'Application tables exist without migration history, but the Draw table is missing; refusing to baseline.',
        );
      }

      const driftSql = runPrisma([
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema=prisma/schema.prisma',
        '--script',
      ]);
      const expectedSql = readFileSync(
        new URL(
          './migrations/20261009210000_add_draw_status_draw_number_index/migration.sql',
          import.meta.url,
        ),
        'utf8',
      );

      if (normalizeSql(driftSql) !== normalizeSql(expectedSql)) {
        throw new Error(
          `Existing database schema differs from the Prisma schema by more than the pending draw index; refusing to baseline.\nSchema diff:\n${driftSql}`,
        );
      }

      console.info('Existing schema matches the Prisma baseline; marking 0_init as applied.');
      runPrisma(['migrate', 'resolve', '--applied', '0_init']);
    }
  }
} finally {
  await prisma.$disconnect();
}
