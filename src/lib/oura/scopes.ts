/**
 * Everything the Oura API v2 offers a member, except `email` (we already have the member's address).
 * The owner asked for all of it. The extra data is read only by the member's own page (docs/PRIVACY.md);
 * the care, organization and doctor-link views never see it.
 *   daily     daily sleep / readiness / activity / stress / resilience / cardiovascular age / VO2 max / bedtime
 *   heartrate all-day heart-rate series
 *   workout   workouts    session  meditation / breathing sessions    tag  tags the member wrote in the Oura app
 *   spo2Daily blood-oxygen average + breathing disturbance index
 *   personal  age, weight, height, biological sex (and the ring's configuration)
 * Members who connected earlier hold a token with `daily` only: the optional collections then answer 401/403,
 * which `fetchOptional` reports as "forbidden" instead of treating it as a dead connection.
 */
export const OURA_SCOPES = ["daily", "heartrate", "workout", "tag", "session", "spo2Daily", "personal"];

/** Scopes added after the first release: a connection whose stored scopes lack one of these can be re-authorized. */
export const OPTIONAL_SCOPES = OURA_SCOPES.filter((s) => s !== "daily");

/** The scopes in `wanted` that a stored (space-separated) scope string does not contain. */
export function missingScopes(stored: string | null | undefined, wanted: readonly string[] = OURA_SCOPES): string[] {
  const have = new Set((stored ?? "").split(/\s+/).filter(Boolean));
  return wanted.filter((s) => !have.has(s));
}


