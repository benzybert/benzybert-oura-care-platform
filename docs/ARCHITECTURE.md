# Architecture

```
 Oura ring ──► Oura cloud ──OAuth2/REST──► /api/cron/oura-sync (daily) ─┐
                                    ▲                                    │
              member ──► /api/oura/connect → Oura → /api/oura/callback ──┤ tokens (encrypted)
                                                                         ▼
                                                    Postgres: daily_metrics, alerts, rewards
                                                                         │
        ┌───────────────────────────┬────────────────────────────────────┤
        ▼                           ▼                                    ▼
   /member (own data,        /care (consented,                    /org (means only,
   consents, access log)     assigned members, alerts)            min group size)
```

## Data model

| Table | Purpose |
| --- | --- |
| `organizations`, `users` | tenants and accounts; `users.role` is `member`, `care_team`, `org_admin` or `platform_admin` |
| `members` | one per member user; shows staff a short `display_id` (e.g. `T-07`), never a name |
| `care_assignments` | which care-team user looks after which member |
| `oura_connections` | OAuth tokens, **encrypted** (AES-256-GCM); deleted when the member disconnects |
| `consents` | append-only history; a scope is active while a row has `revoked_at IS NULL` |
| `daily_metrics` | one row per member per day, Oura-shaped; `source` is `oura` or `demo`. Besides the scores it holds the main sleep's structure (stage minutes, efficiency, latency, breathing, temperature deviation), Oura's contributor scores, activity minutes, and the night detail (hypnogram plus 5-minute heart rate and HRV). Only the doctor dashboard reads the structure and night columns (`getDashboardMetrics`); care and org views keep selecting the original columns |
| `daily_extras` | the rest of what Oura gives per day (migration `0014`): activity score, contributors, calories, distance, MET and the 5-minute activity strip; SpO2 and breathing disturbance; resilience; cardiovascular age; VO2 max; Oura's bedtime guidance; naps; sleep movement; the temperature trend; and the all-day heart-rate curve (288 five-minute averages per local day plus min / avg / max per source). **Member's own page only**: separate from `daily_metrics` on purpose, so no doctor link, care view or org view can pick it up by accident |
| `oura_events` | workouts, sessions (meditation, breathing), tags and their free-text comments, rest-mode periods and naps, one row per Oura document (`member_id, kind, source_id` is unique, so a re-sync updates). Member's own page only |
| `oura_profile` | one row per member: the ring (generation, design, colour, size, firmware, battery), age / weight / height / biological sex as Oura reports them, and `coverage`: for every Oura data family whether the last sync got data, got none, was refused (missing scope) or failed. Member's own page only |
| `alerts` | rule hits for review; only created for members with active `care_team` consent |
| `reward_events` | points, idempotent per member, kind and week |
| `doctor_contacts` | the member's own doctors (name, email), used only for sends the member confirms |
| `share_links` | read-only doctor dashboard links: token **hash** for lookup, token encrypted for re-copying, window, expiry, revocation, view count |
| `self_rewards` | goals a member sets for themselves and the treat they promise themselves; member-only, never read by staff or org pages |
| `experiments` | self-experiments of any length (the nights covered, hypothesis, per-night notes, conclusion); member-only, results computed on read from `daily_metrics` |
| `audit_log` | every staff view, every consent change, every share-link create / open / revoke |

Consent scopes: `care_team`, `org_aggregate`, `rewards`. One scope never implies another.

## Permissions

| Action | member | care_team | org_admin |
| --- | --- | --- | --- |
| see own metrics, rewards, access log | yes | no | no |
| grant / revoke own consents, disconnect ring | yes | no | no |
| see a member's summary | no | only if assigned **and** `care_team` consent active | never |
| acknowledge an alert | no | only for assigned, consenting members (re-checked server-side) | no |
| see group means | no | no | yes, and only when enough members consented |
| create / revoke a doctor dashboard link | own only | no | no |

A doctor opening a share link has no account: the link's token is the only key, and it is checked on every request.

Every page re-checks the role on the server (`requireRole`). Server actions re-check ownership and consent; the UI is never the gatekeeper.

## Oura sync

1. Member clicks "connect": `/api/oura/connect` sets a signed, 10-minute state cookie bound to the user and redirects to Oura.
2. `/api/oura/callback` verifies state and user, exchanges the code, stores both tokens encrypted, runs a first sync.
3. `/api/cron/oura-sync` (Vercel Cron, daily, `Authorization: Bearer $CRON_SECRET`) syncs every active connection **sequentially**, because refresh tokens are single-use.
4. Each sync re-pulls the last 35 days (Oura revises recent days, and it backfills fields added later), merges `daily_sleep`, `daily_readiness`, `daily_activity`, `daily_stress` and `sleep` periods into one row per day, and upserts without overwriting a good value with an empty one. The extra fields come from the same five calls: new fields are parsed leniently, so a field Oura leaves out becomes null and never fails the sync.
5. Beyond those five calls, every sync also asks for everything else the API offers (`daily_spo2`, `daily_resilience`, `daily_cardiovascular_age`, `vO2_max`, `sleep_time`, `rest_mode_period`, `workout`, `session`, `enhanced_tag`, `ring_configuration`, `personal_info`, `ring_battery_level` and the `heartrate` series), in parallel, **fail-soft** (`fetchOptional`): a 401/403 on one of them means "this token does not cover it", never a dead connection, and a malformed row is skipped. The core collections in the same `Promise.all` are what decide whether the token is still valid. The results are mapped by `src/lib/oura/map-extras.ts` and saved by `sync-extras.ts` after the core rows, best effort, so a problem there cannot fail a sync that worked.
6. If Oura rejects the tokens, the connection is marked revoked and the member must reconnect.
7. After each sync, alerts and rewards run for the scopes the member has consented to.

Schedules: Vercel Cron runs `/api/cron/oura-sync` once a day (35-day window, `CRON_SECRET`; Hobby allows nothing more often). A pg_cron job in Supabase (`docs/supabase-sync-schedule.sql`) calls `/api/sync/tick` every 30 minutes: no secret, returns only a count, and it syncs a connection only when its last sync is 20 minutes old, over the last 3 days. Opening `/member` also re-syncs when the last sync is 30 minutes old, and the "סנכרן עכשיו" button syncs on demand. Overlapping runs are safe: a run whose refresh token was replaced by another run is skipped instead of revoking the connection.

**Oura webhooks** (`/api/oura/webhook`, `src/lib/oura/webhook.ts`, idea from the-momentum/open-wearables' "webhook mode"). Oura calls us seconds after it finalises a `sleep`, `daily_sleep`, `daily_readiness`, `daily_activity`, `daily_spo2` or `workout` record (create and update). The call holds no health data, only the Oura user id; we hash it (`ouraAccountHash`), find the connection, claim it atomically with a 60-second gap (`syncOnWebhook`, so the burst of morning events starts one sync) and sync 3 days in `after()`, which also runs the heart watch. Every POST must carry `x-oura-signature` = upper-case hex HMAC-SHA256 of `x-oura-timestamp + body` keyed with `OURA_CLIENT_SECRET`; anything else gets 401. The subscription handshake (GET with `verification_token` and `challenge`) is answered only for our own token, derived from the client secret. The answer is 204 whatever happened, so it reveals nothing about who is a member; nothing is logged. Subscriptions are app-level and expire: the daily cron (`ensureWebhookSubscriptions`) creates the missing ones against `siteUrl()/api/oura/webhook` and renews those expiring within 7 days, fail-soft. The half-hourly tick stays as the fallback. This makes data arrive sooner; it does not make the ring live.

Scopes requested (`src/lib/oura/scopes.ts`): `daily heartrate workout tag session spo2Daily personal`, i.e. everything the API offers except `email` (we already have the member's address). Members who connected before this have only `daily` stored in `oura_connections.scopes`; the app then shows "אישור הרשאות נוספות" (the same `/api/oura/connect` flow, once) and the optional data fills in after they approve. Verify in Oura's sandbox that `daily` covers the `sleep` period endpoint, and which of the newer daily endpoints (resilience, VO2 max, ...) need no extra scope: the coverage table on the ring view shows what really answered.

## The member's data tab and the full Oura data

History: after a ring is connected (or the member signs in with Oura), the first sync pulls 35 days with the heart-rate curve and then a one-off history pull of `HISTORY_DAYS` (730) without the heart-rate curve and battery (`syncMember(..., { history: true })`, stamps `history_synced_at`, leaves `coverage` alone). Scopes: the authorize URL also asks for `NEWER_SCOPES` (`spo2 stress heart_health ring_configuration`, unverified names), because SpO2, resilience, cardiovascular age, VO2 max, ring configuration and battery answered 403 with the original list; on `invalid_scope` the callback retries once with the original list (`?basic=1`). The stored `scopes` are now what Oura reports as granted, and the ring card offers "אישור הרשאות נוספות" whenever a family answered `forbidden`.

The member area is one route per tab (`src/app/member/_shell/member-shell.tsx`); the data tab (`/member/data`, "הנתונים שלי") is split into views that live in the URL (`?view=sleep&days=60`, `src/lib/member-nav.ts`, pure and tested). Each view is a server render that loads only what it shows, links can be bookmarked, and there is no client-side tab state.

- Views: סיכום, שינה, התאוששות, פעילות, לב ונשימה, אימונים ואירועים, מגמות וטבלאות, הטבעת. The existing dashboard component renders the summary, sleep, recovery and trends views through `meta.sections` (a doctor link or the PDF omit it and show everything); the new views live in `src/components/member-data/`.
- Everything in the new views is the member's own: `getDayExtras`, `getOuraEvents` and `getOuraProfile` are called only from `/member/data`. Care, org and share-link code never reads those tables.
- The ring view lists every Oura data family with its state from the last sync, so "why is this empty" always has an answer (not approved, no data for this ring, failed), and offers the one-time approval of more permissions.
- Not stored: the beat-to-beat series (`interbeat_interval`), the per-minute MET series, the 30-second sleep phases (5-minute ones are stored), Oura's encrypted ring id, and the `email` scope.

### Deeper analysis on the data tab

- **HRV in depth** (heart view, `src/lib/hrv.ts`, `hrv-insights.tsx`): NeuroKit2's time-domain definitions ported to TypeScript for what Oura sends (one RMSSD value per 5 minutes of sleep, `night_hrv`, and the night average). Per night: mean, median, SD, CV, range, IQR and first half against second half. Across nights, as sport science reads HRV (Plews, Altini): ln RMSSD, its 7-night mean and CV, and a usual range of the earlier nights' mean ± 0.5 SD; below, within or above, plus "unsettled" when the 7-night CV is 2 points over its usual. Oura gives no beat intervals, so no LF/HF or Poincaré; the card says so.
- **Sleep structure** (sleep view, `src/lib/sleep-structure.ts`, `sleep-structure.tsx`): YASA's `sleep_statistics` (TIB, SPT, WASO, TST, SOL, latencies, SE, SME), `transition_matrix`, stage stability and bouts, plus a fragmentation index (moves to a lighter stage or awake per hour asleep), on Oura's 5-minute hypnogram (light = N1+N2, deep = N3). YASA's EEG classifier is not used. Five-minute epochs hide short awakenings; the card says to compare one's own nights.
- **FHIR export** (`/member/data/fhir?days=30|60|90|365`, `src/lib/fhir.ts`, typed with `@medplum/fhirtypes`): a FHIR R4 `collection` Bundle with a Patient that has only an opaque hashed id (no name, contact or birth date), the ring as a Device, and one Observation per day and measure (LOINC where it fits: 40443-4 resting HR, 8867-4 sleep HR, 9279-1 breathing, 59408-5 SpO2, 93832-4 sleep duration, 41950-7 steps; our own code system for RMSSD, the scores and the temperature deviation). Member-only download from the summary hero's "FHIR export" button, own data, so like the member PDF it is not audited and needs no consent; `no-store`.

## Alert rules (v0)

Baseline is the member's own first 7 days. Evaluated on the last 3 days, and only when data is fresh (last day within 3 days of today) and at least 10 days exist.

| Rule | Fires when |
| --- | --- |
| `hrv_drop` | mean HRV is more than 15 percent below baseline |
| `short_sleep` | under 6 hours on each of the last 3 nights |
| `low_readiness` | readiness under 60 on each of the last 3 days |
| `resting_hr_up` | mean lowest heart rate is more than 4 bpm above baseline |

These are simple triage signals, not diagnoses. A rule that is already open for a member does not fire again until it is acknowledged.

## Rewards

Points are paid for **consistency** (bedtime within 45 minutes of the member's weekly median on at least 5 nights of a Sunday to Saturday week), not for a high score. 10 points per qualifying week, once per week.

## Doctor dashboard links

The member creates a link on `/member/sharing` (who it is for, optional name and note, 30/60/90 days of data, valid 7/14/30 days) and can preview exactly what the doctor will see on `/member/share/preview`. Nothing is sent: the member copies or shares the link themselves.

1. `createShareLink` makes 32 random bytes (base64url, 43 chars). The database keeps `sha256(token)` for lookup and `encrypt(token)` (AES-256-GCM, `TOKEN_ENCRYPTION_KEY`) so the member can copy the link again. At most 10 active links per member.
2. `GET /share/<token>` re-checks the link on every request (exists, not revoked, not expired). Without an "opened" cookie it shows a gate with **no health data and no name**, so WhatsApp / Telegram / mail link previews get nothing personal.
3. The doctor presses "open" (a POST, `openShareLink`): the view is counted on the link, written to `audit_log` as `share_link_viewed` (no actor), and a signed cookie scoped to that one link's path lets this browser view the dashboard for 2 hours.
4. The dashboard is server-rendered from `src/lib/doctor-dashboard.ts` and `doctor-dashboard-detail.ts` (pure, tested): a night-themed header with score rings and KPI tiles (last 7 days vs. the first 7 days of the window), findings (the alert-rule thresholds, plus informational ones on efficiency, latency, stage mix, breathing, temperature and stress), a night explorer (hypnogram with heart rate and HRV on one clock, last 14 nights), sleep architecture (stage shares, stacked nights), a sleep-clock regularity chart with weekday/weekend and short-night patterns, trend charts (inline SVG, no chart library), score contributors, a calendar heatmap, weekly and daily tables, definitions, print / PDF layout. Only the window's data reaches the browser; the client charts get plain arrays (no functions).
5. Revoking sets `revoked_at`; the next request gets the same "link not active" page as an unknown token (404).

It is the member's own sharing: it does not read `care_team` consent or alerts, and it does not widen any scope.

## Self-rewards ("התגמולים שלי")

A tab `/member/goals` where the member sets a goal on their own data and names the treat they give themselves for reaching it. It is separate from the points above: nothing is awarded by the platform and nothing is shared.

- **Goal kinds** (`src/lib/self-rewards.ts`): average over a period, X of Y days, streak (optional joker: one bad day does not break it, two in a row do), beat my own baseline (the member's 28-day mean before the start, fixed at creation, at least 14 days of data), and steady bedtime (same median logic as the bedtime points).
- **Metrics:** sleep score, readiness, sleep hours, steps, HRV, resting heart rate, bedtime. Bedtime is compared on a scale shifted to 18:00 so 23:50 and 00:10 are close.
- **Status is computed on read** from `daily_metrics`, so a late Oura revision is picked up. Days after the latest synced day count as pending, not as misses. Averages need data on 70 percent of the days. Only the claim is stored (`claimed_at`, `claimed_reward`).
- **Rewards:** one option is a fixed reward; several options make a mystery reward, one drawn at random (server side, `crypto.randomInt`) when the member opens it. An optional shekel budget feeds the "treat jar" total.
- **Server checks:** every action re-checks the member role and that the row belongs to the member; claiming re-evaluates the goal on the server before anything is stored. Limits: 12 open goals, 60 rows in total.

## Experiments ("ניסויים")

A tab `/member/experiments` where the member changes one thing for as many nights as they like (1 to 90) (for example sleeping outside) and compares those Oura nights with their own nights just before. Member-only: no staff or org query reads it and it needs no consent scope.

- **Nights and days.** An experiment is stored as its first and last *night* (the date the evening starts on). Oura files a night under the morning after it, so night N is read from Oura day N+1.
- **Baseline.** The 7, 14, 21 or 28 days that end on the first experiment evening, without the nights of the member's other experiments, so a series of experiments does not use last week's change as this week's normal. Experiments may not overlap.
- **Comparison** (`src/lib/experiments.ts`). For about a dozen metrics (sleep score, hours, deep and REM, efficiency, latency, HRV, resting heart rate, breathing, skin temperature, readiness, bedtime, wake time) it compares the mean of the experiment's nights with the baseline mean and expresses the difference in units of the baseline's own night-to-night standard deviation: under 0.5 is within the usual swing, 0.5 to 1 a tendency, 1 and above clearly different. It needs at least 5 baseline nights and 3 experiment nights, otherwise there is no verdict. It is one person with no control group, and the page and the drafts say so. The member picks one primary metric; the others are context.
- **Draft post** (`src/lib/experiment-post.ts`). Builds a versioned package (`schemaVersion: 1`): blog Markdown, Telegram text, newsletter subject, preview and Markdown, structured aggregates and a list of warnings (not finished, missing nights, no conclusion). It holds aggregates and one line per night, no name and no time series. The page only shows it and lets the member copy it. The hand-off to n8n is not built, see [BLOG-WORKFLOW.md](BLOG-WORKFLOW.md).

## Language

English is the default; Hebrew (right-to-left) is one click away (`LocaleSwitch` in the app bar, `locale` cookie, `src/lib/i18n`). Messages live in typed dictionaries (`src/lib/i18n/dict/*.ts`): each is written in English and the Hebrew version lays over it key by key, so a missing translation shows English instead of breaking a page. `<html lang dir>` follows the language. Translated: the landing and sign-in pages, the member frame, home, profile, sharing consent, the care and org pages, and everything built for the heart watch. Still written only in Hebrew, and shown as a right-to-left island (`hebrew` prop of `MemberShell`, `HebrewIsland`) inside the English page: the data tab and its views, experiments and blog drafts, self-rewards, the doctor links, doctor PDF and doctor email, Instinct, and the public suggestion page. The pages that doctors and blog readers see (`/share`, `/suggest`) force right-to-left themselves.

## Heart watch (`/member/heart`)

Compares the member's last two nights with their own usual (the 28 nights before, median and a robust spread) and turns a clear drift into a signal (`src/lib/heart/engine.ts`, pure and tested). Measures: the night's lowest heart rate (up and down), HRV, breathing rate, blood oxygen, skin temperature; several drifting together become one "several signals" signal; no new data for 2 days is a signal of its own. Levels are `watch` (a gentle heads-up), `alert` (a clear change, or a limit the member set) and `urgent`. A sensitivity setting (relaxed, standard, sensitive) scales the thresholds. A drift inside the person's own natural wobble never fires. Fewer than 7 usual nights means "still learning".

- **Only the member's own numbers are limits.** Night heart-rate limits and a blood-oxygen floor are optional and empty by default. `urgent` exists only through "urgent triggers": the member switches them on and sets a heart rate at rest (or a low rate while awake) and for how many minutes. `src/lib/heart/episodes.ts` finds that run in the all-day curve (288 five-minute averages in `daily_extras`) and confirms the person was resting (asleep, or the ring's activity class says rest or inactive; unknown activity never counts as rest). Nothing urgent is ever a default.
- **Alerts** (`heart_alerts`, one row per member, rule and day; `src/lib/heart/watch.ts`). `runHeartWatch` runs after every sync and from `/api/alerts/tick`; it saves what changed, tells people about what is new or more serious (one message per run, for the most serious, naming the others), and clears what has passed. A persistent drift updates one alert instead of opening a new one each day. Everything is idempotent: `alert_deliveries` has a unique row per alert, recipient, channel, level and round, and the row is inserted before the send, so overlapping runs never send twice.
- **Who hears what** (`src/lib/notify/policy.ts`): watch gives email; alert gives email and text message; urgent adds a phone call and the physical alarms. Each person only gets the channels switched on for them. An unanswered urgent alert is sent again after the member's chosen wait (default 15 minutes, at most 3 more times); an unanswered alert once after 4 hours. "I'm OK" (member) or "I'm on it" (a guardian) stops the repeats and tells the others.
- **Not live.** Ring data reaches us after the ring syncs with the phone and the phone with Oura: minutes to hours. The Heart tab, the family pages and every message say so. The schedule is `/api/sync/tick` every 30 minutes and `/api/alerts/tick` every 5 (`docs/supabase-sync-schedule.sql`), plus a sync on every member page visit.
- **Slow drift** (`resting_hr_drift`, `restingHrDrift` in `engine.ts`): the RHR-CUSUM idea from the Stanford smartwatch studies (mwgrassgreen/WearableDetection). Each of the last 14 nights is standardised against the 28 nights before them (robust median and spread), the running total of what sits more than half a spread above usual is kept, and at 5 spreads (scaled by sensitivity) with at least 3 rising nights it becomes a `watch`, never more. It stays out when `resting_hr_high` already fired, and is not part of "several signals". The text names ordinary causes and says it is not a diagnosis.
- **Home**: heart-focused members see the watch's status card first; every member tab shows a banner while an alert is open.

## Family circle and alarms (`/member/circle`, `/family/<token>`)

The member adds people (`circle_links`): a label, an email and/or phone, which channels (email, text, call), a language, and whether the person may open the read-only status page. Each person gets a private link, built like a doctor link: 256-bit token, lookup by sha256 only, `token_enc` so the member can copy it again, a year's expiry, revocable at once. `/family/<token>` has no account: the first screen shows only the name the member chose; the heart status, the open alerts and 14 nights of heart measures (resting heart rate, HRV, breathing, blood oxygen) appear after the "open" press, which is audited (`circle_link_viewed`) and counted for the member. No sleep, steps, readiness, no email or code. The guardian can say "I'm on it", change their own phone and channels, and pause their own alerts. Removing a person stops their link and their alerts immediately.

- **Text and calls** go through Twilio (`src/lib/notify/channels.ts`, keys in `src/config/notify.ts` or `TWILIO_*`). With no keys those options show as unavailable and nothing is sent. A call reads the alert aloud twice, in the person's language. Phone numbers are stored as E.164 (`src/lib/notify/phone.ts`; a leading 0 means Israel).
- **Alarms** (`alert_devices`): the member pastes a webhook (Home Assistant, IFTTT or any https endpoint) for a siren, lights or a smart speaker. The URL is encrypted, never shown again, and checked for https, no credentials and no private or internal host, both when saved and again (with a DNS check and no redirects) right before each call. The payload holds only the level, the member's chosen name and the time: no health numbers.
- **ntfy** (binwiederhier/ntfy) is an alarm kind: the member pastes `https://ntfy.sh/<topic>` (or a self-hosted server) and the server posts ntfy's JSON publish (title, message, priority 3/4/5 by level) in the member's language, with the same URL checks. Like the other alarms it carries only the level and the circle's name for the person: an ntfy topic is readable by anyone who knows its name.
- **Tests the member starts** ("Send a test", "Test the alarm") send a clearly marked TEST; at most 5 per 10 minutes per member, one a minute per alarm.
- **Why this is not the removed action center**: that fed a member's own devices from sleep scores. This is a safety feature for other people, with its own tables, consent model and audit.

## Challenges (`/member/challenges`)

Friendly competitions (`challenges`, `challenge_participants`, logic in `src/lib/challenges.ts`). One daily number (steps, sleep score, readiness, active minutes, hours of sleep), a window of 3 to 30 days, and a scoring: against the member's own previous four weeks (the default: fair for a marathon runner and a cardiac patient), the daily average, or a total (steps and active minutes only). Scores are computed on read and only from the chosen metric's column and the challenge days (`src/lib/challenge-data.ts`); joining is the consent and shares nothing else, leaving takes the score off the board at once. People join with an 8-character code or the link `/join/<code>`, which shows only the challenge's name and sends the visitor through sign-in and back (`src/lib/post-login.ts`, a short-lived cookie holding a member path). At most 5 running challenges per creator and 20 players each.

## Health records, integrations and custom views (migration `0018`)

The member's own records, each on its own tab. All four tables are member-only: only the member's pages query them (`src/lib/records-data.ts`, always filtered by the member's id), and no staff, org, doctor-link, PDF, family or aggregate code reads them. Own data on own pages: no consent scope and no audit entry, like experiments. Actions in `src/app/records-actions.ts` re-check the role and ownership; another member's id behaves like a missing one (pages 404).

- **Medications & supplements** (`/member/medications`, table `medications`, logic `src/lib/medications.ts`): name, kind, dose, times of day, reason, start and stop day, note. Status is computed on read (planned, taking, stopped). "Since you started" compares the 14 Oura days that end on the start day with up to 28 days since (stopping at the stop day), using `compareMetric` from the experiments: size of change against the member's own spread, same 0.5/1 sd thresholds, at least 5 and 3 days. The card says it is one person, a sign not proof, and never to change a medication because of it without a doctor.
- **Lab results** (`/member/labs`, `/member/labs/[id]`, tables `lab_reports` + `lab_results`, logic `src/lib/biomarkers.ts`): a report is one test day with up to 40 results (catalog marker or "Other" with a name, value, optional unit and the lab's printed range); the empty form shows 10. Written in one transaction.
- **Reading a lab report PDF**: the member uploads a text-based PDF (4 MB, 20 pages at most); the server action `readLabPdf` extracts the text lines (`src/lib/pdf-text.ts`, unpdf/pdf.js 6, positions grouped into lines) and `src/lib/lab-pdf.ts` turns them into a draft: one row per catalog marker (name aliases in English, abbreviations and Hebrew, including reversed and visual word order), value, unit when it differs from the usual one, printed range, the collection date (first date after "collected"/"תאריך בדיקה", else the latest valid date) and the health fund. Lines that look like results of unknown markers are listed for the member to add as "Other". The draft returns to the browser only (component state) and fills the normal form, each row with the PDF line it came from; nothing is saved until the member presses save. The file and its text are never stored or logged, and the text reader sends nothing to an outside service. Scanned PDFs have no text: when an Anthropic key is set (`src/config/ai.ts`), the member can press "Read with AI (Claude)" instead, which sends that one file to the Anthropic Messages API (`src/lib/ai/lab-reader.ts`: PDF document block, structured JSON output, safety fallback). `src/lib/ai/lab-extract.ts` checks the answer (catalog key, finite numbers, valid past dates, range order, plausibility), keeps the most common result day as the report day and lists results from other days separately, and fills the same review form; unknown markers come in as "Other" rows with their printed name. Nothing from that call is stored or logged. Without a key the button is hidden and scans get the type-it-in message.
- **Biomarkers** (`/member/biomarkers`): one card per marker with the latest value, its range and status, the previous value and a line when measured more than once in the same unit. The range on the member's own report always wins; otherwise the catalog's common adult range is used, and only when the unit matches. Wording is "within / below / above the range", never a diagnosis; ranges are written "4.0 to 5.6", never with a dash.
- **Integrations** (`/member/integrations`): Oura (ring card, coverage summary), exports (FHIR, PDF, doctor links), alarms (link to the family circle), and the other wearables from the landing page, all marked planned.
- **Custom views** (`/member/views/new`, `/member/views/[id]`, table `custom_views`, logic `src/lib/custom-views.ts`): the member picks cards (ring metrics with their usual range, last night, medications, lab markers) and a window (7/30/90 days), optionally numbers them, and the view is listed in the sidebar under "My custom views". A view only rearranges the member's own data; it shares nothing, and a page reads only the data its cards need.

## The "ask my data" assistant (`/member/assistant`)

The member types a question; the browser posts the conversation (plain text turns, kept in `sessionStorage`) to `POST /api/assistant/chat`. The route checks the session (member role), then `runAssistant` (`src/lib/ai/assistant.ts`) streams a Claude answer back as JSON lines: `text` deltas, `tool` (which data it is reading, shown as a status line), `done` or `error`. Claude has six read-only tools (`src/lib/ai/assistant-data.ts`): an overview of what data exists, nights from `daily_metrics`, extras from `daily_extras`, lab results with their ranges, medications and experiments. Each runs in `src/lib/ai/assistant-tools.ts` with the session's member id, so the model can only read that member's rows; a date window is capped at 120 days. Within one question the full assistant content (thinking, tool calls) goes back unchanged on each tool round; earlier questions are sent as their text only, which keeps the API's history check satisfied. Nothing is stored or logged. Key and model: `src/config/ai.ts` / `ANTHROPIC_API_KEY`.

## Onboarding

`/member/welcome` asks what matters most (heart, sleep, recovery, activity, everything). A main focus of heart switches the heart watch on. The choice (`member_prefs.focus_areas`) orders the tabs and decides what Home shows first; it can be changed on the Profile tab. Skipping is always possible and the question is not asked again. `member_prefs` is a separate table on purpose: staff and organization queries load whole `members` rows.

## Sign-in

Two ways in, both ending in `startSession(user.id)` (signed cookie, 7 days); `/login` offers both, signed-out member pages redirect there.

- **Sign in with Oura** (`/api/auth/oura`): the normal Oura consent screen without a session. The callback (`/api/oura/callback`, shared with "connect my ring"; the signed state cookie says which flow, `src/lib/oura/oauth-state.ts`) reads `personal_info.id` and looks up `oura_connections.oura_account_hash` (sha256, `src/lib/oura/account.ts`; the id itself is never stored). Found: refresh the tokens and sign in. Not found: create a member in the self-serve organization (`SELF_SERVE_ORG_NAME`, short code `M-XXXXXX`, no email) and connect the ring. Without the `personal` scope no account is created. Connections made before this get their hash on their next sync. One Oura account belongs to one member (`?oura=in_use`).
- **Email link** (`src/app/login/actions.ts`, table `login_tokens`, migration `0015`): sha256 of the token only, single use, 15 minutes, 3 per address per 15 minutes, same answer whether or not the address has an account. The link points at `siteUrl()` (`src/config/site.ts`), never at the request Host. `/login/verify` signs in only on a POST, so mail scanners that open links do not use them. A new address becomes a member; staff accounts are never created by sign-in.
- **Demo login** (`DEMO_AUTH=true`) now only covers the seeded synthetic accounts. The owner's real account is no longer a demo button.

Sign-in events are audited (`signed_in_oura`, `signed_in_email`, `account_created_*`) without addresses.

## Speed

Functions run in `fra1` (`vercel.json`), next to the Supabase database in eu-central-1; they used to run in `iad1`, a transatlantic round trip per query. The Postgres client keeps up to 5 connections so a page's parallel queries do not queue. Visiting a member page no longer waits for Oura: `syncOnVisit` claims a stale connection atomically, runs a 3-day sync with `after()`, and the page refreshes itself once (`SyncRefresher`).

## Environments

`main` is Production, `dev` is the Preview environment with its own database. See [SETUP.md](SETUP.md).

## Open items

- **Authentication.** Built (see Sign-in). Still open: a verified Resend domain (until then email links only reach the Resend account owner), staff invitations, SSO, account deletion.
- **Live Oura verification** with a registered app (the app is limited to 10 users until Oura approves it).
- **Notifications for the care team** (care manager by email / WhatsApp) are not built. Heart alerts to the member's own family circle are (see Heart watch).
- **Rolling baseline** instead of the fixed first week, once members are enrolled for months.
- **Data export / deletion** and a retention period.
- **Share links**: no second factor (the URL is the key). If needed, add an access code sent separately, or tie links to a doctor's verified email.
- **Integrations**: member and appointment data from the partner's own apps. No public Maccabi API was found; the realistic route is the partner's existing apps.
- **Rate limiting** on the API routes and a Content-Security-Policy.
- **Migration chain is incomplete.** No migration file creates the `context_events` table and its enum or the `daily_metrics.stress_*` columns (they were applied to the database directly when the context-events migration was renumbered to `0006`, which now only enables RLS). A new database built from `drizzle/` is missing them. Production has them. Fix with a guarded additive migration (`CREATE ... IF NOT EXISTS`), never by editing an applied one.
- **Migrations in CI/CD** (today `npm run db:migrate` is run by hand against each environment).
