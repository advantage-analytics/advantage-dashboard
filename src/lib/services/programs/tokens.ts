import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Claim, invite and review tokens.
 *
 * The raw token goes in exactly one place — the email — and only its SHA-256
 * hash is stored. A database dump is then not a set of working links, which
 * matters more here than for a session token: a claim link decides who owns a
 * collegiate program, and an invite link creates an account inside one.
 *
 * SHA-256 rather than a password hash on purpose. These are 256 bits of CSPRNG
 * output, not something a human chose, so there is no dictionary to attack and
 * nothing for a slow KDF to buy. The threat is a leaked row, and a fast digest
 * defeats that just as completely.
 */

/** 32 bytes. base64url so it survives being pasted out of a mail client. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Compare a presented token against a stored hash.
 *
 * Constant-time. The comparison is over hex digests of fixed length, so
 * `timingSafeEqual` cannot throw on a length mismatch here — but the guard
 * stays because a stored hash that is somehow the wrong length should fail
 * closed rather than crash a route handler.
 */
export function tokenMatches(token: string, storedHash: string): boolean {
  const presented = Buffer.from(hashToken(token), 'utf8');
  const stored = Buffer.from(storedHash, 'utf8');
  if (presented.length !== stored.length) return false;
  return timingSafeEqual(presented, stored);
}

/**
 * Review links live longer than claim links — a person has to find time.
 *
 * In hours, like the claim timings, so `addHours` is the only date arithmetic
 * this service has. There were briefly two adders in sibling files, where
 * `daysFromNow(1)` and `addHours(d, 24)` were the same function twice.
 */
export const REVIEW_TOKEN_TTL_HOURS = 7 * 24;
export const INVITE_TTL_HOURS = 14 * 24;

/**
 * Expired, already used, or unknown — all one answer to the caller.
 *
 * Timestamps arrive as ISO strings, which is what PostgREST returns; there is
 * no path on which a `Date` reaches this.
 */
export function isUsable(
  row: { expiresAt: string | null; consumedAt: string | null },
  now: Date = new Date()
): boolean {
  if (row.consumedAt) return false;
  if (!row.expiresAt) return false;

  const expires = Date.parse(row.expiresAt);
  return Number.isFinite(expires) && expires > now.getTime();
}
