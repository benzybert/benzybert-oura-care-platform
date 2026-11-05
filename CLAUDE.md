# CLAUDE.md

Guidance for working on this repo. Read `README.md` and `docs/` for detail; this file is the short version plus the rules that must not be broken.

## What this is

Oura-based member health platform with three views over one dataset: member (`/member`), care team (`/care`), organization (`/org`). Health data, so **consent is the foundation**. Stack: Next.js 16 (App Router, TS), Postgres + Drizzle, Oura API v2, Vercel, Vitest. Node 22+.

- Repo: `benzybert/benzybert-oura-care-platform`
- Vercel project: `oura-care-platform`
- UI language is **English by default, Hebrew (RTL) one click away** (owner's decision, Nov 2026). New UI text goes into the typed dictionaries in `src/lib/i18n/dict/*.ts` (English first, Hebrew laid over it key by key; a missing Hebrew key falls back to English), never hard-coded in a component. Use logical CSS (`text-align: start`, `margin-inline-*`) so both directions work, and keep layouts good at phone width. Parts still written only in Hebrew (the data tab and its views, experiments and blog drafts, self-rewards, doctor links, PDF and mail, Instinct, `/suggest`) are shown as a right-to-left island (`hebrew` prop on `MemberShell`, `HebrewIsland`); translating them is open work, and doctor- and blog-facing text may reasonably stay Hebrew. Pages that third parties read in Hebrew (`/share`, `/suggest`) set `dir="rtl"` on their own root.

## Where things live

```
src/app/            pages (member, care, org), server actions (actions.ts), API routes
src/components/     shared UI (metrics-table, logout-button, share-link card, doctor-share-card, self-rewards-section + self-reward-builder)
src/components/member-data/  the member's own data views beyond the dashboard (activity, heart and breathing, events, ring, sleep and recovery extras) + member-data.css; data-view-tabs.tsx is their sub-tab bar
src/components/doctor-dashboard/  the doctor dashboard: dashboard.tsx (server), client SVG charts (trend-chart, night-explorer, stack-chart, sleep-clock, heatmap), score-ring, dashboard.css (tokens)
src/db/             Drizzle schema + connection
src/lib/            pure logic (alerts, consent, rewards, self-rewards, summary, auth-rules) + server helpers (queries, session, auth)
src/app/login/      sign-in page, email-link actions, /login/verify
src/lib/i18n/       locale cookie, typed dictionaries (dict/*.ts), getT() for server components
src/lib/heart/      the heart watch: engine.ts (baselines, signals), episodes.ts (all-day curve), watch.ts (alerts, sending, escalation), data.ts (queries), view.ts
src/lib/notify/     alert delivery: policy (who hears what), channels (Twilio, webhooks), text (messages), phone, webhook-url (SSRF guard)
src/lib/circle/     family circle queries; src/lib/challenges.ts + challenge-data.ts: competitions
src/components/heart/  heart-watch UI (charts, settings form, alert list, focus picker) + heart.css (hw-*)
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

`/member` used to be one long page; it is now a short home tab plus one page per topic, with a shared frame (`src/app/member/_shell/member-shell.tsx`: title, navigation, notices). The navigation is a sidebar with line icons on screens 900px and wider (left in English, right in Hebrew; health tabs, a divider, then `ACCOUNT_TABS` sharing and profile, via `navGroups`) and a sticky scrolling bar of icon chips on phones; icons live in `src/components/member-nav-icon.tsx`, styles under `.member-nav` in `globals.css`. A new tab needs an icon there too. Tabs: `/member` (היום: last night, today's actions, the ring, one status tile per tab), `/member/data`, `/member/experiments`, `/member/goals`, `/member/sharing` (consent, doctor links, send to doctors, care-team view count), `/member/profile` (profile strength, Instinct).

- Every tab calls `loadMember()` (role check + own member; re-syncs a stale ring unless `{ sync: false }`). It is not a layout on purpose: each page checks the role itself.
- Redirect notices are short query keys (`?doctor=saved`) mapped in `_shell/messages.ts`; any tab shows any of them. Server actions redirect to the tab that owns the feature and call `revalidatePath("/member", "layout")`.
- New member features get their own tab (add it to `TAB_IDS`/`TAB_HREFS` in `src/lib/member-tabs.ts`, its label to `core.tabs` in the dictionary, an icon in `member-nav-icon.tsx`, and a tile on the home tab), not another card on the home tab. Tabs: home, heart, circle (family), challenges, data, assistant, experiments, goals, medications, biomarkers, labs, integrations, sharing, profile. Their order follows the member's main focus (`tabOrder`); the sidebar groups them (`navGroups`: ring and habits, `RECORD_TABS`, `ACCOUNT_TABS`) and ends with "Create custom view" and the member's custom views (`loadMember` loads them).
- `loadMember()` also loads `member_prefs`, the open heart alerts and the member's custom views; `MemberShell` reads them for the tab order and the alert banner. A member who has not answered onboarding (`member_prefs.onboarded_at`) is sent from Home to `/member/welcome` once; skipping counts.

## Feature: "Ask my data" AI assistant (`/member/assistant`, Nov 2026)

A chat with Claude over the member's own data. The page `src/app/member/assistant/page.tsx` + client `src/components/assistant-chat.tsx` (styles `assistant.css`, `as-*`; text `src/lib/i18n/dict/assistant.ts`) post the conversation to `POST /api/assistant/chat`, which streams JSON lines (`AssistantEvent`). The loop is `src/lib/ai/assistant.ts` (streaming, tool use, `fallbacks: "default"`, effort medium, at most 8 tool rounds); the tools are defined in `src/lib/ai/assistant-data.ts` (pure, tested: schemas, row formatting, `clampRange` caps a window at `MAX_TOOL_DAYS`) and run in `src/lib/ai/assistant-tools.ts`.

- **The member id comes from the session, never from the model or the body.** Every tool query filters by it; tools are read-only. The tools read `daily_metrics` (no hypnogram or night series), `daily_extras` (no heart-rate buckets), labs, medications, experiments, member age band/goal/focus. Add a tool by adding a spec, a formatter with a test, and a case in `runAssistantTool`.
- **Nothing is stored or logged**: the conversation lives in the browser (`sessionStorage`, key `oc-assistant-v1`) and comes back with each question; no audit (own data on own page, no consent scope). The page says the question and data go to Anthropic and that it is not medical advice.
- **History rule (preserved thinking):** earlier turns are sent as plain text; thinking, fallback and tool blocks exist only inside the question that produced them and are passed back unchanged within it. Do not start replaying blocks across questions or editing earlier turns without reading the Claude API rules on the history check first.
- **Honesty rules live in the system prompt** (`assistantSystemPrompt`, tested): not a doctor, never change medication, emergencies → 101, patterns not causes, ranges "a עד b". Keep them when editing the prompt.
- Answers render with `markdown-lite` (escapes first). Not built: saved conversations, attachments, a per-member cost limit (set a spend limit in the Anthropic Console).

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
- Sync is **fail-soft** for all of it (`fetchOptional`, `sync-extras.ts`): a 401/403 on an optional endpoint is "forbidden" (the token lacks the scope), never `needs_reconnect`; a malformed row is skipped; a storage error cannot fail a sync that already saved the core rows. Only the five core collections decide whether a token is dead. "אישור הרשאות נוספות" (the normal `/api/oura/connect` flow) is offered **at most once**: only to a connection made before `FULL_REQUEST_SINCE` (`scopes.ts`, `needsMorePermissions`) that lacks a scope or was refused a family. After that one approval (which asks for everything) the member is never asked again, even if Oura still refuses a family (they unticked it, or the ring lacks it): the ring view then explains that instead of showing the button. Never compare stored scopes with the list we ask for: Oura grants `spo2` where an older list said `spo2Daily`, which made the prompt come back forever. `oura_connections.scopes` stores what Oura reports as granted. `oura_profile.coverage` says per Oura collection whether it answered; the ring view shows it.
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

Built on `/member/goals`: the member sets a goal on their own Oura data and the treat they give themselves for reaching it (table `self_rewards`, migration `0004`, logic in `src/lib/self-rewards.ts`). Goal kinds: average over a period, X of Y days, streak with an optional joker, beat my own 28-day baseline, steady bedtime. Several reward options make a mystery reward drawn server-side when opened.

- Kept deliberately light (owner asked for less clutter): summary pills, a card per active goal with a progress ring and two short lines, details and delete behind the "⋯" menu, won and missed goals as one quiet row each, history folded. The bedtime points are one pill, not a card.
- The builder (`self-reward-builder.tsx`) is three steps: 1 pick an idea (or "יעד משלי"; the list collapses to the pick), 2 the prize (one field per option, more options make the mystery draw, optional ₪), 3 the one-sentence deal and "סגרנו". The rule fields are folded under "לשנות את היעד". It posts the same form fields as before and previews with the same parser as the server.
- Styles in `src/components/self-rewards.css` (`rw-*`). The old `sr-*` rules in `globals.css` are still used by the experiments pages.

Rules to keep:

- Member-only. No staff or org page reads `self_rewards`; it is not part of any aggregate and needs no sharing consent.
- Status is computed on read from `daily_metrics`; only the claim is stored. Claiming re-evaluates on the server.
- Separate from the platform's bedtime points (`reward_events`, `rewards` consent).

## Feature: heart watch, family circle, alarms, challenges, onboarding (Nov 2026)

Built for a family member with a heart condition, details in `docs/ARCHITECTURE.md` (Heart watch, Family circle and alarms, Challenges, Onboarding) and `docs/PRIVACY.md`. Migration `0017` (tables `member_prefs`, `heart_settings`, `heart_alerts`, `alert_deliveries`, `circle_links`, `alert_devices`, `challenges`, `challenge_participants`).

- **The watch is not a diagnosis and not live.** It compares a person with their own normal (`src/lib/heart/engine.ts`, thresholds in `SPECS`, scaled by sensitivity) and says so. Ring data arrives minutes to hours late; every page and message says so and tells the person to call their local emergency number. Never describe it as detecting heart attacks or arrhythmia, and never add medical claims.
- **Only for members who ask for it.** The Heart tab, its home card and tile, and the alert banner appear only when `heart` is in `member_prefs.focus_areas` (main focus or extra, `wantsHeart` in `member-tabs.ts`). `/member/heart` and `saveHeartSettings` redirect others to `/member/profile?heart=off`; saving a focus without heart switches `monitoring` off. The onboarding picker has no preselected focus.
- **Nothing urgent is a default.** `urgent` (phone calls, sirens) comes only from the member's own limits with "urgent triggers" switched on (`heart_settings`). Derived-baseline rules stop at `alert`. Do not add default limits, and keep the limit forms empty until the member fills them.
- **Alerts must stay quiet and exactly-once.** One message per run for the most serious new alert (the others are named in it); a persistent drift updates one row; the `alert_deliveries` unique row is inserted before every send; `runHeartWatch`/`escalateOpenAlerts` are idempotent. Changing `notifiable()` or the delivery lock needs the integration test (below).
- **Family circle is the member's own sharing, not a consent scope.** Guardians use `/family/<token>` (same pattern as doctor links: hash lookup, `circle_open` cookie scoped to the path, audited opening, 404 for unknown/removed/expired). They see heart measures only. Alarm webhooks (`alert_devices`) are encrypted, https-only, public-host-only (`checkWebhookUrl` plus `assertPublicHost` before each call) and carry no health numbers. Text and calls need Twilio keys in `src/config/notify.ts` (empty = off; keys in code are the owner's accepted trade-off, as for mail). Sends the member starts (tests, invites) are rate-limited; nobody is ever messaged by a build or a seed.
- **Challenges** read only the chosen metric column for the challenge days (`loadStandings`); the default scoring is against the person's own previous four weeks so a cardiac patient and a runner can play fairly. Joining is the consent; leaving removes the score. Invite codes use an alphabet without 0, O, 1, I, L: seed or test codes must too.
- **Tests that need a real database**: `src/lib/heart/watch.integration.test.ts` runs only with `TEST_DATABASE_URL` set to a throwaway Postgres with every migration applied (channels are mocked, nothing is sent). Run it when touching `watch.ts`, `challenge-data.ts` or the schema. Known gaps in the repo's migrations on a fresh database: `0006` enables RLS on `context_events` that no migration creates, and no SQL file adds `daily_metrics.stress_*` (they exist in Production). Create those two by hand when building a scratch database.
- **Schedule**: `docs/supabase-sync-schedule.sql` also defines `heart-watch-tick` (every 5 minutes, `/api/alerts/tick`, no secret, returns counts only). It must be created in the database once for repeats and "no data" alerts to run between syncs.
- **Branch note**: this work was developed on `claude/heart-health-monitoring-r58zzd` (the session's designated branch), not `main`.

## Feature: health records, integrations, custom views (Nov 2026)

Migration `0018` (tables `medications`, `lab_reports`, `lab_results`, `custom_views`), details in `docs/ARCHITECTURE.md#health-records-integrations-and-custom-views-migration-0018`. Tabs `/member/medications`, `/member/labs` (+ `/member/labs/[id]`), `/member/biomarkers`, `/member/integrations`, and `/member/views/new` + `/member/views/[id]`. Text in `src/lib/i18n/dict/records.ts` (English and Hebrew), styles in `src/components/records.css` (`rc-*`), queries in `src/lib/records-data.ts`, actions in `src/app/records-actions.ts`.

- **Member-only.** No staff, org, doctor-link, PDF, family or aggregate code reads these tables; every query filters by the member's id and every action re-checks ownership. No consent scope, no audit (own data on own pages).
- **Medications**: "since you started" reuses `compareMetric` from `experiments.ts` (same thresholds, same honesty wording) and always says never to change a medication because of it without a doctor. Never call it an effect of the medication.
- **Labs and biomarkers**: catalog in `src/lib/biomarkers.ts` (names in the dictionary). The lab's own printed range always wins; the catalog's common adult range is used only when the unit matches. "Within / below / above the range", never a diagnosis. Ranges written "a to b", never with a dash. Not built: unit conversion, editing a result (delete and re-add).
- **Reading a lab PDF** (`/member/labs#upload`, `readLabPdf` + `LabPdfImport`): text-based PDFs up to 4 MB / 20 pages (`serverActions.bodySizeLimit` in `next.config.ts`; Vercel caps a body at 4.5 MB). `src/lib/pdf-text.ts` rebuilds lines with `unpdf` (pdf.js 6, no eval); `src/lib/lab-pdf.ts` (pure, tested) matches marker names (English, abbreviations, Hebrew, also reversed or in visual word order), value, unit, printed range, the collection date and the health fund. "Read the PDF" is plain pattern matching on our server and sends nothing anywhere; the file and its text are never stored or logged, and the draft goes only back to the member's browser for review; only "save" writes. Short aliases (`k`, `na`, `mg`, `alt`...) count only at the start of a line; `EXCLUDE` keeps "iron binding", "Cholesterol/HDL ratio", urine tests and MCH from passing as the base marker. Add new aliases there with a test.
- **Reading a lab PDF with AI** (owner's request, Nov 2026): a second button "Read with AI (Claude)" (`mode=ai`) sends that one file to the Anthropic API (`src/lib/ai/lab-reader.ts`, `@anthropic-ai/sdk`, structured output, `fallbacks: "default"`), which also reads scans and photos. Only on the member's click, per file, with the page saying it goes to Anthropic; never automatic, never for text-only reading. The answer is re-checked in `src/lib/ai/lab-extract.ts` (pure, tested: catalog key, numbers, dates, ranges, plausibility; unknown markers become "Other" rows with the printed name; results from another day go to `otherDays`) and lands in the same review form; nothing is stored or logged (not the file, not the answer, not the error text). The prompt asks for no personal details. Key and model in `src/config/ai.ts` (`ANTHROPIC_API_KEY` env wins; empty = the button is hidden). This is the shared AI entry point (`src/lib/ai/`): put future assistant features there, and anything that sends member data to the AI must be member-initiated and say so.
- **Integrations**: other wearables stay marked planned, as on the landing page.
- **Custom views**: cards from `WIDGET_IDS`; stored ids no longer in the catalog are skipped (`knownWidgets`), so removing a card never breaks a view. A view reads only the data its cards need.

## Removed: "מרכז פעולות" and "הקשר חיצוני"

The owner removed both tabs (action center webhooks to Home Assistant / IFTTT, and public events with sirens). Their pages, components, server actions, libs, configs and the `/api/cron/events` cron are deleted. The tables (`automation_rules`, `automation_runs`, `context_events`, `alert_days`, the `daily_metrics.stress_*` columns) stay in the database untouched: dropping them is destructive and needs the owner's go-ahead. Do not bring the features back without being asked. (The heart-watch alarms above are a different, explicitly requested feature with their own tables; they do not revive the old rules, webhook tables or code.)

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

## Feature: "הבייסליין שלי" (the blog's first post)

Page `/member/experiments/baseline`, reached from the "הבייסליין של החודש הראשון" button at the top of `/member/experiments`. It describes the member's first month with the ring without any experiment and builds a copy-only draft post (blog, Telegram, newsletter) about it. Logic in `src/lib/baseline.ts` (window and summary, pure, tested) and `src/lib/baseline-post.ts` (draft, `BaselinePostPackage` `schemaVersion: 1`, change it only with a new version).

- The window is 30 nights from the night before the first Oura day with sleep data (`getFirstSleepDay`). An experiment inside it ends the window the evening before (if 14+ nights remain), otherwise the window starts again after the experiment. Computed on read, nothing stored.
- The summary: per metric mean, usual range (mean ± one sd), lowest and highest; Thursday/Friday evenings against other nights; week by week; best and least good night; and the change a later experiment would need (0.5 and 1 sd, the same thresholds as `experiments.ts`). Same honesty rules as the experiments: one person, one month, a sign and not a proof.
- Ranges are written "74 עד 81", never with a dash between two numbers (it flips in RTL text).
- Member-only, own data, no consent scope, no audit, nothing sent. The draft cards are shared with the experiment post (`src/components/post-draft.tsx`).
- It is the newsletter's first post (the owner pastes it into Kit), so it also explains the format, one experiment every week (`FORMAT_SECTION`), and ends with the call for experiment ideas (`suggestSection` in `src/lib/post-parts.ts`).

## Feature: "הציעו ניסוי" (experiment suggestions from readers)

A public page `/suggest/<slug>` (migration `0016`, tables `suggestion_boxes` one per member and `experiment_suggestions`, logic in `src/lib/suggestions.ts`). The member creates it from the "הצעות לניסויים" card on `/member/experiments`; its absolute URL (`suggestUrl`, from `siteUrl()`) goes into the baseline and experiment drafts as a "הציעו ניסוי" link (Kit: a Button block with that URL) and the Telegram text. Without a page the drafts ask readers to reply to the email.

- The page has no member name and no health data, and only writes: an idea (3 to 300 chars) and an optional name. Honeypot field `website`; at most 30 ideas an hour and 200 waiting per member (`submitSuggestion`). `noindex`, `no-referrer`. Unknown slugs 404.
- The slug is not hashed: it only lets someone send an idea. "החלף קישור" replaces it and the old link stops working.
- Ideas are public free text: shown only to that member, never logged, not part of any aggregate, no staff or org page reads them. The member marks each one "בחרתי" or "הסתר" (status `new|used|dismissed`).
- `markdown-lite` renders `[text](https://...)` links (http and https only, after escaping).

## Landing page (`/`)

Public marketing page, designed in v0 and rebuilt here in plain CSS (no Tailwind, no motion library, no third-party scripts): `src/app/page.tsx`, styles in `src/app/landing.css` (scoped to `.lp`, tokens `--lp-*`; it hides the global app bar and runs full width via `:has`), components in `src/components/landing/` (the 24-hour dial is pure SVG + CSS, the counter and the solutions tabs are the only client components), geometry and sample numbers in `src/lib/landing/` (pure, tested). Copy in `src/lib/i18n/dict/landing.ts` (English and Hebrew). Display fonts are self-hosted: Instrument Serif (Latin) and Frank Ruhl Libre (Hebrew).

- Same honesty rules as the product: not a diagnosis, not live monitoring, no testimonials, user counts or logos, every chart labelled illustrative. Promises to doctors and organizations must match what the platform enforces (coded care view, audit, aggregates only above `ORG_MIN_COHORT`).
- Wearables: only Oura is connected. The other devices and the "wear more than one" timeline are marked **planned**; do not change a device to "connected" until a real connector exists.
- Signed-in visitors get "My area" instead of sign-up buttons; demo links appear only with `DEMO_AUTH`.
- Sections: hero, 01 problem, 02 the next phase (vision, "why now" context, four from/to shifts), 03 solutions, 04 use cases (six example scenarios, labelled as examples and not real patients), sample report, 05 how, 06 wearables, 07 privacy, 08 FAQ. The 24-hour framing ("23 h 45 min", 525,585 minutes) is kept only in the dial and the counter; headlines speak of "the weeks between visits". Use cases may only describe what the platform does today (labs, for example, are member-only and never reach a doctor link).

## Feature: open-source enrichments (Nov 2026)

Built from a review of GitHub projects; details in `docs/ARCHITECTURE.md` (Oura sync, Deeper analysis on the data tab, Heart watch, Family circle).

- **Oura webhooks** (`/api/oura/webhook`, `src/lib/oura/webhook.ts`): signed with the Oura client secret (upper-case HMAC of timestamp + body), handshake token derived from the secret, lookup by `ouraAccountHash` only, 60-second claim (`syncOnWebhook`), 3-day sync in `after()`, always 204, nothing logged. The daily cron creates and renews the subscriptions (fail-soft). Webhooks make data arrive sooner; the watch is still not live and the wording stays.
- **HRV in depth** (`src/lib/hrv.ts`, NeuroKit2 definitions) and **sleep structure** (`src/lib/sleep-structure.ts`, YASA statistics on Oura's 5-minute stages): pure, tested, computed on read, member data tab only. No LF/HF or Poincaré (Oura sends no beat intervals); never call it a sleep-lab result.
- **Resting heart rate drift** (`resting_hr_drift`, CUSUM): `watch` only, quiet when `resting_hr_high` fires, not in "several signals".
- **ntfy alarms**: alarm kind `ntfy`, JSON publish to the topic's server, level and name only, member's language.
- **FHIR export** (`/member/data/fhir`, `src/lib/fhir.ts`, `@medplum/fhirtypes` types only): member's own download, Patient without identity, LOINC where it fits. Do not add names or contact details to it.
- New text for these is in `src/lib/i18n/dict/insights.ts` (English and Hebrew); the cards on the Hebrew data island follow the visitor's language.

## Oura sync schedule

Functions run in `fra1` (`vercel.json`) next to the database (Supabase eu-central-1): keep them together, a region mismatch made every query a transatlantic round trip. Page visits never wait for Oura: `syncOnVisit` atomically claims a stale connection (stamps `last_sync_at`), syncs 3 days in `after()`, and `SyncRefresher` re-renders the page once.

Vercel is on the Hobby plan: its cron can only run daily, so `vercel.json` keeps the 03:00 `/api/cron/oura-sync` (35 days, `CRON_SECRET`) and a Supabase pg_cron job (`docs/supabase-sync-schedule.sql`, created in the database, not in drizzle) calls the public `/api/sync/tick` every 30 minutes (3 days, only connections whose last sync is 20 minutes old, response is just a count). Keep that route secret-free and stale-gated: it is what makes it safe. Visits to `/member` and the sync button also sync. Never put `CRON_SECRET` into the database job. Sync errors are never logged.

## Not built yet (do not assume it exists)

Wearables other than Oura and merging several devices on one timeline (the landing page lists them as planned), alerts to the care team (only the member's own family circle is alerted), push notifications and WhatsApp alerts, live (real-time) heart monitoring, fall detection, translating the Hebrew-only parts to English, sending experiment posts to n8n / Telegram / Kit (`docs/BLOG-WORKFLOW.md`), a verified Resend sending domain (until then sign-in emails only reach the Resend account owner), staff invitations and SSO, Oura app approval for more than ~10 users, live Oura verification, alert delivery outside the app, data export and deletion, retention policy, legal review. See `docs/ARCHITECTURE.md#open-items` and `docs/PRIVACY.md`.
