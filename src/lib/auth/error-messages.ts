/**
 * Supabase auth errors, translated.
 *
 * The as-built pages piped `error.message` straight into a tinted banner, so a
 * coach who fat-fingered a password read "Invalid login credentials" — API
 * phrasing that names no field and suggests no next step. The v2 audit asks for
 * plain language attached to the field that is actually wrong, so every message
 * here says what to do rather than what the API returned.
 */

/**
 * The account password rule, stated once.
 *
 * Both sign-up and update-password enforce it and both print it under the
 * fields, so the regex and the sentence describing it have to travel together —
 * they were previously two regexes and five copies of the sentence, free to
 * drift apart.
 */
export const PASSWORD_REGEX = /^(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/;
export const PASSWORD_RULE =
  "Password must be 8+ characters, include a number and a special character.";

/** Which field owns the message. `form` is the fallback for anything unattributable. */
export type AuthErrorField = "email" | "password" | "confirm" | "consent" | "form";

export interface AuthError {
  field: AuthErrorField;
  message: string;
}

/**
 * Supabase matches on substrings, not codes — the wire format has changed
 * between releases, so anchoring on a phrase is more durable than on a status.
 */
const TRANSLATIONS: ReadonlyArray<{
  match: RegExp;
  field: AuthErrorField;
  message: string;
}> = [
  {
    match: /invalid login credentials/i,
    field: "password",
    message: "That email and password don't match an account.",
  },
  {
    match: /email not confirmed/i,
    field: "email",
    message: "Confirm your email first — the link is in your inbox.",
  },
  {
    match: /already registered|already exists/i,
    field: "email",
    message: "That email already has an account. Sign in instead.",
  },
  {
    match: /unable to validate email|invalid format/i,
    field: "email",
    message: "That address is missing its domain — try .edu or .com",
  },
  {
    match: /for security purposes|rate limit|too many requests/i,
    field: "form",
    message: "Too many attempts. Wait a minute, then try again.",
  },
  {
    match: /should be different from the old password/i,
    field: "password",
    message: "Pick a password you haven't used on this account before.",
  },
  {
    match: /password.*at least|weak password/i,
    field: "password",
    message: PASSWORD_RULE,
  },
  {
    match: /token has expired|invalid token|expired/i,
    field: "form",
    message: "That link has expired. Request a new one and try again.",
  },
  {
    match: /network|fetch failed/i,
    field: "form",
    message: "Couldn't reach the server. Check your connection and try again.",
  },
];

/** Translate a thrown value into a field-attributed, human-readable error. */
export function toAuthError(err: unknown): AuthError {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const hit = TRANSLATIONS.find((t) => t.match.test(raw));
  if (hit) return { field: hit.field, message: hit.message };
  return { field: "form", message: "Something went wrong. Try again in a moment." };
}

/**
 * Client-side address check.
 *
 * B3 shows the specific "missing its domain" state, which only exists if we
 * catch it before the round trip — Supabase rejects `name@host` with generic
 * text. Deliberately permissive: this is a typo net, not RFC 5322.
 */
export function validateEmail(value: string): string | null {
  const email = value.trim();
  if (!email) return "Enter the email address on your account.";
  const at = email.indexOf("@");
  if (at < 1 || at !== email.lastIndexOf("@")) {
    return "Enter a valid email address.";
  }
  const domain = email.slice(at + 1);
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) {
    return "That address is missing its domain — try .edu or .com";
  }
  return null;
}

/** Enforce PASSWORD_RULE, returning the rule itself as the message when it fails. */
export function validatePassword(value: string): string | null {
  return PASSWORD_REGEX.test(value) ? null : PASSWORD_RULE;
}
