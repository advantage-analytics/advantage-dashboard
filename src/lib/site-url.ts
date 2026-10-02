/**
 * Where this deployment is publicly reachable — by configuration.
 *
 * There were two private copies of this before the email module needed a third
 * — one in `services/programs/claim-actions.ts`, one inside
 * `splitstep/config.ts`'s `resolveWebhookUrl()`. Same environment variable,
 * same trailing-slash strip, no way for a reader to know they agreed.
 *
 * ── Which resolver ──────────────────────────────────────────────────────────
 * Two, on purpose, split by who ends up holding the link:
 *
 * - `siteUrl()` (this) — configured, never the request. For anything with
 *   no request at all (cron sweeps, the vendor's webhook, `metadataBase`).
 *   Links that land in an email go through `emailOrigin()` below, which pins
 *   deployed builds to `PRODUCTION_APP_URL`. A `Host` header an attacker can set
 *   must never become the origin of a link somebody else is asked to click —
 *   `docs/email-system.md` §5.
 * - `requestOrigin()` (`request-origin.ts`, over `originFromHeaders()` below)
 *   — the origin the person is actually on. For links they read on screen, for
 *   redirects, and for Supabase `redirectTo`s. A worktree's dev server on port
 *   3002 says 3002, whatever `.env.local` was copied with; a preview deployment
 *   says itself.
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
/** Which Vercel-provided var names this deployment, by `VERCEL_ENV`. */
const VERCEL_HOST_VAR = {
  production: "VERCEL_PROJECT_PRODUCTION_URL",
  preview: "VERCEL_URL",
} as const;

export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured) return configured;

  const env = process.env.VERCEL_ENV;
  const hostVar =
    env !== undefined &&
    Object.prototype.hasOwnProperty.call(VERCEL_HOST_VAR, env)
      ? VERCEL_HOST_VAR[env as keyof typeof VERCEL_HOST_VAR]
      : undefined;
  const host = hostVar ? process.env[hostVar] : undefined;
  if (host) return `https://${host}`;

  if (process.env.NODE_ENV === "production") {
    console.warn(
      "siteUrl() is falling back to http://localhost:3000 in production — set NEXT_PUBLIC_SITE_URL.",
    );
  }

  return "http://localhost:3000";
}

/**
 * The production app — the only origin an email link may carry once deployed.
 *
 * A constant, not an environment variable, because the bug it closes was an
 * environment variable doing exactly its job: Preview's `NEXT_PUBLIC_SITE_URL`
 * is `https://www.advantage-analytics.dev`, and preview shares production's
 * database. So a preview deployment that settled a real athlete's job — the
 * vendor's webhook registered against it, or someone on the `.dev` matches
 * page driving the status poll — mailed that athlete a `.dev` link, and
 * nothing about the send looked wrong. A link that cannot depend on which
 * deployment sent it cannot be read from that deployment's configuration.
 */
export const PRODUCTION_APP_URL = "https://app.advantage-analytics.com";

/**
 * The origin for every link that leaves in an email.
 *
 * On any Vercel deployment, production or preview, this is
 * `PRODUCTION_APP_URL`: they share one database, so the match, invite token
 * or claim a preview-sent email names exists on production too, and the person
 * reading it is a real user who should land on the real app. Only a local run
 * (no `VERCEL_ENV`, or `vercel dev`'s `development`) falls back to `siteUrl()`,
 * where a localhost link is the right link for whoever is at the machine.
 *
 * `siteUrl()` stays for what is about this deployment rather than the person
 * reading the mail — `metadataBase`, same-origin checks, the vendor webhook.
 */
export function emailOrigin(): string {
  const env = process.env.VERCEL_ENV;
  if (env === "production" || env === "preview") return PRODUCTION_APP_URL;
  return siteUrl();
}

/**
 * The leading value of a header proxies may have joined with commas
 * (`x-forwarded-host: app.example.com, edge.internal`), trimmed; `undefined`
 * for absent or blank so callers can `??` through to the next candidate.
 */
function first(value: string | null): string | undefined {
  return value?.split(",")[0]?.trim() || undefined;
}

const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/**
 * The origin of the request these headers arrived with.
 *
 * Pure — takes anything with `.get()`, so a Route Handler passes
 * `request.headers` and `requestOrigin()` passes Next's `headers()`. The
 * forwarded host wins over `host`, because behind Vercel's proxy `host` is
 * the internal one; the forwarded protocol wins over the guess, and the guess
 * is `http` only for a loopback host. No host at all — which HTTP/1.1 forbids
 * but the type permits — falls back to `siteUrl()` rather than throwing or
 * returning `undefined://`.
 */
export function originFromHeaders(headers: {
  get(name: string): string | null;
}): string {
  const host =
    first(headers.get("x-forwarded-host")) ?? first(headers.get("host"));
  if (!host) return siteUrl();
  const proto =
    first(headers.get("x-forwarded-proto")) ??
    (LOOPBACK_HOST.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
