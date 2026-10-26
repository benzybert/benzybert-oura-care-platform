import { createHash } from "node:crypto";

/**
 * "Sign in with Oura" recognises a member by their Oura account id (personal_info.id). Only this hash is
 * stored (oura_connections.oura_account_hash), never the id. Plain sha256 on purpose: rotating a secret
 * must not lock every member out.
 */
export function ouraAccountHash(ouraId: string): string {
  return createHash("sha256").update(`oura-account:${ouraId.trim()}`).digest("hex");
}
