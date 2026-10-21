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
| `daily_metrics` | one row per member per day, Oura-shaped; `source` is `oura` or `demo` |
| `alerts` | rule hits for review; only created for members with active `care_team` consent |
| `reward_events` | points, idempotent per member, kind and week |
| `doctor_contacts` | the member's own doctors (name, email), used only for sends the member confirms |
| `share_links` | read-only doctor dashboard links: token **hash** for lookup, token encrypted for re-copying, window, expiry, revocation, view count |
| `self_rewards` | goals a member sets for themselves and the treat they promise themselves; member-only, never read by staff or org pages |
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
4. Each sync re-pulls the last 14 days (Oura revises recent days), merges `daily_sleep`, `daily_readiness`, `daily_activity` and `sleep` periods into one row per day, and upserts without overwriting a good value with an empty one.
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
4. The dashboard is server-rendered from `src/lib/doctor-dashboard.ts` (pure, tested): KPI tiles (last 7 days vs. the first 7 days of the window), findings with the same thresholds as the alert rules, 7 trend charts (inline SVG, no chart library), weekly and daily tables, definitions, print / PDF layout. Only the window's data reaches the browser.
5. Revoking sets `revoked_at`; the next request gets the same "link not active" page as an unknown token (404).

It is the member's own sharing: it does not read `care_team` consent or alerts, and it does not widen any scope.

## Self-rewards ("התגמולים שלי")

A section on `/member` where the member sets a goal on their own data and names the treat they give themselves for reaching it. It is separate from the points above: nothing is awarded by the platform and nothing is shared.

- **Goal kinds** (`src/lib/self-rewards.ts`): average over a period, X of Y days, streak (optional joker: one bad day does not break it, two in a row do), beat my own baseline (the member's 28-day mean before the start, fixed at creation, at least 14 days of data), and steady bedtime (same median logic as the bedtime points).
- **Metrics:** sleep score, readiness, sleep hours, steps, HRV, resting heart rate, bedtime. Bedtime is compared on a scale shifted to 18:00 so 23:50 and 00:10 are close.
- **Status is computed on read** from `daily_metrics`, so a late Oura revision is picked up. Days after the latest synced day count as pending, not as misses. Averages need data on 70 percent of the days. Only the claim is stored (`claimed_at`, `claimed_reward`).
- **Rewards:** one option is a fixed reward; several options make a mystery reward, one drawn at random (server side, `crypto.randomInt`) when the member opens it. An optional shekel budget feeds the "treat jar" total.
- **Server checks:** every action re-checks the member role and that the row belongs to the member; claiming re-evaluates the goal on the server before anything is stored. Limits: 12 open goals, 60 rows in total.

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
- **Migrations in CI/CD** (today `npm run db:migrate` is run by hand against each environment).
