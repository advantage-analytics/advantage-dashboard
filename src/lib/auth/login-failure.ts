/**
 * Why a sign-in failed, as a fixed slug for `login_failed`.
 *
 * Read from Supabase's error `code` first and its message second — the same
 * phrases `toAuthError()` translates — and never anything else. The thrown
 * value is not sent: a Supabase message can quote the address that was typed,
 * and the reason is all the daily report needs to tell a forgotten password
 * from a lockout from an unconfirmed account.
 */
export type LoginFailureReason =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "rate_limited"
  | "invalid_email"
  | "network"
  // Google: Supabase answered with neither an error nor a URL to send the
  // browser to, so the tap would otherwise have done nothing at all.
  | "no_redirect_url"
  | "unknown";

export type LoginMethod = "password" | "google";

const BY_CODE: Readonly<Record<string, LoginFailureReason>> = {
  invalid_credentials: "invalid_credentials",
  email_not_confirmed: "email_not_confirmed",
  over_request_rate_limit: "rate_limited",
  over_email_send_rate_limit: "rate_limited",
  email_address_invalid: "invalid_email",
  validation_failed: "invalid_email",
  // Not Supabase's: the form's own code for an OAuth answer with no URL.
  no_redirect_url: "no_redirect_url",
};

const BY_MESSAGE: ReadonlyArray<[RegExp, LoginFailureReason]> = [
  [/invalid login credentials/i, "invalid_credentials"],
  [/email not confirmed/i, "email_not_confirmed"],
  [/for security purposes|rate limit|too many requests/i, "rate_limited"],
  [/unable to validate email|invalid format/i, "invalid_email"],
  [/network|fetch failed|failed to fetch/i, "network"],
];

export function loginFailureReason(err: unknown): LoginFailureReason {
  const code =
    err && typeof err === "object" && "code" in err
      ? (err as { code?: unknown }).code
      : undefined;
  if (typeof code === "string" && code in BY_CODE) return BY_CODE[code];
  const raw = err instanceof Error ? err.message : String(err ?? "");
  return BY_MESSAGE.find(([match]) => match.test(raw))?.[1] ?? "unknown";
}
