# Setup: GitHub, Vercel, database, Oura

## 1. Repository

Branches: `main` (production) and `dev` (integration and demos). Protect `main` in GitHub (require a pull request and the CI check) once the first release is cut.

## 2. Vercel

1. Import the repository as a Next.js project. Production branch: `main`.
2. `dev` automatically gets Preview deployments with a stable branch URL.
3. **Check this once:** in the Vercel project settings, confirm the production branch is `main`. When the project was first created through the API, deployments from both `main` and `dev` were labelled *production*, which would mix the two environments' variables. Until `dev` shows up as *Preview*, do not add secrets or `DEMO_AUTH`.
4. As a safety net, the app refuses demo login whenever `VERCEL_ENV=production`, even if `DEMO_AUTH=true` is set there by mistake.
5. `vercel.json` registers a daily cron on `/api/cron/oura-sync`. On the Hobby plan cron can run once per day at most (check current limits), and Hobby is for personal, non-commercial use. A real pilot needs a paid plan.

## 3. Database

Use **two separate databases**: one for Production, one for Preview/dev. Neon or Supabase can be added from the Vercel Marketplace, which sets `DATABASE_URL`. Pick a region close to the users and check the data-residency question in [PRIVACY.md](PRIVACY.md).

Apply migrations to each database:

```bash
vercel env pull .env.local            # or export DATABASE_URL yourself
npm run db:migrate
```

Seed synthetic data **only** into the dev database: `npm run db:seed`.

## 4. Oura application

1. Register an application at developer.ouraring.com (OAuth2).
2. Add one redirect URI per environment, e.g. `https://<dev-branch-url>/api/oura/callback` and the production URL.
3. Copy the client id and secret into the matching Vercel environment.
4. Until Oura approves the application it is limited to 10 users. Request approval early if the pilot is larger.
5. Personal access tokens are deprecated; use OAuth for everything, including your own ring.

## 5. Environment variables

| Name | Production | Preview (dev) | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | prod DB | dev DB | |
| `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET` | yes | yes | |
| `OURA_REDIRECT_URI` | prod callback URL | dev callback URL | must match the Oura app exactly |
| `TOKEN_ENCRYPTION_KEY` | yes | yes | `openssl rand -base64 32`; **different per environment**; losing it makes stored tokens unreadable |
| `SESSION_SECRET` | yes | yes | `openssl rand -base64 32` |
| `CRON_SECRET` | yes | yes | Vercel Cron sends it as a bearer token |
| `ORG_MIN_COHORT` | `5` or more | `5` | |
| `DEMO_AUTH` | **never `true`** | `true` | |

Scope `DEMO_AUTH=true` to the Preview environment (and, if you want, only the `dev` branch).

## 6. Check it works

- `GET /api/health` returns `{"ok":true,"db":"up"}`.
- `GET /api/cron/oura-sync` without the bearer secret returns 401.
- On the dev URL with `DEMO_AUTH=true` and seeded data, the three demo sign-ins on `/` open the three views.
