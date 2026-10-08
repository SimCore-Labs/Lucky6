# Lucky Six backend

NestJS API using Fastify, Prisma ORM 7, and PostgreSQL.

PostgreSQL and Redis are external services. Copy `.env.example` to `.env` and
set the connection URLs from your database and Redis providers. Never commit
`.env`.

PostgreSQL URLs using `sslmode=require` use the same TLS behavior as the
existing `simsoccer` setup: traffic is encrypted, but the server certificate
is not verified by default. This accommodates providers with self-signed
certificates; use a verified CA configuration for production where available.
Redis uses the provider URL as supplied.

From this directory:

```powershell
npm install
npm run db:validate
npm run db:generate
npm run start:dev
```

The API listens on port 4000. `GET /` reports that the process is alive;
`GET /health` checks both PostgreSQL and Redis and returns HTTP 503 if either
dependency is unavailable.

The schema is a domain starting point, not a production-reviewed financial
schema. Review its invariants before the first migration. Use
`npm run db:migrate:dev` for local development and
`npm run db:migrate:deploy` to apply committed migrations. Reinstalling
dependencies does not require resetting or deleting database data.
