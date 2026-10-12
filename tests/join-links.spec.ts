import { expect, test } from "@playwright/test";

import {
  joinHref,
  joinTokenFromPath,
  notNowHref,
  signInThenHref,
  signUpThenHref,
} from "@/lib/services/programs/join-links";

/**
 * The signed-out join page hands off to the auth pages and expects to be
 * handed back. These are the two ends of that round trip: the hrefs it sends
 * people out on, and the reading the auth pages do to tell that a `next` came
 * from a join link.
 */
test.describe("join link round trip through the auth pages", () => {
  test("both ways out carry the join path as next", () => {
    const here = joinHref("abc123");
    expect(signInThenHref(here)).toBe("/login?next=%2Fjoin%2Fabc123");
    expect(signUpThenHref(here)).toBe("/sign-up?next=%2Fjoin%2Fabc123");
  });

  test("a token that needs encoding survives out and back", () => {
    const token = "a b/c+d";
    const href = signUpThenHref(joinHref(token));
    const next = new URL(href, "https://app.invalid").searchParams.get("next");
    expect(next).not.toBeNull();
    expect(joinTokenFromPath(next as string)).toBe(token);
  });
});

test.describe("joinTokenFromPath reads only a join path", () => {
  test("a join path yields its token", () => {
    expect(joinTokenFromPath("/join/abc123")).toBe("abc123");
  });

  test("a decline flag or a hash after the token is not part of it", () => {
    expect(joinTokenFromPath(notNowHref(joinHref("abc123")))).toBe("abc123");
    expect(joinTokenFromPath("/join/abc123#top")).toBe("abc123");
  });

  test("any other path is not a join link", () => {
    expect(joinTokenFromPath("/dashboard")).toBeNull();
    expect(joinTokenFromPath("/join")).toBeNull();
    expect(joinTokenFromPath("/join/")).toBeNull();
    expect(joinTokenFromPath("/invitations/abc123")).toBeNull();
    expect(joinTokenFromPath("/x/join/abc123")).toBeNull();
  });

  test("a malformed escape reads as no token rather than throwing", () => {
    expect(joinTokenFromPath("/join/%E0%A4%A")).toBeNull();
  });
});
