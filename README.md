# Oura Care Platform

Member health platform built on the Oura ring, with three views over the same data and **explicit consent** as the foundation.

| View | Route | Who | Sees |
| --- | --- | --- | --- |
| Member | `/member` | the member | own data in tabs (sleep, recovery, activity, heart and breathing, workouts, ring), rewards, self-set goals and treats, what is shared, who looked |
| Care team | `/care` | assigned nurse / doctor | only members who consented: trends, alerts to review |
| Organization | `/org` | employer / provider admin | anonymous group means, hidden below a minimum group size |
| Doctor link | `/share/<token>` | a doctor the member sent a link to | read-only dashboard of the member's last 30/60/90 days, until the link expires or is revoked |

There is deliberately **no** per-person view for HR or employers. See [docs/PRIVACY.md](docs/PRIVACY.md).

## Stack

Next.js (App Router, TypeScript) · Postgres + Drizzle ORM · Oura API v2 (OAuth2) · Vercel (hosting + daily cron) · Vitest.

## Branches and environments

| Branch | Vercel environment | Purpose |
| --- | --- | --- |
| `main` | Production | stable, real data only |
| `dev` | Preview (stable branch URL) | integration, demos, `DEMO_AUTH=true` and synthetic data |

Work happens on feature branches, merged into `dev` by pull request, and `dev` is merged into `main` to release. CI (`.github/workflows/ci.yml`) runs typecheck, tests and build on every PR and push to either branch.

## Quick start (local)

Requires Node 22+ and any Postgres 14+.

```bash
npm install
cp .env.example .env.local        # fill in DATABASE_URL, SESSION_SECRET, TOKEN_ENCRYPTION_KEY, CRON_SECRET
set -a; source .env.local; set +a
npm run db:migrate                # applies drizzle/*.sql
DEMO_AUTH=true npm run dev        # http://localhost:3000
npm run db:seed                   # 24 synthetic members, 42 days (add --reset to wipe first)
```

Then open `/` and use the demo sign-in buttons. `DEMO_AUTH` must never be on where real member data exists.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | unit tests (alerts, consent, rewards, self-rewards, crypto, Oura mapping) |
| `npm run db:generate` | create a new SQL migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | apply migrations to `DATABASE_URL` |
| `npm run db:seed` | load synthetic demo data |

## Layout

```
src/app/            pages (member, care, org), server actions, API routes
src/db/             Drizzle schema + connection
src/lib/            pure logic (alerts, consent, rewards, summary) and server helpers
src/lib/oura/       OAuth client, API mapping, sync
scripts/seed.ts     synthetic data
drizzle/            generated SQL migrations
docs/               architecture, privacy, setup
```

## What is done, and what is not

Done and verified: schema and migration (applied to a real Postgres 16), consent model with revocation, alert rules, bedtime-consistency rewards, member self-rewards, token encryption, org group threshold, audit log, the three views, role guards, daily-sync route with secret, CI. Verified with unit tests, a seeded database, and a browser run (acknowledge an alert, revoke and re-grant consent, phone-width layout).

**Not done / not verified** (details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#open-items)):

- Real sign-in. Sessions are signed cookies; only the demo login creates them. Plug in Auth.js, Clerk or the partner's SSO before any real pilot.
- The Oura OAuth and sync code has **not** run against Oura's live API (no credentials yet). Field mapping is unit-tested against the documented response shape.
- Delivering alerts outside the app (email / WhatsApp / push to a care manager).
- Data export and deletion on request, and a retention policy.
- Legal review: privacy law, health-data rules, and whether alerts count as medical software.
