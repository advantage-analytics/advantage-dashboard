/**
 * Where this deployment is publicly reachable.
 *
 * There were two private copies of this before the email module needed a third
 * — one in `services/programs/claim-actions.ts`, one inside
 * `splitstep/config.ts`'s `resolveWebhookUrl()`. Same environment variable,
 * same trailing-slash strip, no way for a reader to know they agreed.
 *
 * Note what this deliberately does NOT do: it does not reject localhost.
 * `resolveWebhookUrl()` returns null for a loopback origin because the vendor
 * calls in from outside, so a local origin there is not a degraded webhook but
 * no webhook at all. A link in an email is the opposite case — during local
 * development a localhost link is exactly the right link, because the person
 * clicking it is sitting at the machine serving it.
 *
 * `NEXT_PUBLIC_SITE_URL` always wins when set. When it isn't, fall back to the
 * Vercel-provided env vars before ever reaching for localhost: `VERCEL_ENV`
 * tells us which deployment this is, `VERCEL_PROJECT_PRODUCTION_URL` is the
 * stable production domain, and `VERCEL_URL` is the URL of this specific
 * deployment (used for preview). Neither carries a protocol, so both get
 * `https://` prefixed. Only a genuinely local run — no Vercel env at all —
 * reaches the `localhost:3000` fallback, and if that happens while
 * `NODE_ENV === "production"` (a deployed build that's missing the site-url
 * config), warn once so the gap doesn't ship silently.
 */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured) return configured;

  if (process.env.VERCEL_ENV === "production") {
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    if (host) return `https://${host}`;
  }

  if (process.env.VERCEL_ENV === "preview") {
    const host = process.env.VERCEL_URL;
    if (host) return `https://${host}`;
  }

  if (process.env.NODE_ENV === "production") {
    console.warn(
      "siteUrl() is falling back to http://localhost:3000 in production — set NEXT_PUBLIC_SITE_URL.",
    );
  }

  return "http://localhost:3000";
}
