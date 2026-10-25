# Lucky Six backend

NestJS API using Fastify, Prisma ORM 7, and Turso (SQLite/libSQL).

Turso and Redis are external services. Copy `.env.example` to `.env`, set
`DATABASE_URL` to the Turso `libsql://` URL, and set `TURSO_AUTH_TOKEN` and
`REDIS_URL`. The API and all worker processes use these same database variables.
Never commit `.env`.

From this directory:

```powershell
npm install
npm run db:validate
npm run db:generate
npm run start:dev
```

The API listens on port 4000. `GET /` reports that the process is alive;
`GET /health` checks both Turso and Redis and returns HTTP 503 if either
dependency is unavailable.

Prisma CLI migrations use an isolated local SQLite file; they do not connect to
Turso or the archived PostgreSQL migration history. Create/review migrations
locally with `npm run db:migrate:dev --workspace=backend -- --name <name>`.
Apply each reviewed SQL migration to the remote database with the authenticated
Turso CLI (`turso db shell <database-name> < migration.sql`) before starting
the application. Do not use `prisma migrate deploy`, `prisma db push`, or the
local SQLite file as production schema initialization.

`npm run db:seed --workspace=backend` is an explicit operation; production
startup does not alter the schema or seed data automatically. The existing
PostgreSQL migration files remain under `prisma/migrations` for reference.
