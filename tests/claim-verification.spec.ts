import { expect, test } from "@playwright/test";

import {
  MAX_VOUCHER_NOTE,
  VERIFICATION_TTL_HOURS,
  hashVerificationToken,
  mintVerification,
  normalizeVoucherNote,
  verificationExpiresAt,
  verificationIsUsable,
  verificationMatches,
  verifyIdentityUrl,
} from "../src/lib/services/programs/claim-verification";

/**
 * T16 — the claimant identity verification token, proven in isolation.
 *
 * Pure: no database, no clock it does not pass in, no network. That is the
 * whole reason `claim-verification.ts` holds no I/O — the rules deciding
 * whether a link that can vouch for a program's ownership still works should
 * be checkable without standing up Supabase and a mail provider, exactly as
 * `claim-state.ts` is.
 *
 * Run on demand:  npx playwright test claim-verification
 */

const HOUR = 60 * 60 * 1000;
const TTL_MS = VERIFICATION_TTL_HOURS * HOUR;

test.describe("claim verification — mint, hash, match", () => {
  test("mints a token that matches its own stored hash", () => {
    const { token, tokenHash } = mintVerification();

    expect(token.length).toBeGreaterThan(0);
    // base64url only — it has to survive being pasted out of a mail client.
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verificationMatches(token, tokenHash)).toBe(true);
  });

  test("stores the hash, never the token", () => {
    const { token, tokenHash } = mintVerification();

    // 32 CSPRNG bytes through SHA-256: 64 hex characters, and nothing of the
    // token itself. A database dump is not a set of working links.
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
    expect(hashVerificationToken(token)).toBe(tokenHash);
  });

  test("a different token does not match, and neither does a missing hash", () => {
    const a = mintVerification();
    const b = mintVerification();

    expect(a.token).not.toBe(b.token);
    expect(verificationMatches(a.token, b.tokenHash)).toBe(false);
    expect(verificationMatches(a.token, null)).toBe(false);
    expect(verificationMatches(a.token, undefined)).toBe(false);
    // A stored hash of the wrong length fails closed rather than throwing.
    expect(verificationMatches(a.token, "deadbeef")).toBe(false);
  });

  test("every mint is distinct", () => {
    const tokens = new Set(
      Array.from({ length: 200 }, () => mintVerification().token),
    );
    expect(tokens.size).toBe(200);
  });

  test("the URL carries the raw token, percent-encoded", () => {
    const url = verifyIdentityUrl("a+b/c=d");
    expect(url).toContain("/claim/verify-identity?token=");
    expect(url).toContain(encodeURIComponent("a+b/c=d"));
  });
});

test.describe("claim verification — the 7-day boundary", () => {
  const sentAt = new Date("2026-09-15T00:00:00.000Z");
  const row = { verificationSentAt: sentAt.toISOString() };

  test("the TTL is seven days, and expiry is derived rather than stored", () => {
    expect(VERIFICATION_TTL_HOURS).toBe(7 * 24);
    expect(verificationExpiresAt(sentAt)?.toISOString()).toBe(
      "2026-09-22T00:00:00.000Z",
    );
    // Accepts what PostgREST actually returns — an ISO string — as well as a Date.
    expect(verificationExpiresAt(sentAt.toISOString())?.getTime()).toBe(
      sentAt.getTime() + TTL_MS,
    );
  });

  test("usable on the day it was sent", () => {
    expect(verificationIsUsable(row, sentAt)).toBe(true);
    expect(
      verificationIsUsable(row, new Date(sentAt.getTime() + 6 * 24 * HOUR)),
    ).toBe(true);
  });

  test("usable one millisecond before the boundary", () => {
    expect(
      verificationIsUsable(row, new Date(sentAt.getTime() + TTL_MS - 1)),
    ).toBe(true);
  });

  test("dead AT the boundary — exclusive, like Postgres comparing to now()", () => {
    expect(verificationIsUsable(row, new Date(sentAt.getTime() + TTL_MS))).toBe(
      false,
    );
    expect(
      verificationIsUsable(row, new Date(sentAt.getTime() + TTL_MS + 1)),
    ).toBe(false);
  });

  test("never sent, or unparseable, is not usable", () => {
    expect(verificationIsUsable({ verificationSentAt: null }, sentAt)).toBe(
      false,
    );
    expect(
      verificationIsUsable({ verificationSentAt: undefined }, sentAt),
    ).toBe(false);
    expect(
      verificationIsUsable({ verificationSentAt: "not a date" }, sentAt),
    ).toBe(false);
    expect(verificationExpiresAt(null)).toBeNull();
    expect(verificationExpiresAt("not a date")).toBeNull();
  });

  test("a freshly minted link is usable now and dead a week later", () => {
    const { sentAt: now } = mintVerification();
    const minted = { verificationSentAt: now };

    expect(verificationIsUsable(minted, now)).toBe(true);
    expect(
      verificationIsUsable(minted, new Date(now.getTime() + TTL_MS + 1)),
    ).toBe(false);
  });
});

test.describe("claim verification — the voucher note", () => {
  test("empty and whitespace collapse to null", () => {
    expect(normalizeVoucherNote(undefined)).toEqual({ ok: true, value: null });
    expect(normalizeVoucherNote(null)).toEqual({ ok: true, value: null });
    expect(normalizeVoucherNote("   \n ")).toEqual({ ok: true, value: null });
  });

  test("a note is trimmed and kept", () => {
    expect(normalizeVoucherNote("  I'm the head coach.  ")).toEqual({
      ok: true,
      value: "I'm the head coach.",
    });
  });

  test("exactly the cap is allowed; one over is refused, not truncated", () => {
    const atCap = "x".repeat(MAX_VOUCHER_NOTE);
    expect(normalizeVoucherNote(atCap)).toEqual({ ok: true, value: atCap });

    const over = normalizeVoucherNote("x".repeat(MAX_VOUCHER_NOTE + 1));
    expect(over.ok).toBe(false);
    // Silently keeping the first 500 characters of what somebody vouched for
    // would be worse than asking them to shorten it.
    if (!over.ok) expect(over.error).toContain(String(MAX_VOUCHER_NOTE));
  });

  test("the cap matches the live CHECK constraint", () => {
    // `program_claims_voucher_note_len`: char_length(voucher_note) <= 500.
    expect(MAX_VOUCHER_NOTE).toBe(500);
  });
});
