import { expect, test } from "@playwright/test";

import { emailOrigin } from "@/lib/site-url";
import {
  programLiveInternalEmail,
  type ProgramLiveInternalInput,
} from "@/lib/services/email";
import { shouldAnnounceProgramLive } from "@/lib/services/notifications/program-live-mail";

/**
 * T2 — the "program went live" internal alert. Offline: the template is pure,
 * and `shouldAnnounceProgramLive` decides from an RPC result alone. Nothing
 * here touches a database or sends anything.
 */

const SITE = "https://app.example.test";

test.beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = SITE;
});

function input(path: "auto" | "reviewed"): ProgramLiveInternalInput {
  return {
    to: "team@advantage-analytics.com",
    programName: "Stanford Women's Tennis",
    claimantName: "Marcus Reid",
    claimantEmail: "marcus@stanford.edu",
    path,
    adminUrl: `${emailOrigin()}/admin`,
  };
}

/* -------------------------------------------------------------------------
 * The template
 * ---------------------------------------------------------------------- */

for (const [path, label] of [
  ["auto", "Auto-approved"],
  ["reviewed", "Approved by an admin"],
] as const) {
  test(`path "${path}": subject, tags, Path fact, CTA and text first line`, () => {
    const msg = programLiveInternalEmail(input(path));

    expect(msg.to).toBe("team@advantage-analytics.com");
    expect(msg.subject).toBe("Stanford Women's Tennis is live");
    expect(msg.tags).toEqual({ type: "program_live", path });
    // Resend rejects anything outside ASCII letters, numbers, `_` and `-`.
    for (const value of Object.values(msg.tags ?? {})) {
      expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    }

    expect(msg.text).toContain(`Path: ${label}`);
    expect(msg.text).toContain("Claimant: Marcus Reid (marcus@stanford.edu)");
    expect(msg.html).toContain(label);

    const adminUrl = `${emailOrigin()}/admin`;
    expect(adminUrl).toBe(`${SITE}/admin`);
    expect(msg.html).toContain(`<a href="${adminUrl}"`);
    expect(msg.text).toContain(`Open admin:\n${adminUrl}`);

    expect(msg.text.split("\n")[0]).toBe("Stanford Women's Tennis is live");
  });
}

/* -------------------------------------------------------------------------
 * shouldAnnounceProgramLive
 * ---------------------------------------------------------------------- */

test("announces a fresh claim that landed live", () => {
  expect(
    shouldAnnounceProgramLive({
      status: "objection_window",
      already_owned: false,
    }),
  ).toBe(true);
  expect(
    shouldAnnounceProgramLive({ status: "approved", already_owned: false }),
  ).toBe(true);
});

test("stays silent for a claim still waiting", () => {
  expect(
    shouldAnnounceProgramLive({
      status: "pending_review",
      already_owned: false,
    }),
  ).toBe(false);
  expect(
    shouldAnnounceProgramLive({
      status: "pending_email",
      already_owned: false,
    }),
  ).toBe(false);
});

test("stays silent on the already-owned branch and on no result", () => {
  expect(
    shouldAnnounceProgramLive({
      status: "objection_window",
      already_owned: true,
    }),
  ).toBe(false);
  expect(shouldAnnounceProgramLive(null)).toBe(false);
});
