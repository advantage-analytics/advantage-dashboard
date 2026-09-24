import { expect, test } from "@playwright/test";

import { PRODUCTION_REF, isProductionTarget } from "./fixtures/live-db";

/**
 * The live-DB fixture's production check, offline.
 *
 * `HAVE_ENV` and the auth helpers' refusal both rest on `isProductionTarget`,
 * so the cases that decide whether a gate run may write to production are
 * pinned here with made-up keys and no network.
 */

/** An unsigned legacy-style JWT carrying `payload` — enough for a claim read. */
function fakeJwt(payload: Record<string, unknown>): string {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part(payload)}.signature`;
}

const PROD_URL = `https://${PRODUCTION_REF}.supabase.co`;
const BRANCH_URL = "https://abcdefghijklmnopqrst.supabase.co";
const PROD_KEY = fakeJwt({
  iss: "supabase",
  ref: PRODUCTION_REF,
  role: "anon",
});
const BRANCH_KEY = fakeJwt({
  iss: "supabase",
  ref: "abcdefghijklmnopqrst",
  role: "service_role",
});
/** The Supabase CLI's local-stack keys carry no ref at all. */
const LOCAL_KEY = fakeJwt({ iss: "supabase-demo", role: "anon" });

test.describe("isProductionTarget", () => {
  test("the production hostname is production, whatever the key", () => {
    expect(isProductionTarget(PROD_URL, BRANCH_KEY)).toBe(true);
    expect(isProductionTarget(PROD_URL, undefined)).toBe(true);
  });

  test("a branch hostname paired with a prod-ref key is production", () => {
    // `env()` falls back per key to `.env.local`, so this pairing is what a
    // run gets when only the URL is exported.
    expect(isProductionTarget(BRANCH_URL, PROD_KEY)).toBe(true);
    expect(isProductionTarget(BRANCH_URL, BRANCH_KEY, PROD_KEY)).toBe(true);
  });

  test("a branch hostname with branch keys is not production", () => {
    expect(isProductionTarget(BRANCH_URL, BRANCH_KEY, BRANCH_KEY)).toBe(false);
  });

  test("a loopback URL with local keys is not production", () => {
    expect(isProductionTarget("http://127.0.0.1:54321", LOCAL_KEY)).toBe(false);
    expect(isProductionTarget("http://localhost:54321", LOCAL_KEY)).toBe(false);
  });

  test("a non-JWT sb_secret_ key carries no ref and does not throw", () => {
    const secret = `sb_secret_${"x".repeat(31)}`;
    expect(isProductionTarget(BRANCH_URL, secret)).toBe(false);
    expect(isProductionTarget(BRANCH_URL, "sb_publishable_abc.def.ghi")).toBe(
      false,
    );
    expect(isProductionTarget(PROD_URL, secret)).toBe(true);
  });

  test("malformed keys and URLs never throw", () => {
    for (const key of ["", "a.b.c", "a.%%%.c", `x.${"e30"}.y`, "not a key"]) {
      expect(isProductionTarget(BRANCH_URL, key)).toBe(false);
    }
    expect(isProductionTarget("not a url", undefined)).toBe(false);
    expect(isProductionTarget(undefined, undefined)).toBe(false);
  });
});
