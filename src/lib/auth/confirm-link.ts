import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNext } from "./safe-next";

/**
 * What an auth email link carries, read once and the same way by the
 * `/confirm` page (which only renders) and its action (which signs in).
 *
 * Two token shapes arrive: `token_hash` + `type` from the templates in
 * `supabase/email-templates/`, and `code` from a PKCE exchange. Both end in
 * the same session, so they share one reading rather than two parsers that
 * could disagree about what counts as a link.
 */
export type ConfirmLink =
  | { kind: "code"; code: string; next: string }
  | { kind: "token_hash"; tokenHash: string; type: EmailOtpType; next: string }
  | { kind: "missing" };

/** The one error a link can carry before Supabase is even asked. */
export const MISSING_TOKEN_ERROR = "That link is missing its token.";

/**
 * The verification types GoTrue accepts with a `token_hash`. A value outside
 * this set is a mangled link — a mail scanner's truncated copy sends
 * `type=magicl` — and is refused here as "missing" rather than forwarded for
 * GoTrue to turn away with a 400.
 */
const OTP_TYPES: ReadonlySet<string> = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function isOtpType(value: string): value is EmailOtpType {
  return OTP_TYPES.has(value);
}

/**
 * Read a link from anything with a `get()` — `URLSearchParams`, `FormData`,
 * or a page's `searchParams` wrapped in one. Non-string and blank values read
 * as absent. `next` is clamped through `safeNext()` here, so neither caller
 * can forget to.
 */
export function parseConfirmLink(params: {
  get(name: string): unknown;
}): ConfirmLink {
  const read = (name: string): string | null => {
    const value = params.get(name);
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };

  const next = safeNext(read("next"));

  const code = read("code");
  if (code) return { kind: "code", code, next };

  const tokenHash = read("token_hash");
  const type = read("type");
  if (tokenHash && type && isOtpType(type)) {
    return { kind: "token_hash", tokenHash, type, next };
  }

  return { kind: "missing" };
}

/** The `/error` page, which renders whatever sentence it is handed. */
export function errorHref(message: string): string {
  return `/error?error=${encodeURIComponent(message)}`;
}
