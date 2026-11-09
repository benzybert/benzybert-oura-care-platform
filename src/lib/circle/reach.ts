import { circleStatus, type CircleLinkRow } from "./queries";

/**
 * "Who will hear about it?" for the top of the family circle page: counts only people whose link is active, and only
 * the ways that can actually go out from this installation (email needs mail set up and an address; text and calls
 * need Twilio and a phone number), so the page never promises a message that cannot be sent. Pure.
 */

export type Channel = "email" | "sms" | "call";
export const CHANNELS: readonly Channel[] = ["email", "sms", "call"];

export type ReachConfig = { mail: boolean; sms: boolean };

type LinkLike = Pick<CircleLinkRow, "revokedAt" | "expiresAt" | "pausedAt" | "viaEmail" | "viaSms" | "viaCall" | "email" | "phone" | "viewCount">;

/** The ways this person can be reached right now; none for a paused, expired or removed link. */
export function reachableChannels(link: LinkLike, cfg: ReachConfig, now: Date = new Date()): Channel[] {
  if (circleStatus(link, now) !== "active") return [];
  const out: Channel[] = [];
  if (link.viaEmail && link.email && cfg.mail) out.push("email");
  if (link.viaSms && link.phone && cfg.sms) out.push("sms");
  if (link.viaCall && link.phone && cfg.sms) out.push("call");
  return out;
}

export type CircleReach = {
  /** people with an active link */
  active: number;
  /** of them, how many at least one way reaches */
  reachable: number;
  /** every way that will be used for someone, in a fixed order */
  channels: Channel[];
  /** active people who have not opened their page yet (they may not know they are in the circle) */
  notOpened: number;
};

export function circleReach(links: LinkLike[], cfg: ReachConfig, now: Date = new Date()): CircleReach {
  const active = links.filter((l) => circleStatus(l, now) === "active");
  const per = active.map((l) => reachableChannels(l, cfg, now));
  const used = new Set(per.flat());
  return {
    active: active.length,
    reachable: per.filter((c) => c.length > 0).length,
    channels: CHANNELS.filter((c) => used.has(c)),
    notOpened: active.filter((l) => l.viewCount === 0).length,
  };
}
