import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy. Everything is self-hosted (fonts, charts, icons), so only 'self' is allowed.
 * Scripts need 'unsafe-inline' for the framework's inline bootstrap (no per-request nonce yet); dev also needs eval.
 * form-action lists wa.me because one server action ends in a WhatsApp link when JavaScript is off.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://wa.me",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The PDF generator reads the self-hosted font files at runtime; make sure serverless bundles carry them.
  outputFileTracingIncludes: {
    "/member/**/*": ["./node_modules/@fontsource/ibm-plex-sans-hebrew/files/*-{400,700}-normal.woff"],
    "/share/**/*": ["./node_modules/@fontsource/ibm-plex-sans-hebrew/files/*-{400,700}-normal.woff"],
  },
  async headers() {
    return [
      {
        // Health data: never cache pages, never allow framing.
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      {
        // Doctor share links: the URL is the key, so it must never travel in a Referer header,
        // and the page must never be indexed.
        source: "/share/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        // Family circle pages: the URL is the key, so it never travels in a Referer header and the page is never indexed.
        source: "/family/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        // Public suggestion page: linked from posts, never indexed, the slug never leaks in a Referer.
        source: "/suggest/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
};

export default nextConfig;
