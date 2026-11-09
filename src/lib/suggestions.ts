import { randomBytes } from "node:crypto";
import { siteUrl } from "../config/site";
import { EXPERIMENT_TEMPLATES } from "./experiments";

/**
 * "הציעו ניסוי": a public page (/suggest/<slug>) linked from the member's posts, where a reader sends
 * an idea for a future experiment. The page shows no name and no health data, and only lets someone
 * write. Ideas land in the member's experiments tab, nowhere else.
 */

export const IDEA_MIN = 3;
export const IDEA_MAX = 300;
export const SUGGESTER_MAX = 60;
/** At most this many ideas per member per hour, from everyone together: enough for readers, a ceiling for a flood. */
export const SUGGESTIONS_PER_HOUR = 30;
/** New ideas waiting at most; past it the page says the box is full until the member goes through them. */
export const MAX_NEW_SUGGESTIONS = 200;

export const SUGGESTION_STATUSES = ["new", "used", "dismissed"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];
export const isSuggestionStatus = (s: unknown): s is SuggestionStatus =>
  typeof s === "string" && (SUGGESTION_STATUSES as readonly string[]).includes(s);

/** 9 random bytes as base64url: 12 characters. */
export const SLUG_RE = /^[A-Za-z0-9_-]{12}$/;
export const newSuggestionSlug = () => randomBytes(9).toString("base64url");
export const isSuggestionSlug = (s: unknown): s is string => typeof s === "string" && SLUG_RE.test(s);
export const suggestPath = (slug: string) => `/suggest/${slug}`;
/** The absolute address for posts and emails: always the site's own address, never the request's Host. */
export const suggestUrl = (slug: string) => `${siteUrl()}${suggestPath(slug)}`;

/**
 * Newsletter poll: each option in the email is a link to the suggestion page with `?vote=<template id>`.
 * MailerLite's own click tracking counts the votes per subscriber; the site stores nothing for a vote.
 * The page only thanks the reader and offers the idea box for a comment. Unknown ids are ignored.
 */
export function pollVoteTitle(vote: unknown): string | null {
  if (typeof vote !== "string") return null;
  return EXPERIMENT_TEMPLATES.find((t) => t.id === vote)?.title ?? null;
}
export const pollVoteUrl = (slug: string, templateId: string) => `${suggestUrl(slug)}?vote=${encodeURIComponent(templateId)}`;

/** The form's honeypot field: hidden from people, filled in by bots. */
export const HONEYPOT_FIELD = "website";

type Get = (key: string) => string | null | undefined;

export type SuggestionInput = { idea: string; suggestedBy: string | null };
export type ParsedSuggestion = { ok: true; value: SuggestionInput } | { ok: false; reason: "spam" | "short" | "long" };

const clean = (s: string | null | undefined) =>
  (s ?? "")
    .replace(/\r\n/g, "\n")
    // control characters other than newline and tab
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .trim();

export function parseSuggestionForm(get: Get): ParsedSuggestion {
  if (clean(get(HONEYPOT_FIELD))) return { ok: false, reason: "spam" };
  const idea = clean(get("idea")).replace(/\n{3,}/g, "\n\n");
  if (idea.length < IDEA_MIN) return { ok: false, reason: "short" };
  if (idea.length > IDEA_MAX) return { ok: false, reason: "long" };
  const name = clean(get("name")).replace(/\s+/g, " ");
  if (name.length > SUGGESTER_MAX) return { ok: false, reason: "long" };
  return { ok: true, value: { idea, suggestedBy: name || null } };
}
