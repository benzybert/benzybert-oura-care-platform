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
| `audit_log` | every staff view and every consent change |

Consent scopes: `care_team`, `org_aggregate`, `rewards`. One scope never implies another.

## Permissions

| Action | member | care_team | org_admin |
| --- | --- | --- | --- |
| see own metrics, rewards, access log | yes | no | no |
| grant / revoke own consents, disconnect ring | yes | no | no |
| see a member's summary | no | only if assigned **and** `care_team` consent active | never |
| acknowledge an alert | no | only for assigned, consenting members (re-checked server-side) | no |
| see group means | no | no | yes, and only when enough members consented |

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

## Environments

`main` is Production, `dev` is the Preview environment with its own database. See [SETUP.md](SETUP.md).

## Open items

- **Authentication.** Replace the demo login with a real provider; call `startSession(user.id)` at the end of sign-in and nothing else changes.
- **Live Oura verification** with a registered app (the app is limited to 10 users until Oura approves it).
- **Notifications** for alerts (care manager by email / WhatsApp), with the same consent checks.
- **Rolling baseline** instead of the fixed first week, once members are enrolled for months.
- **Data export / deletion** and a retention period.
- **Integrations**: member and appointment data from the partner's own apps. No public Maccabi API was found; the realistic route is the partner's existing apps.
- **Rate limiting** on the API routes and a Content-Security-Policy.
- **Migrations in CI/CD** (today `npm run db:migrate` is run by hand against each environment).
