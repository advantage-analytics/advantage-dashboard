import { expect, test } from "@playwright/test";

import { authHref, safeNext } from "@/lib/auth/safe-next";

/**
 * `safeNext` is the only thing standing between a `?next=` query value and a
 * navigation. Two callers already lean on it — `/callback` and `/confirm` —
 * and the login form now does too, because a password sign-in navigates
 * client-side and never touches those routes.
 *
 * The cases below are the shapes that reach a redirect target in the wild:
 * an absolute URL, the protocol-relative form that a naive `startsWith("/")`
 * check waves through, the backslash variant that browsers normalise into it,
 * and a scheme that executes rather than navigates.
 */
test.describe("safeNext clamps a hostile destination", () => {
  test("a missing value falls back to the dashboard", () => {
    expect(safeNext(null)).toBe("/dashboard");
  });

  test("an absolute URL to another origin is refused", () => {
    expect(safeNext("https://evil.com")).toBe("/dashboard");
  });

  test("a protocol-relative URL is refused", () => {
    // Passes any `startsWith("/")` test, then loads evil.com over the current
    // page's scheme. This is the one that gets shipped by accident.
    expect(safeNext("//evil.com")).toBe("/dashboard");
  });

  test("a backslash-prefixed URL is refused", () => {
    // Browsers treat `/\` as `//` in a special scheme, so this is the same
    // attack wearing a character that a `//` blocklist does not match.
    expect(safeNext("/\\evil.com")).toBe("/dashboard");
  });

  test("a javascript: URL is refused", () => {
    expect(safeNext("javascript:alert(1)")).toBe("/dashboard");
  });
});

test.describe("safeNext preserves a legitimate destination", () => {
  test("an invite path keeps its query string", () => {
    // The invite flow's whole point: land on the token page, not the
    // dashboard, and carry the page's own params through untouched.
    expect(safeNext("/join/abc?not-now=1")).toBe("/join/abc?not-now=1");
  });
});

/**
 * `/login`, `/sign-up` and `/sign-up-success` link to each other. A `next` that
 * arrived on one has to survive the hop, or "Create an account" on a sign-in
 * that came from a join link makes the account and strands it on the dashboard.
 */
test.describe("authHref carries the return address between auth pages", () => {
  test("no destination, or the default one, leaves the link bare", () => {
    expect(authHref("/sign-up", null)).toBe("/sign-up");
    expect(authHref("/sign-up", undefined)).toBe("/sign-up");
    expect(authHref("/login", "/dashboard")).toBe("/login");
  });

  test("a join link is carried, encoded", () => {
    expect(authHref("/sign-up", "/join/abc123")).toBe(
      "/sign-up?next=%2Fjoin%2Fabc123",
    );
    expect(authHref("/login", "/join/abc123?not-now=1")).toBe(
      "/login?next=%2Fjoin%2Fabc123%3Fnot-now%3D1",
    );
  });

  test("a hostile destination is clamped before it is carried", () => {
    expect(authHref("/sign-up", "https://evil.com")).toBe("/sign-up");
    expect(authHref("/sign-up", "//evil.com")).toBe("/sign-up");
  });
});
