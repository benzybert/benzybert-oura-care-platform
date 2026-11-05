import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Lab report PDFs (up to 4 MB, src/lib/pdf-text.ts) are uploaded through a server action. Vercel caps a request
    // body at 4.5 MB, so this stays just above the file limit plus the form fields.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
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
