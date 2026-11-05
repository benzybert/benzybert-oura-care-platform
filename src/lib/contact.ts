import { normalizeEmail } from "./auth-rules";

/**
 * The public contact form (/contact): clinics and care teams ask about implementation, a demo or anything
 * else. The form holds contact details only, never health data. Requests are stored in `contact_requests`
 * and, when `CONTACT_CONFIG.notifyTo` is set, the owner gets one email per request. Nothing is logged.
 */

export const CONTACT_TOPICS = ["implementation", "demo", "partnership", "other"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];
export const isContactTopic = (s: unknown): s is ContactTopic =>
  typeof s === "string" && (CONTACT_TOPICS as readonly string[]).includes(s);

export const CONTACT_ROLES = ["physician", "nurse", "coordinator", "management", "other"] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];
export const isContactRole = (s: unknown): s is ContactRole =>
  typeof s === "string" && (CONTACT_ROLES as readonly string[]).includes(s);

export const NAME_MAX = 80;
export const ORG_MAX = 120;
export const PHONE_MAX = 30;
export const MESSAGE_MAX = 2000;
/** All requests together per hour: plenty for real people, a ceiling for a flood. */
export const CONTACT_PER_HOUR = 20;
/** Requests from one address per day. */
export const CONTACT_PER_EMAIL_PER_DAY = 3;

/** The honeypot field: hidden from people, filled in by bots. */
export const CONTACT_HONEYPOT = "website";

export type ContactInput = {
  topic: ContactTopic;
  name: string;
  organization: string;
  role: ContactRole | null;
  email: string;
  phone: string | null;
  message: string | null;
  locale: "en" | "he";
};

export type ContactError = "spam" | "name" | "organization" | "email" | "phone" | "message" | "consent";
export type ParsedContact = { ok: true; value: ContactInput } | { ok: false; reason: ContactError };

type Get = (key: string) => string | null | undefined;

const clean = (s: string | null | undefined) =>
  (s ?? "")
    .replace(/\r\n/g, "\n")
    // control characters other than newline and tab
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .trim();
const oneLine = (s: string | null | undefined) => clean(s).replace(/\s+/g, " ");

/** Digits, spaces, +, -, parentheses and dots only. */
const PHONE_RE = /^[+()\d][\d\s().-]{5,}$/;

export function parseContactForm(get: Get): ParsedContact {
  if (clean(get(CONTACT_HONEYPOT))) return { ok: false, reason: "spam" };

  const name = oneLine(get("name"));
  if (name.length < 2 || name.length > NAME_MAX) return { ok: false, reason: "name" };

  const organization = oneLine(get("organization"));
  if (organization.length < 2 || organization.length > ORG_MAX) return { ok: false, reason: "organization" };

  const email = normalizeEmail(get("email"));
  if (!email) return { ok: false, reason: "email" };

  const phoneRaw = oneLine(get("phone"));
  if (phoneRaw && (phoneRaw.length > PHONE_MAX || !PHONE_RE.test(phoneRaw))) return { ok: false, reason: "phone" };

  const message = clean(get("message")).replace(/\n{3,}/g, "\n\n");
  if (message.length > MESSAGE_MAX) return { ok: false, reason: "message" };

  if (get("consent") !== "yes") return { ok: false, reason: "consent" };

  const topicRaw = get("topic");
  const roleRaw = get("role");
  return {
    ok: true,
    value: {
      topic: isContactTopic(topicRaw) ? topicRaw : "implementation",
      name,
      organization,
      role: isContactRole(roleRaw) ? roleRaw : null,
      email,
      phone: phoneRaw || null,
      message: message || null,
      locale: get("locale") === "he" ? "he" : "en",
    },
  };
}

/** True when the form is closed for now: too many requests overall in the last hour, or from this address today. */
export function contactRateLimited(load: { lastHour: number; fromEmailToday: number }): boolean {
  return load.lastHour >= CONTACT_PER_HOUR || load.fromEmailToday >= CONTACT_PER_EMAIL_PER_DAY;
}

/** The owner's notification: plain text, in English, with the details the person typed. */
export function contactNotification(r: ContactInput): { subject: string; text: string } {
  const lines = [
    `New contact request (${r.topic})`,
    "",
    `Name: ${r.name}`,
    `Organization: ${r.organization}`,
    `Role: ${r.role ?? "not given"}`,
    `Email: ${r.email}`,
    `Phone: ${r.phone ?? "not given"}`,
    `Language: ${r.locale === "he" ? "Hebrew" : "English"}`,
    "",
    r.message ? `Message:\n${r.message}` : "No message.",
    "",
    "Reply to this email to answer them directly.",
  ];
  return { subject: `Oura Care contact: ${r.organization} (${r.topic})`.slice(0, 150), text: lines.join("\n") };
}

/** Status keys the page reads back from `?sent=`; anything else is ignored. */
export const CONTACT_STATUSES = ["1", "busy", "name", "organization", "email", "phone", "message", "consent"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];
export const isContactStatus = (s: unknown): s is ContactStatus =>
  typeof s === "string" && (CONTACT_STATUSES as readonly string[]).includes(s);
