# CLAUDE.md

Guidance for working on this repo. Read `README.md` and `docs/` for detail; this file is the short version plus the rules that must not be broken.

## What this is

Oura-based member health platform with three views over one dataset: member (`/member`), care team (`/care`), organization (`/org`). Health data, so **consent is the foundation**. Stack: Next.js 16 (App Router, TS), Postgres + Drizzle, Oura API v2, Vercel, Vitest. Node 22+.

- Repo: `benzybert/benzybert-oura-care-platform`
- Vercel project: `oura-care-platform`
- UI language is **Hebrew, RTL**. Keep new UI text in Hebrew and layouts RTL-safe (works at phone width).

## Where things live

```
src/app/            pages (member, care, org), server actions (actions.ts), API routes
src/components/     shared UI (metrics-table, logout-button)
src/db/             Drizzle schema + connection
src/lib/            pure logic (alerts, consent, rewards, summary) + server helpers (queries, session)
src/lib/oura/       OAuth client, API mapping, sync
scripts/seed.ts     synthetic demo data
drizzle/            generated SQL migrations (never hand-edit applied ones)
docs/               ARCHITECTURE, PRIVACY, SETUP
```

## Workflow

1. Branch from `dev` (`feature/<short-name>`). Never commit to `main`. `dev` is the Preview environment; `main` is Production.
2. Before finishing a change: `npm run typecheck && npm test && npm run build` (CI runs the same on every PR).
3. Open a PR into `dev`. Do not push, open a PR, or merge unless the user asked for it.
4. Schema change: edit `src/db/schema.ts`, then `npm run db:generate`, and commit the new SQL file. Do not run migrations against any real database without being asked.
5. Add or update a Vitest test for any change in `src/lib/` logic (alerts, consent, rewards, crypto, Oura mapping).

## Rules that must not be broken

- **Server is the gatekeeper.** Pages call `requireRole`. Server actions re-check ownership and consent. Never rely on the UI to hide something.
- **Nothing is shared by default.** Consent scopes: `care_team`, `org_aggregate`, `rewards`. One scope never implies another. Consent history is append-only (revoke sets `revoked_at`; re-grant inserts a row).
- **No per-person view for employers or HR.** Org views show group means only, hidden below `ORG_MIN_COHORT`.
- **Minimal data.** Do not add Oura scopes beyond `daily`, heart-rate time series, names, phone numbers or emails to the care view.
- **Audit.** Any new staff view or consent change writes to `audit_log`.
- **Secrets.** Never commit real values. Tokens stay encrypted (AES-256-GCM). `.env.example` is the only env file in git. Never put credentials, tokens or other people's contact details in source; read them from env vars or the database.
- **`DEMO_AUTH` stays off** anywhere real member data exists.
- **No health data in URLs, logs or analytics.** Responses stay `no-store`, `X-Frame-Options: DENY`.

## Pending feature: "send to my doctors" buttons (member page)

Goal: on `/member`, two buttons, one for the member's neurologist and one for their family doctor, that send the member's own information to that doctor.

Constraints that follow from the rules above:

- **Member-initiated only.** Nothing is sent without an explicit click and a confirmation step that shows exactly what will be sent and to whom. Never send automatically or on a schedule.
- **It is the member's own sharing, not the care-team scope.** It must not read from or widen `care_team` consent. Record each send in `audit_log` (who, which doctor role, what category, when; not the content).
- **Doctor details are configuration, not code.** Store doctor name, role and email per member in the database (or env for a single-user setup). Do not hardcode addresses in source. The user has to confirm which contact is the neurologist and which is the family doctor; the roles were inferred from email history and may be reversed.
- **Do not put health data in a URL.** A `mailto:` or Gmail compose link would put message content into a URL. Prefer a server action that sends through a mail provider, or copy-to-clipboard plus an attachment flow, and decide with the user.
- **Attachments** (PDF / exports) cannot ride on a compose link. If files are needed, generate them server-side and send them with the email.
- Hebrew labels, RTL layout, works at phone width, with a clear error state when sending fails.

## Not built yet (do not assume it exists)

Real authentication (only the demo login creates sessions), live Oura verification, alert delivery outside the app, data export and deletion, retention policy, legal review. See `docs/ARCHITECTURE.md#open-items` and `docs/PRIVACY.md`.
