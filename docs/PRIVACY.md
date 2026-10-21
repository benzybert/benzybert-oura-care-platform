# Privacy and safety design

Health data is the most sensitive kind. These are the rules the code enforces, and the questions it cannot answer for you.

## What the code enforces

- **Consent per purpose.** Three separate scopes (care team, anonymous org stats, rewards). Nothing is shared by default. A member can revoke any scope at any time, and revoking care-team sharing immediately removes them from the care view and dismisses their open alerts.
- **Append-only consent history.** Revocation sets `revoked_at`; re-granting inserts a new row. You can always show who agreed to what, and when.
- **Compute only what was agreed.** Alerts exist only for members with active care-team consent; rewards only with rewards consent.
- **No individual employer view.** Organizations get group means only, never per-person values, never min or max, and nothing at all below `ORG_MIN_COHORT` (default 5) consenting members. Small groups identify people.
- **Members can see who looked.** The member page shows how many times, and when last, the care team viewed their summary. Every staff view is written to `audit_log`.
- **Minimal identity.** Staff see a short code (`T-07`), age band and goal. No names, phone numbers or email in the care view.
- **Minimal Oura data.** Scope `daily` only. We store sleep and readiness scores, HRV, lowest heart rate, sleep duration, bedtime and steps. Not heart-rate time series, not profile details.
- **Tokens encrypted at rest** (AES-256-GCM, key in `TOKEN_ENCRYPTION_KEY`) and deleted when the member disconnects.
- **No caching, no framing.** Responses are `no-store`, `X-Frame-Options: DENY`.
- **Demo login is closed by default.** `/api/demo-login` returns 404 unless `DEMO_AUTH=true`; the app shows a banner when it is on.

## Why no HR view per person

An employer seeing that a named employee's HRV is dropping is a legal and trust problem. People stop wearing the ring once they believe their employer can read it. The design instead gives HR anonymous team trends above a minimum group size, and gives the employee a private "check in" that only they can choose to act on.

## Questions for a lawyer (not answered here)

This is engineering documentation, not legal advice.

- **Israeli Privacy Protection Law, Amendment 13**: consent, purpose limitation and penalties for processing personal data, including by employers. Confirm what applies to health data and to a wellness program run through an employer or a health fund.
- **Cross-border storage.** Where the database region sits relative to Israeli residents' data, and what the partner's contracts require.
- **Medical-device software.** Whether alerts shown to clinicians count as regulated software in Israel. The wording in the UI says "triage tool, not a diagnosis", but the law looks at intended use, not wording.
- **Oura's terms** for commercial and clinical use of API data, and the membership requirement for members with newer rings.
- **Vercel plan.** The Hobby plan is meant for personal, non-commercial use. A paid pilot needs a paid plan.

## Still to build

- Member-initiated data export and deletion.
- Retention policy (how long daily rows are kept after someone leaves the program).
- Alert delivery to care staff with the same consent checks.
- Security review before any real data: rate limiting, CSP, dependency audit, backups, access reviews.
