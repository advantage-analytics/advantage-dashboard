/**
 * Why a sign-up submit was refused, as fixed slugs for `sign_up_refused`.
 *
 * The form refuses in two places: its own checks before the round trip
 * (`signUpFormRefusal`) and Supabase's answer (`signUpServerReason`). Both
 * yield a slug and the field that owns the message, never the thrown value
 * or anything typed — a Supabase message can quote the address, and the slug
 * is all a report needs to tell a weak password from a mistyped address.
 */
import {
  emailProblem,
  validatePassword,
  type AuthError,
  type AuthErrorField,
  type EmailProblemReason,
} from "./error-messages";

export type SignUpRefusalReason =
  // The form's own checks, in the order it runs them.
  | EmailProblemReason
  | "password_rule"
  | "passwords_differ"
  | "terms_not_agreed"
  // Supabase's answer.
  | "already_registered"
  | "weak_password"
  | "invalid_email"
  | "rate_limited"
  | "signup_disabled"
  | "network"
  | "unknown";

export interface SignUpRefusal {
  field: AuthErrorField;
  reason: SignUpRefusalReason;
}

/**
 * The first client-side rule a submit fails, with the message the form shows
 * on that field, or null when every check passes.
 */
export function signUpFormRefusal(
  fields: { email: string; password: string; confirm: string },
  agreed: boolean,
): (SignUpRefusal & AuthError) | null {
  const email = emailProblem(fields.email);
  if (email) return { field: "email", ...email };
  const password = validatePassword(fields.password);
  if (password) {
    return { field: "password", reason: "password_rule", message: password };
  }
  if (fields.password !== fields.confirm) {
    return {
      field: "confirm",
      reason: "passwords_differ",
      message: "Both passwords have to match.",
    };
  }
  if (!agreed) {
    return {
      field: "consent",
      reason: "terms_not_agreed",
      message: "Agree to the Terms and Privacy Policy to continue.",
    };
  }
  return null;
}

const BY_CODE: Readonly<Record<string, SignUpRefusalReason>> = {
  user_already_exists: "already_registered",
  email_exists: "already_registered",
  weak_password: "weak_password",
  email_address_invalid: "invalid_email",
  validation_failed: "invalid_email",
  over_request_rate_limit: "rate_limited",
  over_email_send_rate_limit: "rate_limited",
  signup_disabled: "signup_disabled",
  email_provider_disabled: "signup_disabled",
};

// The same phrases `toAuthError()` translates, so the slug and the message
// the person read agree.
const BY_MESSAGE: ReadonlyArray<[RegExp, SignUpRefusalReason]> = [
  [/already registered|already exists/i, "already_registered"],
  [/password.*at least|weak password/i, "weak_password"],
  [/unable to validate email|invalid format/i, "invalid_email"],
  [/for security purposes|rate limit|too many requests/i, "rate_limited"],
  [/signups? not allowed|signup.*disabled/i, "signup_disabled"],
  [/network|fetch failed|failed to fetch/i, "network"],
];

/** Supabase's refusal of `auth.signUp`, read from its `code` first, then its message. */
export function signUpServerReason(err: unknown): SignUpRefusalReason {
  const code =
    err && typeof err === "object" && "code" in err
      ? (err as { code?: unknown }).code
      : undefined;
  if (typeof code === "string" && code in BY_CODE) return BY_CODE[code];
  const raw = err instanceof Error ? err.message : String(err ?? "");
  return BY_MESSAGE.find(([match]) => match.test(raw))?.[1] ?? "unknown";
}
