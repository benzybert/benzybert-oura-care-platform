# Privacy and safety design

Health data is the most sensitive kind. These are the rules the code enforces, and the questions it cannot answer for you.

## What the code enforces

- **Consent per purpose.** Three separate scopes (care team, anonymous org stats, rewards). Nothing is shared by default. A member can revoke any scope at any time, and revoking care-team sharing immediately removes them from the care view and dismisses their open alerts.
- **Append-only consent history.** Revocation sets `revoked_at`; re-granting inserts a new row. You can always show who agreed to what, and when.
- **Compute only what was agreed.** Alerts exist only for members with active care-team consent; rewards only with rewards consent.
- **Self-rewards are private.** Goals and treats a member sets for themselves (`self_rewards`) are shown only to that member. No staff or org page reads the table, they are not part of any aggregate, and they need no sharing consent because nothing leaves the member's own view. A member can delete any of them.
- **No individual employer view.** Organizations get group means only, never per-person values, never min or max, and nothing at all below `ORG_MIN_COHORT` (default 5) consenting members. Small groups identify people.
- **Members can see who looked.** The member page shows how many times, and when last, the care team viewed their summary. Every staff view is written to `audit_log`.
- **Minimal identity.** Staff see a short code (`T-07`), age band and goal. No names, phone numbers or email in the care view.
- **Oura data.** No minimisation rule (owner's choice): more scopes and raw ring data may be added when a feature uses them, under the same consent and access rules. Scopes requested today: `daily`, `heartrate`, `workout`, `tag`, `session`, `spo2Daily`, `personal` (everything the Oura API offers except `email`). The original fields (scores, HRV, lowest heart rate, sleep duration, bedtime, steps, sleep structure, contributor scores, night curve, stress) stay in `daily_metrics`, which the care and organization views read column by column (only the original ones). Everything added later lives in three separate tables (`daily_extras`, `oura_events`, `oura_profile`): activity detail, SpO2, resilience, cardiovascular age, VO2 max, bedtime guidance, the all-day heart-rate curve (5-minute averages, not every sample), workouts, sessions, tags with their free-text comments, rest-mode periods, naps, the ring's details, and age, weight, height and biological sex. Only `/member/data` queries them. They are not part of any aggregate, care view, alert, reward, share link, PDF or doctor message. The beat-to-beat series and the per-minute MET series are not pulled at all.
- **Tokens encrypted at rest** (AES-256-GCM, key in `TOKEN_ENCRYPTION_KEY`) and deleted when the member disconnects.
- **No caching, no framing.** Responses are `no-store`, `X-Frame-Options: DENY`.
- **Doctor dashboard links are the member's own sharing.** Created only by the member, for a chosen window (30/60/90 days) and lifetime (7/14/30 days), revocable at once, and every opening is shown to the member (count and last time). The token is 256 random bits; the database looks it up by hash. The first screen of a link carries no health data and no name, so link previews in messaging apps see nothing; the data appears only after the doctor presses "open". Pages are `no-store`, `noindex`, and sent with `Referrer-Policy: no-referrer`. The doctor sees no member email, no data outside the window, and nothing from the care-team view. Known limit: the URL itself is the key, so anyone the doctor forwards it to can open it until it expires, and the path (with the token) appears in the hosting provider's request logs.
- **Demo login is closed by default.** `/api/demo-login` returns 404 unless `DEMO_AUTH=true`. The "demo mode" banner was removed; `DEMO_AUTH` still gates the one-click login, which now covers only the seeded synthetic accounts. Real users sign in with Oura or a one-time email link (see ARCHITECTURE.md#sign-in); only a hash of the Oura account id and of each link token is stored.

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
