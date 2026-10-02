/**
 * Transactional email — tunable constants.
 *
 * Same rule as `splitstep/config.ts`: every address, endpoint and limit lives
 * here so there is one place to edit when something is renegotiated. Do not
 * inline these at call sites.
 *
 * This module is for email the PRODUCT sends — invites, analysis
 * notifications. Email that AUTH sends (confirm your address, reset your
 * password) is rendered by Supabase from the templates in
 * `supabase/email-templates/` and never passes through here. Two senders is
 * not an oversight: those six templates are hosted by Supabase, filled with
 * its `{{ .ConfirmationURL }}` placeholders, and tied to a working auth flow
 * that has no reason to move. What matters is that both look like one company,
 * which is what `shell.ts` is for.
 */

/**
 * The From header on every product email.
 *
 * A real mailbox rather than `no-reply@`, chosen deliberately for the pilot:
 * a coach who hits reply is giving feedback, and bouncing that is throwing
 * away the most valuable thing a pilot produces. It also matches the support
 * address already printed in the footer of all six auth templates, so the
 * address a person sees is the address that works.
 */
export const FROM_ADDRESS = "Advantage <team@advantage-analytics.com>";

/** Printed in the footer of every email, and where replies land. */
export const SUPPORT_ADDRESS = "team@advantage-analytics.com";

/**
 * Where internal alerts land — a copy of "a human has to look at this" mail
 * that would otherwise depend entirely on some user having `is_admin` set
 * and a working inbox. Defaults to the team inbox so the alert always has
 * somewhere to go even when no env var is configured; override with
 * `INTERNAL_ALERTS_ADDRESS` to route it elsewhere (a shared alerting inbox,
 * a distribution list) without touching code.
 */
export const INTERNAL_ALERTS_ADDRESS =
  process.env.INTERNAL_ALERTS_ADDRESS?.trim() || "team@advantage-analytics.com";

/**
 * Resend's send endpoint.
 *
 * Called with `fetch` rather than the `resend` SDK. The entire surface this
 * app needs is one POST with a JSON body, and the codebase already declines
 * SDKs it does not need for exactly this reason — see the note in
 * `services/upload/azure-block-upload.ts` about not pulling
 * `@azure/storage-blob` in to build a request it is handed the credentials
 * for. Adding a dependency to save fifteen lines is a bad trade.
 */
export const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Where we ask whether an address is on the account's suppression list.
 *
 * 404 means clear. 200 means Resend will accept the send, hand back an id, and
 * then silently drop the message — which is the entire reason this endpoint is
 * consulted at all. See `send.ts`.
 */
export const RESEND_SUPPRESSION_ENDPOINT =
  "https://api.resend.com/suppressions";

/**
 * How long a send is allowed to take before we give up on it.
 *
 * Bounded because these run inside server actions the user is waiting on. A
 * hung mail provider must not turn "invite a coach" into a spinner that never
 * resolves — the invite row is already written by then, and the resend path
 * exists precisely so a failed send is recoverable.
 */
export const SEND_TIMEOUT_MS = 10_000;

/**
 * Outreach — mail an admin sends from `/admin/outreach` to programs that have
 * not signed up, as opposed to the product mail above that someone triggered.
 *
 * Signed by a person rather than the company: cold mail from "Advantage" reads
 * as a newsletter, and the replies this exists to get go to the same inbox.
 */
export const OUTREACH_FROM = "Cj Gimena <team@advantage-analytics.com>";

/**
 * The marketing site's unsubscribe route, which writes the address to the
 * Resend suppression list. `?e=<address>&t=<program keys>`.
 */
export const OUTREACH_UNSUBSCRIBE_URL =
  "https://advantage-analytics.com/unsubscribe";

/**
 * The largest tranche one press of Send may contain.
 *
 * Resend's free plan stops at 100 sends a day (`docs/email-system.md`), and a
 * young domain that sends hundreds of cold emails in an afternoon is the
 * domain the next invitation lands in spam from. The page defaults to 40.
 */
export const OUTREACH_TRANCHE_MAX = 100;

/** Resend's rate limit is 2 requests a second; stay under it. */
export const OUTREACH_SEND_GAP_MS = 600;
