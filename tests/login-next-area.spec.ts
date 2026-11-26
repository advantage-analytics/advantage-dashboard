import { expect, test } from "@playwright/test";
import { loginDestination } from "../src/lib/auth/next-area";

// `login_completed` and `login_failed` say where the sign-in was headed, so a
// lost `?next=` (a labeller signed back in and landed on the personal
// dashboard, 2026-11-26) can be told from a bare visit to `/login`. posthog-js
// strips query strings from captured URLs, so this is the only record of it —
// and it must stay an area: a join link's `next` carries the invite token.

test("the first path segment maps to its area", () => {
  expect(loginDestination("/label")).toEqual({
    next_area: "label",
    has_next: true,
  });
  expect(loginDestination("/label/5f1c2b9e-session")).toEqual({
    next_area: "label",
    has_next: true,
  });
  expect(loginDestination("/dashboard/matches/abc")).toEqual({
    next_area: "dashboard",
    has_next: true,
  });
  expect(loginDestination("/join/tok_abc123").next_area).toBe("join");
  expect(loginDestination("/claim/team/about").next_area).toBe("claim");
  expect(loginDestination("/admin/requests?id=42").next_area).toBe("admin");
  expect(loginDestination("/onboarding").next_area).toBe("onboarding");
  expect(loginDestination("/oauth/consent?authorization_id=x").next_area).toBe(
    "oauth",
  );
});

test("anything else is 'other', never the segment itself", () => {
  expect(loginDestination("/terms-update")).toEqual({
    next_area: "other",
    has_next: true,
  });
  expect(loginDestination("/labelx").next_area).toBe("other");
  expect(loginDestination("/LABEL").next_area).toBe("other");
});

test("no next, or one that is clamped away, is the dashboard fallback", () => {
  const fallback = { next_area: "dashboard", has_next: false };
  expect(loginDestination(null)).toEqual(fallback);
  expect(loginDestination(undefined)).toEqual(fallback);
  expect(loginDestination("")).toEqual(fallback);
  expect(loginDestination("/dashboard")).toEqual(fallback);
  expect(loginDestination("https://evil.example/label")).toEqual(fallback);
  expect(loginDestination("//evil.example/label")).toEqual(fallback);
  expect(loginDestination("/\t/evil.example")).toEqual(fallback);
  expect(loginDestination("javascript:alert(1)")).toEqual(fallback);
});

test("only the two properties leave, and no path, query or token in them", () => {
  const secret = "inv_9f8e7d6c5b4a";
  for (const next of [
    `/join/${secret}`,
    `/label?token=${secret}`,
    `/dashboard?next=/join/${secret}#${secret}`,
    `/${secret}`,
  ]) {
    const props = loginDestination(next);
    expect(Object.keys(props).sort()).toEqual(["has_next", "next_area"]);
    const sent = JSON.stringify(props);
    expect(sent).not.toContain(secret);
    expect(sent).not.toContain("/");
    expect(sent).not.toContain("?");
  }
});
