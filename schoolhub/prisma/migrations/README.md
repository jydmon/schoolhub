# Database migrations

Dev uses `prisma db push` (fast, migration-less) against SQLite — run `npm run setup`.

**Committed migrations** (required for production / team workflows) are generated
with one command on any machine that has npm registry access:

```bash
# 1. Point DATABASE_URL at Postgres and set provider = "postgresql" in schema.prisma
# 2. Generate the baseline + all subsequent migrations:
npm run db:migrate:dev -- --name init
# 3. In CI / production:
npm run db:migrate:deploy
```

`prisma migrate dev` diffs `schema.prisma` against the database and writes a
timestamped `migrations/<ts>_init/migration.sql`. It was not committed here
because this build environment has no package-registry / Prisma-engine access to
run the generator; the schema is the single source of truth and the command
above produces the migration deterministically.

Every schema change across the 14 phases is additive (new tables/columns with
defaults or nullable), so the baseline migration captures the full model and
`migrate deploy` applies cleanly.
