/**
 * The public address of the site, kept in this file on purpose (see CLAUDE.md, "Config lives in files").
 * Sign-in emails link here and never to the request's Host header, which a caller can forge to steal a link.
 * Env SITE_URL, if set, takes precedence (e.g. a custom domain).
 */
export const SITE_CONFIG = {
  url: "https://oura-care-platform.vercel.app",
};

export function siteUrl(): string {
  return (process.env.SITE_URL || SITE_CONFIG.url).replace(/\/+$/, "");
}
