/**
 * Everything the Oura API v2 offers a member, except `email` (members sign in with Oura or their own address).
 * The owner asked for all of it. The extra data is read only by the member's own page (docs/PRIVACY.md);
 * the care, organization and doctor-link views never see it.
 *   daily     daily sleep / readiness / activity / stress / bedtime
 *   heartrate all-day heart-rate series
 *   workout   workouts    session  meditation / breathing sessions    tag  tags the member wrote in the Oura app
 *   spo2Daily blood-oxygen average + breathing disturbance index
 *   personal  age, weight, height, biological sex, and the Oura account id used for "sign in with Oura"
 * Members who connected earlier hold a token with `daily` only: the optional collections then answer 401/403,
 * which `fetchOptional` reports as "forbidden" instead of treating it as a dead connection.
 */
export const OURA_SCOPES = ["daily", "heartrate", "workout", "tag", "session", "spo2Daily", "personal"];

/**
 * Newer scope names seen in Oura's developer portal and third-party clients (not verified against a live
 * authorization): with the scopes above, SpO2, resilience, cardiovascular age, VO2 max, the ring configuration
 * and battery answered 403. They are asked for too; if Oura rejects the authorize request (`invalid_scope`),
 * the callback retries once with OURA_SCOPES only (`?basic=1`), so a wrong name can never block a connection.
 */
export const NEWER_SCOPES = ["spo2", "stress", "heart_health", "ring_configuration"];

/** The scope list for the authorize URL. */
export function requestedScopes(basic = false): string[] {
  return basic ? OURA_SCOPES : [...OURA_SCOPES, ...NEWER_SCOPES];
}

/** Scopes added after the first release: a connection whose stored scopes lack one of these can be re-authorized. */
export const OPTIONAL_SCOPES = OURA_SCOPES.filter((s) => s !== "daily");

/** The scopes in `wanted` that a stored (space-separated) scope string does not contain. */
export function missingScopes(stored: string | null | undefined, wanted: readonly string[] = OURA_SCOPES): string[] {
  const have = new Set((stored ?? "").split(/\s+/).filter(Boolean));
  return wanted.filter((s) => !have.has(s));
}

/**
 * The scopes Oura actually granted, from the token response (`"extapi:daily extapi:heartrate"`; the member can
 * untick scopes on Oura's consent screen). Falls back to what was asked for when Oura sends no list.
 */
export function grantedScopes(fromToken: string | null | undefined, requested: readonly string[]): string {
  const granted = (fromToken ?? "")
    .split(/[\s,]+/)
    .map((s) => s.replace(/^extapi:/, ""))
    .filter(Boolean);
  return (granted.length > 0 ? granted : requested).join(" ");
}

/** Oura data families that answered "forbidden" on the last sync (the token lacks their scope). */
export function forbiddenFamilies(coverage: Record<string, { status: string }> | null | undefined): string[] {
  return Object.entries(coverage ?? {})
    .filter(([, c]) => c.status === "forbidden")
    .map(([name]) => name)
    .sort();
}
