import { siteUrl } from "@/lib/site-url";
import { addHours } from "./claim-state";
import { generateToken, hashToken, tokenMatches } from "./tokens";

/**
 * Claimant identity verification — "are you actually this program's head coach?"
 *
 * A second, human-initiated check that sits beside the mailbox proof in
 * `tokens.ts`. The mailbox check answers "can you read mail at this address";
 * this one answers "does the person at that address agree they are who the
 * claim says they are", and an admin is the one who asks it, from the review
 * queue, when the automatic signals were not enough.
 *
 * Pure by design — no I/O, no database, no clock it does not take as an
 * argument. The route and the server action own the side effects; this owns
 * what a token is, when it stops working, and what a voucher note may contain.
 * That is the same split `claim-state.ts` draws, and for the same reason: the
 * rules that decide who ends up owning a collegiate program should be readable
 * and testable without standing up Supabase and a mail provider.
 *
 * ── There is no expiry column, deliberately ─────────────────────────────────
 * Usability is `verification_sent_at + VERIFICATION_TTL_HOURS`, computed here.
 * A stored `verification_expires_at` would be a second column that must agree
 * with the first forever, and the failure when it stops agreeing is silent: a
 * link that works a day past its advertised life, or dies a day early. One
 * column and one constant cannot disagree. (`program_claims` carries five
 * verification columns from `20260915003708_claim_verification_and_admin_indexes.sql`
 * — hash, sent, opened, verified, voucher note — and no expiry among them for
 * exactly this reason.)
 */

/**
 * Seven days.
 *
 * Longer than the 24-hour claim link because the two are asked of different
 * people at different moments. The claim link is clicked by someone mid-setup
 * with the tab still open; this one arrives unannounced, from us, asking a
 * coach to vouch for a colleague — and a coach in season may not open mail for
 * a week. Expressed in hours so `addHours` stays the only date arithmetic this
 * service has.
 */
export const VERIFICATION_TTL_HOURS = 7 * 24;

/**
 * The live CHECK constraint is `char_length(voucher_note) <= 500`
 * (`program_claims_voucher_note_len`). Repeated here so the note is refused
 * with a sentence instead of a raw constraint violation — the database is
 * still the authority, this is only the friendlier half of the same rule.
 */
export const MAX_VOUCHER_NOTE = 500;

export interface MintedVerification {
  /**
   * The raw token. Goes in the email and in the admin's "Copy link" — and
   * nowhere else, ever. Losing it is the intended outcome.
   */
  token: string;
  /** What the row stores. A database dump is then not a set of working links. */
  tokenHash: string;
  /** The instant written to `verification_sent_at`, and the start of the TTL. */
  sentAt: Date;
}

/** Mint one verification link. The caller stores `tokenHash`, mails `token`. */
export function mintVerification(now: Date = new Date()): MintedVerification {
  const token = generateToken();
  return { token, tokenHash: hashToken(token), sentAt: now };
}

/**
 * Hash a token presented in a URL, so it can be looked up.
 *
 * Re-exported under a name rather than having the page import `tokens.ts`
 * directly: this module is the whole vocabulary of a verification link, and a
 * caller reaching past it is how the TTL eventually gets recomputed somewhere
 * with a different constant.
 */
export function hashVerificationToken(token: string): string {
  return hashToken(token);
}

/**
 * Constant-time compare of a presented token against the stored hash.
 *
 * A null hash — never issued, or cleared — is not a match. The lookup itself
 * is by hash equality in Postgres, so this is the belt to that suspenders: it
 * is what a caller uses when it already holds the row.
 */
export function verificationMatches(
  token: string,
  storedHash: string | null | undefined,
): boolean {
  if (!storedHash) return false;
  return tokenMatches(token, storedHash);
}

/** When a link issued at `sentAt` stops working. Null if it was never sent. */
export function verificationExpiresAt(
  sentAt: string | Date | null | undefined,
): Date | null {
  if (!sentAt) return null;
  const from = sentAt instanceof Date ? sentAt : new Date(Date.parse(sentAt));
  if (!Number.isFinite(from.getTime())) return null;
  return addHours(from, VERIFICATION_TTL_HOURS);
}

/**
 * Is this link still good?
 *
 * Never sent, unparseable, or past its seventh day — all one answer, exactly
 * as `isUsable` collapses expired/consumed/unknown in `tokens.ts`. The screen
 * says "that link has expired" either way, because telling a stranger holding
 * a bad token *which* kind of bad it is tells them something about a row.
 *
 * The boundary is exclusive: at exactly `sentAt + 7 days` the link is dead.
 * Postgres would compare the same way against `now()`, and a link that is
 * alive for one extra millisecond is a link with two definitions.
 */
export function verificationIsUsable(
  row: { verificationSentAt: string | Date | null | undefined },
  now: Date = new Date(),
): boolean {
  const expires = verificationExpiresAt(row.verificationSentAt);
  if (!expires) return false;
  return expires.getTime() > now.getTime();
}

/** Where the emailed button and the admin's "Copy link" both point. */
export function verifyIdentityUrl(token: string): string {
  return `${siteUrl()}/claim/verify-identity?token=${encodeURIComponent(token)}`;
}

export type VoucherNote =
  { ok: true; value: string | null } | { ok: false; error: string };

/**
 * What may be written to `voucher_note`.
 *
 * Trimmed, empty collapsed to null — the note is optional, and a row holding
 * `""` reads as "they wrote something" in every query that tests for presence.
 * Over the cap it is refused rather than truncated: silently keeping the first
 * 500 characters of what somebody vouched for is worse than asking them to
 * shorten it themselves.
 */
export function normalizeVoucherNote(
  input: string | null | undefined,
): VoucherNote {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > MAX_VOUCHER_NOTE) {
    return {
      ok: false,
      error: `That note is ${trimmed.length} characters. Please keep it under ${MAX_VOUCHER_NOTE}.`,
    };
  }
  return { ok: true, value: trimmed };
}
