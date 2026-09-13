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
 */
export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ??
    "http://localhost:3000"
  );
}
