import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations-turso',
  },
  datasource: {
    url: 'file:./dev.db',
  },
});
