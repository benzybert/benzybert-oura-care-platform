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
src/components/member-data/  the member's own data views beyond the dashboard (activity, heart and breathing, events, ring, sleep and recovery extras) + member-data.css; data-view-tabs.tsx is their sub-tab bar
src/components/doctor-dashboard/  the doctor dashboard: dashboard.tsx (server), client SVG charts (trend-chart, night-explorer, stack-chart, sleep-clock, heatmap), score-ring, dashboard.css (tokens)
src/db/             Drizzle schema + connection
src/lib/            pure logic (alerts, consent, rewards, self-rewards, summary, auth-rules) + server helpers (queries, session, auth)
src/app/login/      sign-in page, email-link actions, /login/verify
src/lib/oura/       OAuth client, API mapping (map.ts core, map-extras.ts everything else), sync (sync.ts, sync-extras.ts), scopes.ts
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
- **More data is welcome (owner's choice).** No data-minimisation rule: new Oura scopes, the all-day heart-rate series, raw ring data (IBI, PPG, motion, temperature, e.g. from a BLE client like `open_oura`) and new columns are fine when a feature uses them. The other rules still apply to it: consent scopes, server checks, encryption, nothing in URLs or logs, care and org views read only what their consent covers.
- **Care view identity.** Staff see a short code, age band and goal: no names, phone numbers or emails in the care view.
- **Audit.** Any new staff view or consent change writes to `audit_log`.
- **Secrets.** Never commit real values. Tokens stay encrypted (AES-256-GCM). `.env.example` is the only env file in git. Other people's contact details (e.g. doctor emails) stay in the database, never in source. Keys and settings follow "Config lives in files" above.
- **Sign-in is real now** (`docs/ARCHITECTURE.md#sign-in`): "sign in with Oura" (`/api/auth/oura`, account found by `oura_connections.oura_account_hash`, never the raw Oura id) and one-time email links (`login_tokens`, hash only, 15 minutes, single use, POST to use, link built from `siteUrl()` never from the Host header). Both end in `startSession`. New accounts are members in the self-serve org; sign-in never creates staff. **`DEMO_AUTH`** stays on in Production by the owner's choice, but only for the seeded synthetic accounts: never add a demo button that opens a real member's data (the old `role=me` was removed).
- **No health data in URLs, logs or analytics.** Responses stay `no-store`, `X-Frame-Options: DENY`.

## Member area: one tab per topic

`/member` used to be one long page; it is now a short home tab plus one page per topic, with a shared frame (`src/app/member/_shell/member-shell.tsx`: title, tab bar, notices). Tabs: `/member` (היום: last night, today's actions, the ring, one status tile per tab), `/member/data`, `/member/experiments`, `/member/goals`, `/member/actions`, `/member/context`, `/member/sharing` (consent, doctor links, send to doctors, care-team view count), `/member/profile` (profile strength, Instinct).

- Every tab calls `loadMember()` (role check + own member; re-syncs a stale ring unless `{ sync: false }`). It is not a layout on purpose: each page checks the role itself.
- Redirect notices are short query keys (`?doctor=saved`) mapped in `_shell/messages.ts`; any tab shows any of them. Server actions redirect to the tab that owns the feature and call `revalidatePath("/member", "layout")`.
- New member features get their own tab (add it to `MEMBER_TABS` and a tile on the home tab), not another card on the home tab.

## Feature: "send to my doctors" (member page)

Built on `/member/sharing`: a card with two doctor roles (neurologist, family doctor). The member saves each doctor's name and email (table `doctor_contacts`, never in source), clicks "send", reviews the exact message on `/member/send/[role]`, and confirms. The server rebuilds the message from the database (`src/lib/doctor-share.ts`), creates a fresh personal dashboard link for that doctor (30 days of data, valid 14 days; revoked again if the send fails), attaches a PDF of the dashboard (`src/lib/doctor-pdf.ts`, pdf-lib + bidi-js + the self-hosted Plex font files), sends it through Resend (`src/lib/mail.ts`, settings in `src/config/mail.ts`), and writes `share_link_created` and `share_to_doctor` to `audit_log` without the content. The same PDF is downloadable from the dashboard itself (`/share/<token>/pdf`, same open-gate as the page) and from the member preview (`/member/share/preview/pdf`).

Rules to keep:

- Member-initiated only, with the confirmation page. Never automatic.
- Separate from `care_team` consent: it neither reads nor widens it.
- Message content never goes in a URL or a log. No member name in the message; replies go to the member's own address.
- Doctor roles were not pre-filled: the user enters who is the neurologist and who is the family doctor.
- Not built: attachments, a free-text note (the lib supports one, the UI does not), retry or delivery tracking.

## Feature: the member's own dashboard (member page)

The same dashboard component is the main data view, on its own tab `/member/data` ("הנתונים שלי", replacing the old 14-day table): `DoctorDashboard` with `meta.mode = "member"`, built from `getDashboardMetrics(member.id, windowDays)` (30/60/90 days via `/member/data?days=`, same options as share links). Member mode drops the recipient and expiry wording, shows the window switch, a PDF link (`/member/share/preview/pdf`) and a "share with a doctor" link to `/member/sharing#doctors`, and has no print button (the page is not the printout; the PDF is). Own data only, so it is not audited and needs no consent. Keep the `.dash` wrapper out of `main > .dash` position on `/member/data` (the full-width and page-background rules target a direct child of `main`).

## Feature: all Oura data in "הנתונים שלי" (`/member/data`)

The owner asked for **everything the Oura API offers** (migration `0014`, `docs/ARCHITECTURE.md#the-members-data-tab-and-the-full-oura-data`): scopes `daily heartrate workout tag session spo2Daily personal` (`src/lib/oura/scopes.ts`; not `email`). The data tab has views in the URL (`?view=summary|sleep|recovery|activity|heart|events|trends|ring&days=30|60|90`; ids, `resolveView` and `dataHref` in `src/lib/member-nav.ts`): build links with `dataHref`.

- New tables `daily_extras` (per day: activity detail, SpO2, resilience, cardiovascular age, VO2 max, bedtime guidance, naps, sleep movement, temperature trend, the all-day heart-rate curve as 288 five-minute averages per local day), `oura_events` (workouts, sessions, tags, rest mode, naps) and `oura_profile` (ring, person, battery, per-family `coverage`). They are **member-only**: only `/member/data` queries them (`getDayExtras`, `getOuraEvents`, `getOuraProfile`); `getDashboardMetrics`, care, org, share links, PDF and doctor mail never do. Add new Oura fields to these tables, not to `daily_metrics`.
- Sync is **fail-soft** for all of it (`fetchOptional`, `sync-extras.ts`): a 401/403 on an optional endpoint is "forbidden" (the token lacks the scope), never `needs_reconnect`; a malformed row is skipped; a storage error cannot fail a sync that already saved the core rows. Only the five core collections decide whether a token is dead. Members connected before `0014` hold `daily` only: the ring card (home) and the ring view then offer "אישור הרשאות נוספות" (the normal `/api/oura/connect` flow), also whenever `coverage` has a `forbidden` family. `oura_connections.scopes` stores what Oura reports as granted. `oura_profile.coverage` says per Oura collection whether it answered; the ring view shows it.
- After a connect or Oura sign-in the callback runs (with `after()`) a 35-day sync and then a one-off `HISTORY_DAYS` (730) history pull without the heart-rate curve (`{ history: true }`, keeps `coverage`).
- The dashboard component takes `meta.sections` (and `contributorSets`) to render only part of itself for the member's views; with them absent (doctor link, preview, PDF) it renders everything, as before. Keep `Section`'s `show` prop and the exports used by `member-data/*` in `dashboard.tsx`.
- Demo data: `src/lib/sample-extras.ts` (tests and `npm run db:seed`, T-01 only). Do not write synthetic rows into a real member's data.
- Not stored: `interbeat_interval`, the per-minute MET series, 30-second sleep phases, Oura's ring id, `email`. The heart-rate curve keeps 5-minute averages per local day (Asia/Jerusalem).
- Scope names (`spo2Daily` etc.) were taken from Oura's published client types, not verified against a live authorization. `NEWER_SCOPES` (`spo2 stress heart_health ring_configuration`) are asked for too; on `invalid_scope` the callback retries once without them (`?basic=1`), so a wrong name never blocks a connection. Fix names in `scopes.ts`. Which of the newer daily endpoints need an extra scope is unverified: the coverage table shows what actually answered.

## Feature: doctor dashboard link (member page)

On `/member/sharing`, card "דאשבורד לרופא": the member creates a read-only link (`/share/<token>`) for a doctor, previews it on `/member/share/preview?days=30`, copies or shares it, sees how many times it was opened, and revokes it. Details in `docs/ARCHITECTURE.md#doctor-dashboard-links`.

- Table `share_links` (migration `0003`). Lookup by `sha256(token)` only; `token_enc` exists so the member can copy again. Never log or store the plain token anywhere else.
- `/share/[token]` re-checks status on every request. First screen (`ShareGate`) has no health data and no name; data only after the "open" POST (`openShareLink`), which audits `share_link_viewed` and sets a signed cookie scoped to that link's path. Unknown, expired and revoked links all get the same 404 page.
- Dashboard numbers come from `src/lib/doctor-dashboard.ts` and `doctor-dashboard-detail.ts` (pure, tested). The sleep structure, night curves, contributors and activity minutes are extra fields of the same `daily` Oura calls (migration `0012`, columns on `daily_metrics`, parsed leniently in `src/lib/oura/map.ts`); `getDashboardMetrics` is the only reader, so care and org views never see them. Sync re-pulls 35 days, which also backfills them. The new findings (efficiency, latency, stages, breathing, temperature, stress) are informational dashboard-only rules; the alert thresholds still mirror `src/lib/alerts.ts`. `src/lib/sample-nights.ts` generates synthetic Oura-shaped nights for tests and the seed. Thresholds mirror `src/lib/alerts.ts`; change both together. Only the window's slots go to client components.
- Do not add: member email, age band, data outside the window, care-team alerts or notes, analytics or third-party scripts on `/share`.
- Design: `dashboard.css` has three token layers scoped to `.dash` (primitives `--p-*`, semantic `--c-*`, component `--viz-*`); components use only `--c-*`/`--viz-*`. Chart colours `#0b84a5` (data) / `#c96a12` (attention) light, `#2a9fc0` / `#c9711f` dark, and the sleep stages (deep `#4a3fc0`, light `#3d86d6`, REM `#13a08c`, awake `#cf6a1e` light; `#5c4fdc`, `#4a8fe6`, `#2aa77c`, `#c9712a` dark) are validated for colour-blind separation and 3:1 contrast with the dataviz validator; re-validate if you change them. The hero is a night panel in both colour modes (light-on-dark tokens `--h-*`), print swaps it for the light theme. Font: IBM Plex Sans Hebrew (self-hosted via `@fontsource`, no external requests). Charts keep time left to right (newest on the right) inside the RTL page. Print uses the light theme and opens the daily table.
- Server-only code must not import values from a `"use client"` file (shared helpers live in `doctor-dashboard/format.ts` and `chart-utils.ts`). Never pass functions as props to the client charts (formatters are flags or plain data).

## Feature: "התגמולים שלי" self-rewards (member page)

Built on `/member/goals`: the member sets a goal on their own Oura data and the treat they give themselves for reaching it (table `self_rewards`, migration `0004`, logic in `src/lib/self-rewards.ts`). Goal kinds: average over a period, X of Y days, streak with an optional joker, beat my own 28-day baseline, steady bedtime. Several reward options make a mystery reward drawn server-side when opened. Template gallery and live "contract" preview in `self-reward-builder.tsx`.

Rules to keep:

- Member-only. No staff or org page reads `self_rewards`; it is not part of any aggregate and needs no sharing consent.
- Status is computed on read from `daily_metrics`; only the claim is stored. Claiming re-evaluates on the server.
- Separate from the platform's bedtime points (`reward_events`, `rewards` consent).

## Feature: "הקשר חיצוני" public events (member page)

Tab `/member/context` that puts public events (war, pandemic, disaster) next to the member's own Oura data and says what to do. Migration `0005`: `daily_metrics.stress_minutes/recovery_minutes/stress_summary` (Oura `daily_stress`, same `daily` scope) and global table `context_events`.

- `src/lib/context-events.ts` (pure, tested): impact of an event = member's days during it vs the 14 days before; stress tier (`calm`/`elevated`/`high`) from Oura's own day label; `playbook(kind, tier)` returns the Hebrew steps. Wellbeing guidance, never a diagnosis. The high tier ends with the doctor-summary pointer and ער"ן 1201.
- `src/lib/event-feed.ts` + cron `/api/cron/events` (daily): counts headlines matching keywords in public RSS (ynet, see `src/config/events.ts`), opens an event at `minHeadlines`, closes it after `quietDaysToEnd` quiet days. Stores no headline, only our own label. A dead feed never closes an event. Keywords and thresholds are untuned guesses: tune them in `src/config/events.ts`, fix dates with `MANUAL_EVENTS`.
- Sirens: `src/lib/alert-feed.ts` + table `alert_days` (migration `0008`, country-wide counts per day, no member data). Source `api.tzevaadom.co.il` (unofficial mirror; checked from Vercel: the official oref.org.il endpoints return 403 outside Israel). It only returns the last 50 alerts, so the daily cron and `refreshAlertsIfStale` (after a `/member` render, throttled to 20 minutes) both save it and days are only ever raised. The war event opens on a siren day (`ALERT_RULE.sirenDayAreas`); headlines are the fallback if the source is down. The card shows the pressure level, the last 7 days, and the member's own stress and next-morning sleep on siren days vs other days.
- No member data goes to the news site or anywhere else; the comparison is computed on the page from the member's own rows. Events carry no health data, so no consent scope and no audit entry. The table has no per-member rows.
- Not built: event shading on the doctor dashboard charts, push alerts when an event opens, Home Front Command (Oref) alerts feed.

## Feature: "מרכז פעולות" action center (member page)

On `/member/actions`: the member defines rules on their own Oura data (metric below/above a threshold) that fire a **webhook**, to either **Home Assistant** or **IFTTT** (tables `automation_rules`, `automation_runs`, migrations `0008` and `0011`; logic in `src/lib/automations.ts`, UI in `src/components/action-center.tsx`). Each rule has a `provider`. n8n also works through the Home Assistant path: only the URL template changes.

Rules to keep:

- Member-only, no consent scope, no staff or org page reads it. Fires only when the member presses the button (no automatic firing yet: the daily cron runs at 03:00, before the night's data exists).
- The server re-checks the condition from `daily_metrics`; the unique `(rule_id, day)` row in `automation_runs` allows one run per rule per day. A failed webhook deletes that row so the member can retry. "Test" skips both.
- **Home Assistant:** the URL comes from `src/config/home-assistant.ts` (`webhookUrlTemplate` with `{id}`; env `HOME_ASSISTANT_WEBHOOK_URL` overrides). Members enter only a webhook id (validated `[A-Za-z0-9_-]`), so they cannot point the server at an arbitrary URL. Vercel needs an internet-reachable address (Nabu Casa `https://hooks.nabu.casa/{id}` or a public HA URL). Payload: `buildWebhookPayload`.
- **IFTTT:** needs no server setup. The host is fixed in `src/config/ifttt.ts` (`https://maker.ifttt.com/trigger/{event}/with/key/{key}`); the member enters an event name and their own Webhooks key (both charset-checked, so the URL cannot be changed). The key is a secret that can fire any of the member's applets: it is stored encrypted (`webhook_key_enc`, AES-256-GCM), is never sent to a page (`AutomationRule.hasKey` only), and a new IFTTT rule with an empty key field reuses the member's latest one. Payload: `buildIftttPayload`, i.e. `value1` = the rule title (free text the member wrote, so the UI warns against medical details), `value2` = `run`/`test`, `value3` = `oura-care-platform`. IFTTT is a US third party; do not send it anything else.
- The payload names the rule only, never a health value. Never log the URL, body or key.
- Connecting Oura to IFTTT directly (IFTTT's own Oura service) happens outside this platform and is not tracked in `consents` or `audit_log`.

## Feature: "ניסויים" experiments (member page)

Tab `/member/experiments`, pages `/member/experiments/[id]` and `/member/experiments/[id]/post`. The member changes one thing for as many nights as they like (template "שינה בחוץ", no caffeine after 14:00, ...) and compares those Oura nights with their own nights just before. Table `experiments` (migration `0013`); logic in `src/lib/experiments.ts` (pure, tested), draft post in `src/lib/experiment-post.ts`, page data in `src/lib/experiment-view.ts`.

- An experiment is the nights it covers (`start_night`..`end_night`, any length from 1 to 90 nights, the calendar date the evening starts on). Oura files a night under the next morning, so night N reads Oura day N+1 (`nightOuraDay`). Never name a night "ליל <weekday>": "ליל שבת" is Friday night. Use `fmtNight` ("יום ג׳ 20.10").
- Baseline = the `baseline_days` (7/14/21/28) days that end on the first experiment evening, minus the nights of the member's other experiments. Overlapping experiments are refused.
- Results are computed on read from `daily_metrics`; only the member's words (hypothesis, per-night notes, conclusion) are stored. The comparison is a size-of-change check against the member's own night-to-night spread (under 0.5 sd: "בתוך התנודה הרגילה", 0.5 to 1: a tendency, 1 and up: clear), never a significance test, and the UI and the draft say it is one person, no control group, a sign and not a proof. Do not turn it into "significant" wording. Fewer than 5 baseline nights or 3 experiment nights: no verdict.
- Member-only, no consent scope, no staff or org page reads `experiments`, not part of any aggregate. Own data on own page, so no audit entry. Every action and page re-checks ownership (`getOwnExperiment`); another member gets 404.
- The post page only builds text and lets the member copy it: headline options, a "בקצרה" opening, blog Markdown and HTML (rendered preview, "copy as formatted text" for blog/Kit editors), Telegram text with a length count, newsletter subject, preview and body. Nothing is sent, the text never goes in a URL or a log. The draft holds aggregates, counts and one line per night: no name, no heart-rate or hypnogram series. The HTML comes only from `src/lib/markdown-lite.ts`, which escapes everything first (that is what makes `dangerouslySetInnerHTML` on the post page safe; keep it that way). `ExperimentPostPackage` (`schemaVersion: 2`) is the contract for the planned n8n hand-off: change it only with a new version.
- Night-level view: each night of the deciding metric is above, within or below the member's usual range (baseline mean ± one sd, `nightBand`), shown as a strip and per-night badges and counted in the draft, plus the best and least good night. A weekend-mix caution (Thursday/Friday evenings, `weekendMix`) is added when the experiment and the baseline differ by 30 points or more. The card on `/member/experiments` has a quick note for last night (`saveExperimentNightNote`, re-checks ownership and that the night belongs to the experiment).
- Plain-text drafts put a left-to-right mark before signed numbers (`LRM`), and pages wrap numbers in `<Num>`, so a minus or plus does not jump to the wrong side in Hebrew text.
- Not built: sending the post to n8n (design and open questions in `docs/BLOG-WORKFLOW.md`), editing the dates of an experiment (delete and recreate), event shading on the chart, a follow-up window after the last night.

## Oura sync schedule

Functions run in `fra1` (`vercel.json`) next to the database (Supabase eu-central-1): keep them together, a region mismatch made every query a transatlantic round trip. Page visits never wait for Oura: `syncOnVisit` atomically claims a stale connection (stamps `last_sync_at`), syncs 3 days in `after()`, and `SyncRefresher` re-renders the page once.

Vercel is on the Hobby plan: its cron can only run daily, so `vercel.json` keeps the 03:00 `/api/cron/oura-sync` (35 days, `CRON_SECRET`) and a Supabase pg_cron job (`docs/supabase-sync-schedule.sql`, created in the database, not in drizzle) calls the public `/api/sync/tick` every 30 minutes (3 days, only connections whose last sync is 20 minutes old, response is just a count). Keep that route secret-free and stale-gated: it is what makes it safe. Visits to `/member` and the sync button also sync. Never put `CRON_SECRET` into the database job. Sync errors are never logged.

## Not built yet (do not assume it exists)

Sending experiment posts to n8n / Telegram / Kit (`docs/BLOG-WORKFLOW.md`), a verified Resend sending domain (until then sign-in emails only reach the Resend account owner), staff invitations and SSO, Oura app approval for more than ~10 users, live Oura verification, alert delivery outside the app, data export and deletion, retention policy, legal review. See `docs/ARCHITECTURE.md#open-items` and `docs/PRIVACY.md`.
