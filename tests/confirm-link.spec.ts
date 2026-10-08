import { expect, test } from "@playwright/test";

import { parseConfirmLink } from "@/lib/auth/confirm-link";

/**
 * `parseConfirmLink` is the one reading of an auth email link's query, shared
 * by the `/confirm` page (which only renders) and its action (which signs in).
 * Both must agree on what a link carries, or a page that showed a button
 * could post a form the action turns away.
 */
test.describe("parseConfirmLink reads the link the auth mail carries", () => {
  test("a token_hash link keeps its type and destination", () => {
    const link = parseConfirmLink(
      new URLSearchParams(
        "token_hash=abc123&type=magiclink&next=/claim/verify",
      ),
    );
    expect(link).toEqual({
      kind: "token_hash",
      tokenHash: "abc123",
      type: "magiclink",
      next: "/claim/verify",
    });
  });

  test("a code link is the PKCE exchange", () => {
    const link = parseConfirmLink(
      new URLSearchParams("code=xyz&next=/dashboard"),
    );
    expect(link).toEqual({ kind: "code", code: "xyz", next: "/dashboard" });
  });

  test("a missing destination lands on the dashboard", () => {
    const link = parseConfirmLink(
      new URLSearchParams("token_hash=abc123&type=email"),
    );
    expect(link).toMatchObject({ kind: "token_hash", next: "/dashboard" });
  });

  test("a hostile destination is clamped to this origin", () => {
    const link = parseConfirmLink(
      new URLSearchParams("token_hash=abc123&type=email&next=//evil.com"),
    );
    expect(link).toMatchObject({ next: "/dashboard" });
  });

  test("a token_hash without a type is not a link", () => {
    expect(parseConfirmLink(new URLSearchParams("token_hash=abc123"))).toEqual({
      kind: "missing",
    });
  });

  test("a type GoTrue does not know is not a link", () => {
    // A mail scanner's mangled copy: `type=magicl`. Refused here rather than
    // forwarded for GoTrue to reject with a 400.
    expect(
      parseConfirmLink(new URLSearchParams("token_hash=abc123&type=magicl")),
    ).toEqual({ kind: "missing" });
  });

  test("nothing at all is not a link", () => {
    expect(parseConfirmLink(new URLSearchParams(""))).toEqual({
      kind: "missing",
    });
  });
});
