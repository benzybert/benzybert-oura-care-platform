import type { HeartRule, Level } from "../heart/engine";
import type { Locale } from "../i18n";
import { messagesFor } from "../i18n/messages";

/**
 * The words of an alert for one recipient, in their language. Email carries the numbers; the text message is short
 * and links to the status page; the call reads the title aloud. Never log what these return.
 */

export type AlertText = {
  levelLabel: string;
  title: string;
  detail: string;
  subject: string;
  email: string;
  sms: string;
  spoken: string;
};

export function buildAlertText(input: {
  locale: Locale;
  level: Level;
  rule: HeartRule;
  data: Record<string, number | string | null>;
  /** what the family circle calls the person; empty falls back to "a family member" */
  person: string;
  /** absolute link to the guardian's status page, or null for a recipient without one */
  link: string | null;
  test?: boolean;
  /** other things that changed in the same sync: named in the email, not sent as separate messages */
  also?: HeartRule[];
}): AlertText {
  const h = messagesFor(input.locale).heart;
  const test = Boolean(input.test);
  const person = input.person.trim() || h.notify.someone;
  const levelLabel = h.levels[input.level];
  const rule = h.rules[input.rule];
  const title = rule.title;
  const detail = test ? "" : rule.text(input.data);

  const lines = [
    h.notify.emailIntro(person, test),
    "",
    ...(test ? [] : [`${title}`, detail, ""]),
    ...(test || !input.also?.length ? [] : [h.notify.also(input.also.map((r) => h.rules[r].title)), ""]),
    ...(test ? [] : [h.notify.guidance[input.level], ""]),
    ...(input.link ? [h.notify.openStatus, input.link, ""] : []),
    h.notify.delay,
    h.notify.emergency,
    ...(input.link ? [h.notify.stop] : []),
  ];

  return {
    levelLabel,
    title,
    detail,
    subject: h.notify.subject(levelLabel, person, test ? h.notify.test : title, test),
    email: lines.join("\n"),
    sms: h.notify.sms(levelLabel, person, test ? h.notify.test : title, input.link ?? "", test).trim(),
    spoken: h.notify.spoken(person, title, test),
  };
}

/** Email to the member themselves (the person the watch is about). */
export function buildSelfText(input: {
  locale: Locale;
  level: Level;
  rule: HeartRule;
  data: Record<string, number | string | null>;
}): { subject: string; email: string } {
  const h = messagesFor(input.locale).heart;
  const rule = h.rules[input.rule];
  const levelLabel = h.levels[input.level];
  return {
    subject: h.notify.selfSubject(levelLabel, rule.title),
    email: [h.notify.selfIntro, "", rule.title, rule.text(input.data), "", h.notify.delay, h.notify.selfOutro].join("\n"),
  };
}

export function buildOnItText(locale: Locale, who: string, person: string): { subject: string; body: string } {
  const h = messagesFor(locale).heart.notify;
  return { subject: h.onItSubject(who, person), body: h.onItBody(who, person) };
}

export function buildOkText(locale: Locale, person: string): { subject: string; body: string } {
  const h = messagesFor(locale).heart.notify;
  return { subject: h.okSubject(person), body: h.okBody(person) };
}
