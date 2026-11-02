import { LEVEL_RANK, type Level, type Signal } from "../heart/engine";

/**
 * Who hears about an alert, and how. The ladder is fixed and easy to explain:
 *   watch  -> email                        (a gentle heads-up)
 *   alert  -> email + text message         (a clear change from usual, or a limit the member set)
 *   urgent -> email + text + phone call + physical alarms (a sustained episode over a limit the member turned on)
 * Each person only gets the channels the member switched on for them. Pure, so it is tested without a database.
 */

export type Channel = "email" | "sms" | "call" | "webhook";

export const CHANNEL_MIN_LEVEL: Record<Exclude<Channel, "webhook">, Level> = { email: "watch", sms: "alert", call: "urgent" };

export type Recipient = {
  email: string | null;
  phone: string | null;
  viaEmail: boolean;
  viaSms: boolean;
  viaCall: boolean;
  /** the guardian paused their own alerts */
  paused: boolean;
};

export function reaches(level: Level, min: Level): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[min];
}

/** The channels a person gets for an alert of this level, given what is switched on and what contact details exist. */
export function channelsFor(level: Level, r: Recipient): Array<Exclude<Channel, "webhook">> {
  if (r.paused) return [];
  const out: Array<Exclude<Channel, "webhook">> = [];
  if (r.viaEmail && r.email && reaches(level, CHANNEL_MIN_LEVEL.email)) out.push("email");
  if (r.viaSms && r.phone && reaches(level, CHANNEL_MIN_LEVEL.sms)) out.push("sms");
  if (r.viaCall && r.phone && reaches(level, CHANNEL_MIN_LEVEL.call)) out.push("call");
  return out;
}

/** A device (siren, lights) goes off at or above its own minimum level. */
export function deviceFires(level: Level, minLevel: Level): boolean {
  return reaches(level, minLevel);
}

/**
 * Signals worth telling people about. When "several signals" is present it already says it all, so the small
 * individual drifts it summarises are not sent separately (they stay visible on the heart page).
 */
export function notifiable(signals: Signal[]): Signal[] {
  const several = signals.some((s) => s.rule === "several_signals");
  const summarised = new Set(["resting_hr_high", "hrv_low", "breath_high", "temp_high", "spo2_low"]);
  return signals.filter((s) => !(several && summarised.has(s.rule) && s.level !== "urgent"));
}

export const ESCALATION = {
  /** an unanswered alert at this level is sent again after this many minutes, at most this many times */
  urgent: { rounds: 3 },
  alert: { afterMinutes: 240, rounds: 1 },
} as const;

/** Whether an open, unanswered alert is due for another round. */
export function escalationDue(input: {
  level: Level;
  status: string;
  round: number;
  lastNotifiedAt: Date | null;
  now: Date;
  urgentAfterMinutes: number;
}): boolean {
  if (input.status !== "open" || !input.lastNotifiedAt) return false;
  const waited = (input.now.getTime() - input.lastNotifiedAt.getTime()) / 60_000;
  if (input.level === "urgent") return input.round < ESCALATION.urgent.rounds && waited >= input.urgentAfterMinutes;
  if (input.level === "alert") return input.round < ESCALATION.alert.rounds && waited >= ESCALATION.alert.afterMinutes;
  return false;
}
