import type { MetadataRoute } from "next";
import { emailOrigin } from "@/lib/site-url";

/**
 * What crawlers may index. Added after Search Console reported the whole app
 * as "page with redirect" (every dashboard URL bounces a signed-out crawler to
 * the login page), "not found" (spent share, join, invite and claim tokens)
 * and "duplicate without user-selected canonical" (the preview deployment
 * serves the same pages as production). None of that is content anyone should
 * find on Google: the only pages worth indexing are the public auth entries.
 *
 * Only the production deployment allows anything. A preview shares the
 * database and markup, so it must never compete with production in search —
 * `emailOrigin()` is the production origin on any Vercel deployment and the
 * local origin otherwise, which is exactly the "am I the canonical host"
 * test. The canonical `<link>` in the root layout points at that same origin.
 */
const PUBLIC_PATHS = ["/login", "/sign-up", "/forgot-password"];

export default function robots(): MetadataRoute.Robots {
  const isProduction = process.env.VERCEL_ENV === "production";
  return {
    rules: isProduction
      ? { userAgent: "*", allow: PUBLIC_PATHS, disallow: "/" }
      : { userAgent: "*", disallow: "/" },
    host: emailOrigin(),
  };
}
