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
| `alerts` | rule hits for review; only created for members with active `care_team` consent |
| `reward_events` | points, idempotent per member, kind and week |
| `doctor_contacts` | the member's own doctors (name, email), used only for sends the member confirms |
| `share_links` | read-only doctor dashboard links: token **hash** for lookup, token encrypted for re-copying, window, expiry, revocation, view count |
| `self_rewards` | goals a member sets for themselves and the treat they promise themselves; member-only, never read by staff or org pages |
| `experiments` | weekly self-experiments (the nights covered, hypothesis, per-night notes, conclusion); member-only, results computed on read from `daily_metrics` |
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
5. If Oura rejects the tokens, the connection is marked revoked and the member must reconnect.
6. After each sync, alerts and rewards run for the scopes the member has consented to.

Scope requested: `daily` only (no `personal`, no `heartrate`). Confirm in Oura's sandbox that `daily` also covers the `sleep` period endpoint.

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

The member creates a link on `/member` (who it is for, optional name and note, 30/60/90 days of data, valid 7/14/30 days) and can preview exactly what the doctor will see on `/member/share/preview`. Nothing is sent: the member copies or shares the link themselves.

1. `createShareLink` makes 32 random bytes (base64url, 43 chars). The database keeps `sha256(token)` for lookup and `encrypt(token)` (AES-256-GCM, `TOKEN_ENCRYPTION_KEY`) so the member can copy the link again. At most 10 active links per member.
2. `GET /share/<token>` re-checks the link on every request (exists, not revoked, not expired). Without an "opened" cookie it shows a gate with **no health data and no name**, so WhatsApp / Telegram / mail link previews get nothing personal.
3. The doctor presses "open" (a POST, `openShareLink`): the view is counted on the link, written to `audit_log` as `share_link_viewed` (no actor), and a signed cookie scoped to that one link's path lets this browser view the dashboard for 2 hours.
4. The dashboard is server-rendered from `src/lib/doctor-dashboard.ts` and `doctor-dashboard-detail.ts` (pure, tested): a night-themed header with score rings and KPI tiles (last 7 days vs. the first 7 days of the window), findings (the alert-rule thresholds, plus informational ones on efficiency, latency, stage mix, breathing, temperature and stress), a night explorer (hypnogram with heart rate and HRV on one clock, last 14 nights), sleep architecture (stage shares, stacked nights), a sleep-clock regularity chart with weekday/weekend and short-night patterns, trend charts (inline SVG, no chart library), score contributors, a calendar heatmap, weekly and daily tables, definitions, print / PDF layout. Only the window's data reaches the browser; the client charts get plain arrays (no functions).
5. Revoking sets `revoked_at`; the next request gets the same "link not active" page as an unknown token (404).

It is the member's own sharing: it does not read `care_team` consent or alerts, and it does not widen any scope.

## Self-rewards ("התגמולים שלי")

A section on `/member` where the member sets a goal on their own data and names the treat they give themselves for reaching it. It is separate from the points above: nothing is awarded by the platform and nothing is shared.

- **Goal kinds** (`src/lib/self-rewards.ts`): average over a period, X of Y days, streak (optional joker: one bad day does not break it, two in a row do), beat my own baseline (the member's 28-day mean before the start, fixed at creation, at least 14 days of data), and steady bedtime (same median logic as the bedtime points).
- **Metrics:** sleep score, readiness, sleep hours, steps, HRV, resting heart rate, bedtime. Bedtime is compared on a scale shifted to 18:00 so 23:50 and 00:10 are close.
- **Status is computed on read** from `daily_metrics`, so a late Oura revision is picked up. Days after the latest synced day count as pending, not as misses. Averages need data on 70 percent of the days. Only the claim is stored (`claimed_at`, `claimed_reward`).
- **Rewards:** one option is a fixed reward; several options make a mystery reward, one drawn at random (server side, `crypto.randomInt`) when the member opens it. An optional shekel budget feeds the "treat jar" total.
- **Server checks:** every action re-checks the member role and that the row belongs to the member; claiming re-evaluates the goal on the server before anything is stored. Limits: 12 open goals, 60 rows in total.

## Weekly experiments ("ניסוי שבועי")

A section on `/member` where the member changes one thing for 3 to 14 nights (for example sleeping outside) and compares those Oura nights with their own nights just before. Member-only: no staff or org query reads it and it needs no consent scope.

- **Nights and days.** An experiment is stored as its first and last *night* (the date the evening starts on). Oura files a night under the morning after it, so night N is read from Oura day N+1.
- **Baseline.** The 7, 14, 21 or 28 days that end on the first experiment evening, without the nights of the member's other experiments, so a weekly series does not use last week's change as this week's normal. Experiments may not overlap.
- **Comparison** (`src/lib/experiments.ts`). For about a dozen metrics (sleep score, hours, deep and REM, efficiency, latency, HRV, resting heart rate, breathing, skin temperature, readiness, bedtime, wake time) it compares the mean of the experiment's nights with the baseline mean and expresses the difference in units of the baseline's own night-to-night standard deviation: under 0.5 is within the usual swing, 0.5 to 1 a tendency, 1 and above clearly different. It needs at least 5 baseline nights and 3 experiment nights, otherwise there is no verdict. It is one person with no control group, and the page and the drafts say so. The member picks one primary metric; the others are context.
- **Draft post** (`src/lib/experiment-post.ts`). Builds a versioned package (`schemaVersion: 1`): blog Markdown, Telegram text, newsletter subject, preview and Markdown, structured aggregates and a list of warnings (not finished, missing nights, no conclusion). It holds aggregates and one line per night, no name and no time series. The page only shows it and lets the member copy it. The hand-off to n8n is not built, see [BLOG-WORKFLOW.md](BLOG-WORKFLOW.md).

## Environments

`main` is Production, `dev` is the Preview environment with its own database. See [SETUP.md](SETUP.md).

## Open items

- **Authentication.** Replace the demo login with a real provider; call `startSession(user.id)` at the end of sign-in and nothing else changes.
- **Live Oura verification** with a registered app (the app is limited to 10 users until Oura approves it).
- **Notifications** for alerts (care manager by email / WhatsApp), with the same consent checks.
- **Rolling baseline** instead of the fixed first week, once members are enrolled for months.
- **Data export / deletion** and a retention period.
- **Share links**: no second factor (the URL is the key). If needed, add an access code sent separately, or tie links to a doctor's verified email.
- **Integrations**: member and appointment data from the partner's own apps. No public Maccabi API was found; the realistic route is the partner's existing apps.
- **Rate limiting** on the API routes and a Content-Security-Policy.
- **Migration chain is incomplete.** No migration file creates the `context_events` table and its enum or the `daily_metrics.stress_*` columns (they were applied to the database directly when the context-events migration was renumbered to `0006`, which now only enables RLS). A new database built from `drizzle/` is missing them. Production has them. Fix with a guarded additive migration (`CREATE ... IF NOT EXISTS`), never by editing an applied one.
- **Migrations in CI/CD** (today `npm run db:migrate` is run by hand against each environment).
