import type { MetadataRoute } from "next";

/** Health data: nothing here is for search engines. Private links also send X-Robots-Tag (next.config.ts). */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
