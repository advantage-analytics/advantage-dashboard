import { createHmac, timingSafeEqual } from "node:crypto";

import { emailOrigin } from "@/lib/site-url";

/**
 * One-click unsubscribe for the mail that was not caused by something the
 * recipient just did — today only the first-upload nudges.
 *
 * The link carries the user id and an HMAC of it, so it works signed out (a
 * person reading mail on their phone is rarely signed in there) and cannot be
 * forged for somebody else's account. The key is derived from the
 * service-role key rather than a new variable: every deployment that can send
 * this mail already holds it, and a missing secret would mean mail with no
 * working unsubscribe. Rotating that key retires the links already sent,
 * which only means the Settings switch is the way out for that mail.
 *
 * SERVER ONLY — it reads `SUPABASE_SERVICE_ROLE_KEY`.
 */

/** Which switch a link turns off. One today; the scope keeps a token for one
 *  switch from turning off another when a second is added. */
export type UnsubscribeScope = "getting_started";

function key(): Buffer | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  return createHmac("sha256", secret).update("email-unsubscribe-v1").digest();
}

export function unsubscribeToken(
  userId: string,
  scope: UnsubscribeScope = "getting_started",
): string | null {
  const k = key();
  if (!k) return null;
  return createHmac("sha256", k)
    .update(`${scope}:${userId}`)
    .digest("base64url");
}

export function verifyUnsubscribeToken(
  userId: string,
  token: string,
  scope: UnsubscribeScope = "getting_started",
): boolean {
  const expected = unsubscribeToken(userId, scope);
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function query(userId: string, token: string): string {
  return new URLSearchParams({ u: userId, t: token }).toString();
}

/**
 * The two places a link can go. The footer link opens a page with a button,
 * because mail scanners GET every link and an unsubscribe on GET would turn
 * people's mail off without them (`docs/email-system.md` §1, "The link lands
 * on a page"). The `List-Unsubscribe` header gets the POST endpoint: mail
 * clients send RFC 8058's one-click POST there, which a scanner never does.
 * Null when there is no key — the caller then does not send.
 */
export function unsubscribeLinks(
  userId: string,
): { page: string; oneClick: string } | null {
  const token = unsubscribeToken(userId);
  if (!token) return null;
  const origin = emailOrigin();
  return {
    page: `${origin}/email/unsubscribe?${query(userId, token)}`,
    oneClick: `${origin}/api/email/unsubscribe?${query(userId, token)}`,
  };
}
