import { PUBLIC_MEMBER_CONFIG } from "../config/public-member";
import type { MemberTab } from "./member-tabs";

/**
 * Public read-only view of one member's area (the owner's own, by his choice). A visitor without a
 * session who opens /member sees that member's pages, but only the tabs below, and nothing that acts:
 * every server action and API route still requires a real session, so a visitor is sent to sign in.
 *
 * Closed on purpose: tabs holding other people's details or able to act or spend in the member's name
 * (sharing: doctors' emails and links; circle and heart: family names and phones; challenges: other
 * players; integrations: alarm webhooks; profile and welcome: account settings; assistant: paid AI calls;
 * new custom view: a form). Readers' experiment ideas are hidden as well.
 */
export const PUBLIC_TABS: readonly MemberTab[] = ["home", "data", "experiments", "goals", "medications", "biomarkers", "labs"];

export const isPublicTab = (tab: unknown): tab is MemberTab =>
  typeof tab === "string" && (PUBLIC_TABS as readonly string[]).includes(tab);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The member shown to visitors, or null when the public view is off. */
export function publicMemberId(env: string | undefined = process.env.PUBLIC_MEMBER_ID): string | null {
  const id = (env ?? PUBLIC_MEMBER_CONFIG.memberId).trim();
  return UUID_RE.test(id) ? id : null;
}
