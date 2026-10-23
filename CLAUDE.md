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
src/components/doctor-dashboard/  the doctor dashboard: dashboard.tsx (server), client SVG charts (trend-chart, night-explorer, stack-chart, sleep-clock, heatmap), score-ring, dashboard.css (tokens)
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

Built on `/member`: a card with two doctor roles (neurologist, family doctor). The member saves each doctor's name and email (table `doctor_contacts`, never in source), clicks "send", reviews the exact message on `/member/send/[role]`, and confirms. The server rebuilds the message from the database (`src/lib/doctor-share.ts`), creates a fresh personal dashboard link for that doctor (30 days of data, valid 14 days; revoked again if the send fails), attaches a PDF of the dashboard (`src/lib/doctor-pdf.ts`, pdf-lib + bidi-js + the self-hosted Plex font files), sends it through Resend (`src/lib/mail.ts`, settings in `src/config/mail.ts`), and writes `share_link_created` and `share_to_doctor` to `audit_log` without the content. The same PDF is downloadable from the dashboard itself (`/share/<token>/pdf`, same open-gate as the page) and from the member preview (`/member/share/preview/pdf`).

Rules to keep:

- Member-initiated only, with the confirmation page. Never automatic.
- Separate from `care_team` consent: it neither reads nor widens it.
- Message content never goes in a URL or a log. No member name in the message; replies go to the member's own address.
- Doctor roles were not pre-filled: the user enters who is the neurologist and who is the family doctor.
- Not built: attachments, a free-text note (the lib supports one, the UI does not), retry or delivery tracking.

## Feature: the member's own dashboard (member page)

The same dashboard component is the main data view on `/member`, in the `#data` section ("הנתונים שלי", replacing the old 14-day table): `DoctorDashboard` with `meta.mode = "member"`, built from `getDashboardMetrics(member.id, windowDays)` (30/60/90 days via `?days=`, same options as share links). Member mode drops the recipient and expiry wording, shows the window switch, a PDF link (`/member/share/preview/pdf`) and a "share with a doctor" jump to `#doctors`, and has no print button (the page is not the printout; the PDF is). Own data only, so it is not audited and needs no consent. Keep the `.dash` wrapper out of `main > .dash` position on `/member` (the full-width and page-background rules target a direct child of `main`).

## Feature: doctor dashboard link (member page)

On `/member`, card "דאשבורד לרופא": the member creates a read-only link (`/share/<token>`) for a doctor, previews it on `/member/share/preview?days=30`, copies or shares it, sees how many times it was opened, and revokes it. Details in `docs/ARCHITECTURE.md#doctor-dashboard-links`.

- Table `share_links` (migration `0003`). Lookup by `sha256(token)` only; `token_enc` exists so the member can copy again. Never log or store the plain token anywhere else.
- `/share/[token]` re-checks status on every request. First screen (`ShareGate`) has no health data and no name; data only after the "open" POST (`openShareLink`), which audits `share_link_viewed` and sets a signed cookie scoped to that link's path. Unknown, expired and revoked links all get the same 404 page.
- Dashboard numbers come from `src/lib/doctor-dashboard.ts` and `doctor-dashboard-detail.ts` (pure, tested). The sleep structure, night curves, contributors and activity minutes are extra fields of the same `daily` Oura calls (migration `0012`, columns on `daily_metrics`, parsed leniently in `src/lib/oura/map.ts`); `getDashboardMetrics` is the only reader, so care and org views never see them. Sync re-pulls 35 days, which also backfills them. The new findings (efficiency, latency, stages, breathing, temperature, stress) are informational dashboard-only rules; the alert thresholds still mirror `src/lib/alerts.ts`. `src/lib/sample-nights.ts` generates synthetic Oura-shaped nights for tests and the seed. Thresholds mirror `src/lib/alerts.ts`; change both together. Only the window's slots go to client components.
- Do not add: member email, age band, data outside the window, care-team alerts or notes, analytics or third-party scripts on `/share`.
- Design: `dashboard.css` has three token layers scoped to `.dash` (primitives `--p-*`, semantic `--c-*`, component `--viz-*`); components use only `--c-*`/`--viz-*`. Chart colours `#0b84a5` (data) / `#c96a12` (attention) light, `#2a9fc0` / `#c9711f` dark, and the sleep stages (deep `#4a3fc0`, light `#3d86d6`, REM `#13a08c`, awake `#cf6a1e` light; `#5c4fdc`, `#4a8fe6`, `#2aa77c`, `#c9712a` dark) are validated for colour-blind separation and 3:1 contrast with the dataviz validator; re-validate if you change them. The hero is a night panel in both colour modes (light-on-dark tokens `--h-*`), print swaps it for the light theme. Font: IBM Plex Sans Hebrew (self-hosted via `@fontsource`, no external requests). Charts keep time left to right (newest on the right) inside the RTL page. Print uses the light theme and opens the daily table.
- Server-only code must not import values from a `"use client"` file (shared helpers live in `doctor-dashboard/format.ts` and `chart-utils.ts`). Never pass functions as props to the client charts (formatters are flags or plain data).

## Feature: "התגמולים שלי" self-rewards (member page)

Built on `/member`: the member sets a goal on their own Oura data and the treat they give themselves for reaching it (table `self_rewards`, migration `0004`, logic in `src/lib/self-rewards.ts`). Goal kinds: average over a period, X of Y days, streak with an optional joker, beat my own 28-day baseline, steady bedtime. Several reward options make a mystery reward drawn server-side when opened. Template gallery and live "contract" preview in `self-reward-builder.tsx`.

Rules to keep:

- Member-only. No staff or org page reads `self_rewards`; it is not part of any aggregate and needs no sharing consent.
- Status is computed on read from `daily_metrics`; only the claim is stored. Claiming re-evaluates on the server.
- Separate from the platform's bedtime points (`reward_events`, `rewards` consent).

## Feature: "הקשר חיצוני" public events (member page)

Card on `/member` that puts public events (war, pandemic, disaster) next to the member's own Oura data and says what to do. Migration `0005`: `daily_metrics.stress_minutes/recovery_minutes/stress_summary` (Oura `daily_stress`, same `daily` scope) and global table `context_events`.

- `src/lib/context-events.ts` (pure, tested): impact of an event = member's days during it vs the 14 days before; stress tier (`calm`/`elevated`/`high`) from Oura's own day label; `playbook(kind, tier)` returns the Hebrew steps. Wellbeing guidance, never a diagnosis. The high tier ends with the doctor-summary pointer and ער"ן 1201.
- `src/lib/event-feed.ts` + cron `/api/cron/events` (daily): counts headlines matching keywords in public RSS (ynet, see `src/config/events.ts`), opens an event at `minHeadlines`, closes it after `quietDaysToEnd` quiet days. Stores no headline, only our own label. A dead feed never closes an event. Keywords and thresholds are untuned guesses: tune them in `src/config/events.ts`, fix dates with `MANUAL_EVENTS`.
- Sirens: `src/lib/alert-feed.ts` + table `alert_days` (migration `0008`, country-wide counts per day, no member data). Source `api.tzevaadom.co.il` (unofficial mirror; checked from Vercel: the official oref.org.il endpoints return 403 outside Israel). It only returns the last 50 alerts, so the daily cron and `refreshAlertsIfStale` (after a `/member` render, throttled to 20 minutes) both save it and days are only ever raised. The war event opens on a siren day (`ALERT_RULE.sirenDayAreas`); headlines are the fallback if the source is down. The card shows the pressure level, the last 7 days, and the member's own stress and next-morning sleep on siren days vs other days.
- No member data goes to the news site or anywhere else; the comparison is computed on the page from the member's own rows. Events carry no health data, so no consent scope and no audit entry. The table has no per-member rows.
- Not built: event shading on the doctor dashboard charts, push alerts when an event opens, Home Front Command (Oref) alerts feed.

## Feature: "מרכז פעולות" action center (member page)

On `/member`, card `#actions`: the member defines rules on their own Oura data (metric below/above a threshold) that fire a **webhook**, to either **Home Assistant** or **IFTTT** (tables `automation_rules`, `automation_runs`, migrations `0008` and `0011`; logic in `src/lib/automations.ts`, UI in `src/components/action-center.tsx`). Each rule has a `provider`. n8n also works through the Home Assistant path: only the URL template changes.

Rules to keep:

- Member-only, no consent scope, no staff or org page reads it. Fires only when the member presses the button (no automatic firing yet: the daily cron runs at 03:00, before the night's data exists).
- The server re-checks the condition from `daily_metrics`; the unique `(rule_id, day)` row in `automation_runs` allows one run per rule per day. A failed webhook deletes that row so the member can retry. "Test" skips both.
- **Home Assistant:** the URL comes from `src/config/home-assistant.ts` (`webhookUrlTemplate` with `{id}`; env `HOME_ASSISTANT_WEBHOOK_URL` overrides). Members enter only a webhook id (validated `[A-Za-z0-9_-]`), so they cannot point the server at an arbitrary URL. Vercel needs an internet-reachable address (Nabu Casa `https://hooks.nabu.casa/{id}` or a public HA URL). Payload: `buildWebhookPayload`.
- **IFTTT:** needs no server setup. The host is fixed in `src/config/ifttt.ts` (`https://maker.ifttt.com/trigger/{event}/with/key/{key}`); the member enters an event name and their own Webhooks key (both charset-checked, so the URL cannot be changed). The key is a secret that can fire any of the member's applets: it is stored encrypted (`webhook_key_enc`, AES-256-GCM), is never sent to a page (`AutomationRule.hasKey` only), and a new IFTTT rule with an empty key field reuses the member's latest one. Payload: `buildIftttPayload`, i.e. `value1` = the rule title (free text the member wrote, so the UI warns against medical details), `value2` = `run`/`test`, `value3` = `oura-care-platform`. IFTTT is a US third party; do not send it anything else.
- The payload names the rule only, never a health value. Never log the URL, body or key.
- Connecting Oura to IFTTT directly (IFTTT's own Oura service) happens outside this platform and is not tracked in `consents` or `audit_log`.

## Feature: "ניסויים" experiments (member page)

Card `#experiments` on `/member`, pages `/member/experiments/[id]` and `/member/experiments/[id]/post`. The member changes one thing for as many nights as they like (template "שינה בחוץ", no caffeine after 14:00, ...) and compares those Oura nights with their own nights just before. Table `experiments` (migration `0013`); logic in `src/lib/experiments.ts` (pure, tested), draft post in `src/lib/experiment-post.ts`, page data in `src/lib/experiment-view.ts`.

- An experiment is the nights it covers (`start_night`..`end_night`, any length from 1 to 90 nights, the calendar date the evening starts on). Oura files a night under the next morning, so night N reads Oura day N+1 (`nightOuraDay`). Never name a night "ליל <weekday>": "ליל שבת" is Friday night. Use `fmtNight` ("יום ג׳ 20.10").
- Baseline = the `baseline_days` (7/14/21/28) days that end on the first experiment evening, minus the nights of the member's other experiments. Overlapping experiments are refused.
- Results are computed on read from `daily_metrics`; only the member's words (hypothesis, per-night notes, conclusion) are stored. The comparison is a size-of-change check against the member's own night-to-night spread (under 0.5 sd: "בתוך התנודה הרגילה", 0.5 to 1: a tendency, 1 and up: clear), never a significance test, and the UI and the draft say it is one person, no control group, a sign and not a proof. Do not turn it into "significant" wording. Fewer than 5 baseline nights or 3 experiment nights: no verdict.
- Member-only, no consent scope, no staff or org page reads `experiments`, not part of any aggregate. Own data on own page, so no audit entry. Every action and page re-checks ownership (`getOwnExperiment`); another member gets 404.
- The post page only builds text (blog Markdown, Telegram text, newsletter subject, preview and Markdown) and lets the member copy it. Nothing is sent, the text never goes in a URL or a log. The draft holds aggregates and one line per night: no name, no heart-rate or hypnogram series. `ExperimentPostPackage` (`schemaVersion: 1`) is the contract for the planned n8n hand-off: change it only with a new version.
- Plain-text drafts put a left-to-right mark before signed numbers (`LRM`), and pages wrap numbers in `<Num>`, so a minus or plus does not jump to the wrong side in Hebrew text.
- Not built: sending the post to n8n (design and open questions in `docs/BLOG-WORKFLOW.md`), editing the dates of an experiment (delete and recreate), event shading on the chart, a follow-up window after the last night.

## Oura sync schedule

Vercel is on the Hobby plan: its cron can only run daily, so `vercel.json` keeps the 03:00 `/api/cron/oura-sync` (35 days, `CRON_SECRET`) and a Supabase pg_cron job (`docs/supabase-sync-schedule.sql`, created in the database, not in drizzle) calls the public `/api/sync/tick` every 30 minutes (3 days, only connections whose last sync is 20 minutes old, response is just a count). Keep that route secret-free and stale-gated: it is what makes it safe. Visits to `/member` and the sync button also sync. Never put `CRON_SECRET` into the database job. Sync errors are never logged.

## Not built yet (do not assume it exists)

Sending experiment posts to n8n / Telegram / Kit (`docs/BLOG-WORKFLOW.md`), real authentication (only the demo login creates sessions), live Oura verification, alert delivery outside the app, data export and deletion, retention policy, legal review. See `docs/ARCHITECTURE.md#open-items` and `docs/PRIVACY.md`.
