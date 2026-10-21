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
src/components/     shared UI (metrics-table, logout-button, share-link card, doctor-share-card, self-rewards-section + self-reward-builder)
src/components/doctor-dashboard/  the doctor dashboard: dashboard.tsx (server), trend-chart.tsx (client SVG), dashboard.css (tokens)
src/db/             Drizzle schema + connection
src/lib/            pure logic (alerts, consent, rewards, self-rewards, summary) + server helpers (queries, session)
src/lib/oura/       OAuth client, API mapping, sync
scripts/seed.ts     synthetic demo data
drizzle/            generated SQL migrations (never hand-edit applied ones)
docs/               ARCHITECTURE, PRIVACY, SETUP
```

## Workflow

Keep it simple: everything lives on **`main`**, and Vercel builds from it. This is a fast-moving side project: **always commit and push to `main` after every change**, without asking for approval and without leaving work unpushed at the end of a turn. No PRs or feature branches unless the user asks.

1. Before pushing: `npm run typecheck && npm test && npm run build`.
2. Schema change: edit `src/db/schema.ts`, run `npm run db:generate`, commit the SQL file. Make sure the new migration's `when` in `drizzle/meta/_journal.json` is later than the previous one, and enable RLS on any new table plus an `oura_app` policy, or the app is denied on Supabase (see `0003`). The owner has pre-approved: after generating a migration, apply it to the Production database yourself (Supabase connector: `apply_migration`) without asking, since the app does not work until it is applied. Check the existing tables first and keep migrations additive.
3. Add or update a Vitest test for any change in `src/lib/` logic.

## Config lives in files, not env vars

Owner's instruction: this is a fast project and security matters less than speed. Put settings and keys (Resend API key, sender address) **in committed config files** such as `src/config/mail.ts`, not in Vercel env vars. Env vars may still override a file value but are never required. The owner explicitly accepts putting keys in code and accepts the security trade-off, and is switching the repo to **private**. Until the repo is private, a key in git is readable by anyone, so mention that once if you see it is still public.

## Autonomy (owner's standing approval)

The owner wants features built end to end with minimal involvement. Without asking, do all of the following:

- Add or edit environment variables in the Vercel project (Vercel connector) when a feature needs one. Prefer committed config files per the section below; use Vercel env only when a value must differ per environment.
- Apply migrations to the Production database (Supabase connector).
- After pushing to `main`, watch the Vercel deployment, read build and runtime logs on failure, fix and push again until it is green, then check the live URL.
- Use any connected connector (Vercel, Supabase, Resend, GitHub) that the task needs.

Stop and ask only for destructive, irreversible actions on real data (dropping tables, deleting data) or anything that would send messages to real people.

## Rules that must not be broken

- **Server is the gatekeeper.** Pages call `requireRole`. Server actions re-check ownership and consent. Never rely on the UI to hide something.
- **Nothing is shared by default.** Consent scopes: `care_team`, `org_aggregate`, `rewards`. One scope never implies another. Consent history is append-only (revoke sets `revoked_at`; re-grant inserts a row).
- **No per-person view for employers or HR.** Org views show group means only, hidden below `ORG_MIN_COHORT`.
- **Minimal data.** Do not add Oura scopes beyond `daily`, heart-rate time series, names, phone numbers or emails to the care view.
- **Audit.** Any new staff view or consent change writes to `audit_log`.
- **Secrets.** Never commit real values. Tokens stay encrypted (AES-256-GCM). `.env.example` is the only env file in git. Other people's contact details (e.g. doctor emails) stay in the database, never in source. Keys and settings follow "Config lives in files" above.
- **`DEMO_AUTH`** is on in Production by the owner's choice (no real auth needed for now, synthetic data). Turn it off if real member data is ever added.
- **No health data in URLs, logs or analytics.** Responses stay `no-store`, `X-Frame-Options: DENY`.

## Feature: "send to my doctors" (member page)

Built on `/member`: a card with two doctor roles (neurologist, family doctor). The member saves each doctor's name and email (table `doctor_contacts`, never in source), clicks "send", reviews the exact message on `/member/send/[role]`, and confirms. The server rebuilds the message from the database (`src/lib/doctor-share.ts`), sends it through Resend (`src/lib/mail.ts`, settings in `src/config/mail.ts`), and writes `share_to_doctor` to `audit_log` without the content.

Rules to keep:

- Member-initiated only, with the confirmation page. Never automatic.
- Separate from `care_team` consent: it neither reads nor widens it.
- Message content never goes in a URL or a log. No member name in the message; replies go to the member's own address.
- Doctor roles were not pre-filled: the user enters who is the neurologist and who is the family doctor.
- Not built: attachments, a free-text note (the lib supports one, the UI does not), retry or delivery tracking.

## Feature: doctor dashboard link (member page)

On `/member`, card "דאשבורד לרופא": the member creates a read-only link (`/share/<token>`) for a doctor, previews it on `/member/share/preview?days=30`, copies or shares it, sees how many times it was opened, and revokes it. Details in `docs/ARCHITECTURE.md#doctor-dashboard-links`.

- Table `share_links` (migration `0003`). Lookup by `sha256(token)` only; `token_enc` exists so the member can copy again. Never log or store the plain token anywhere else.
- `/share/[token]` re-checks status on every request. First screen (`ShareGate`) has no health data and no name; data only after the "open" POST (`openShareLink`), which audits `share_link_viewed` and sets a signed cookie scoped to that link's path. Unknown, expired and revoked links all get the same 404 page.
- Dashboard numbers come from `src/lib/doctor-dashboard.ts` (pure, tested). Thresholds mirror `src/lib/alerts.ts`; change both together. Only the window's slots go to client components.
- Do not add: member email, age band, data outside the window, care-team alerts or notes, analytics or third-party scripts on `/share`.
- Design: `dashboard.css` has three token layers scoped to `.dash` (primitives `--p-*`, semantic `--c-*`, component `--viz-*`); components use only `--c-*`/`--viz-*`. Chart colours `#0b84a5` (data) / `#c96a12` (attention) light, `#2a9fc0` / `#c9711f` dark, validated for colour-blind separation and 3:1 contrast; re-validate if you change them. Font: IBM Plex Sans Hebrew (self-hosted via `@fontsource`, no external requests). Charts keep time left to right (newest on the right) inside the RTL page. Print uses the light theme and opens the daily table.
- Server-only code must not import values from a `"use client"` file (shared helpers live in `doctor-dashboard/format.ts`).

## Feature: "התגמולים שלי" self-rewards (member page)

Built on `/member`: the member sets a goal on their own Oura data and the treat they give themselves for reaching it (table `self_rewards`, migration `0004`, logic in `src/lib/self-rewards.ts`). Goal kinds: average over a period, X of Y days, streak with an optional joker, beat my own 28-day baseline, steady bedtime. Several reward options make a mystery reward drawn server-side when opened. Template gallery and live "contract" preview in `self-reward-builder.tsx`.

Rules to keep:

- Member-only. No staff or org page reads `self_rewards`; it is not part of any aggregate and needs no sharing consent.
- Status is computed on read from `daily_metrics`; only the claim is stored. Claiming re-evaluates on the server.
- Separate from the platform's bedtime points (`reward_events`, `rewards` consent).

## Feature: "מרכז פעולות" action center (member page)

On `/member`, card `#actions`: the member defines rules on their own Oura data (metric below/above a threshold) that fire a **Home Assistant webhook** (tables `automation_rules`, `automation_runs`, migration `0006`; logic in `src/lib/automations.ts`, UI in `src/components/action-center.tsx`). If Home Assistant is not a good fit, the same webhook works with n8n: only the URL template changes.

Rules to keep:

- Member-only, no consent scope, no staff or org page reads it. Fires only when the member presses the button (no automatic firing yet: the daily cron runs at 03:00, before the night's data exists).
- The server re-checks the condition from `daily_metrics`; the unique `(rule_id, day)` row in `automation_runs` allows one run per rule per day. A failed webhook deletes that row so the member can retry. "Test" skips both.
- The webhook URL comes from `src/config/home-assistant.ts` (`webhookUrlTemplate` with `{id}`; env `HOME_ASSISTANT_WEBHOOK_URL` overrides). Members enter only a webhook id (validated `[A-Za-z0-9_-]`), so they cannot point the server at an arbitrary URL. Vercel needs an internet-reachable address (Nabu Casa `https://hooks.nabu.casa/{id}` or a public HA URL).
- The payload names the rule only, never a health value. Never log the URL or body.

## Not built yet (do not assume it exists)

Real authentication (only the demo login creates sessions), live Oura verification, alert delivery outside the app, data export and deletion, retention policy, legal review. See `docs/ARCHITECTURE.md#open-items` and `docs/PRIVACY.md`.
