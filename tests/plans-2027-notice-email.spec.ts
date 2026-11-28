import { expect, test } from "@playwright/test";

import {
  PILOT_NOTICE_APPROVED,
  plans2027NoticeEmail,
  plans2027PilotNoticeEmail,
} from "@/lib/services/email";
import {
  isTestAddress,
  noticeDedupeKey,
  selectNoticeRecipients,
} from "@/lib/services/plans-2027/notice-recipients";
import { plansNoticeShowing } from "@/lib/services/plans-2027/notice-window";

/**
 * Stage 0 of docs/plans/2027-pricing.md — the December notice. Offline: the
 * template and the recipient selection are pure, and nothing here sends.
 *
 * The general notice's copy is the wording Cj approved on 2026-11-26. A
 * failure here means the email changed; get his yes before updating the pin.
 */

const SITE = "https://app.example.test";

test.beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = SITE;
});

test.describe("general notice", () => {
  const msg = () => plans2027NoticeEmail({ to: "player@school.edu" });

  test("subject, preheader, tag", () => {
    const m = msg();
    expect(m.to).toBe("player@school.edu");
    expect(m.subject).toBe("Free beta hours end December 31");
    expect(m.tags).toEqual({ type: "plans_2027_notice" });
    // The preheader is set (the inbox would otherwise preview the eyebrow).
    expect(m.html).toContain(
      "From January 1, a new match needs a plan or extra hours. Everything you&#39;ve uploaded stays.",
    );
  });

  test("eyebrow, heading and the two emphasised spans", () => {
    const html = msg().html;
    expect(html).toContain("PLANS FROM JANUARY 1");
    expect(html).toContain(">Free beta hours end December 31</h1>");
    expect(html).toMatch(
      /<b [^>]*>Everything you&#39;ve already uploaded stays<\/b>/,
    );
    expect(html).toMatch(/<b [^>]*>30% off<\/b>/);
  });

  test("the text part carries the whole approved copy", () => {
    const text = msg().text;
    expect(text.split("\n")[0]).toBe("Free beta hours end December 31");
    expect(text).toContain(
      "From January 1, analyzing a new match needs a plan or extra hours. Everything you've already uploaded stays: your matches, reports and film. SwingVision imports stay free. Your first month of a monthly plan is 30% off.",
    );
    expect(text).toContain("Player: $150 a month · 5h of match video");
    expect(text).toContain("Player Pro: $300 a month · 10h of match video");
    expect(text).toContain("Extra hours: $35 each · last 12 months");
    expect(text).toContain(`Choose a plan:\n${SITE}/dashboard/settings/plan`);
    expect(text).toContain(
      "You're getting this because you have an Advantage account. Nothing is charged until you choose a plan.",
    );
  });

  test("the button goes to Settings › Plan on the email origin", () => {
    expect(msg().html).toContain(`href="${SITE}/dashboard/settings/plan"`);
  });
});

test.describe("pilot notice (draft)", () => {
  test("stays unapproved until Cj says yes", () => {
    expect(PILOT_NOTICE_APPROVED).toBe(false);
  });

  test("names the team and its end date in UTC", () => {
    const m = plans2027PilotNoticeEmail({
      to: "coach@school.edu",
      programName: "Babson College Men's Tennis",
      programId: "p1",
      pilotEndsOn: "2027-03-31",
    });
    expect(m.subject).toBe(
      "Babson College Men's Tennis's pilot continues until Mar 31, 2027",
    );
    expect(m.tags).toEqual({ type: "plans_2027_pilot_notice" });
    expect(m.text).toContain("Pilot ends: Mar 31, 2027");
    expect(m.text).toContain(`${SITE}/dashboard/settings/teams/p1`);
    expect(m.text).toContain("Free beta hours end December 31");
  });
});

test.describe("recipients", () => {
  const PILOT = "pilot-team";
  const base = {
    pilotProgramIds: [PILOT, "missing-team"],
    pilotNoticeReady: true,
    accounts: [
      { id: "u1", email: "a@school.edu", confirmed: true, banned: false },
      { id: "u2", email: "b@school.edu", confirmed: false, banned: false },
      { id: "u3", email: "c@example.com", confirmed: true, banned: false },
      { id: "coach", email: "coach@pilot.edu", confirmed: true, banned: false },
      { id: "player", email: "p@pilot.edu", confirmed: true, banned: false },
      { id: "owner", email: "o@club.com", confirmed: true, banned: false },
      { id: "u7", email: "x@school.edu", confirmed: true, banned: true },
    ],
    memberships: [
      { programId: PILOT, userId: "coach", role: "coach" },
      { programId: PILOT, userId: "player", role: "player" },
    ],
    programs: [
      {
        id: PILOT,
        name: "Pilot U",
        ownerUserId: "coach",
        pilotEndsOn: "2027-03-31",
      },
      { id: "club", name: "Club", ownerUserId: "owner", pilotEndsOn: null },
    ],
  };

  test("pilot coaches get the pilot wording only, once per team", () => {
    const r = selectNoticeRecipients(base);
    expect(r.pilot.map((p) => p.userId)).toEqual(["coach"]);
    expect(r.general.map((g) => g.userId).sort()).toEqual([
      "owner",
      "player",
      "u1",
    ]);
    expect(r.teamOwners.map((o) => o.userId)).toEqual(["owner"]);
    expect(r.missingPilotPrograms).toEqual(["missing-team"]);
    expect(r.skipped.map((s) => [s.userId, s.reason]).sort()).toEqual([
      ["u2", "unconfirmed"],
      ["u3", "test"],
      ["u7", "banned"],
    ]);
  });

  test("a pilot coach whose pilot mail can't go gets the general notice", () => {
    const unapproved = selectNoticeRecipients({
      ...base,
      pilotNoticeReady: false,
    });
    expect(unapproved.pilot).toEqual([]);
    expect(unapproved.pilotHeld.map((p) => p.userId)).toEqual(["coach"]);
    expect(unapproved.general.map((g) => g.userId)).toContain("coach");

    const noEndDate = selectNoticeRecipients({
      ...base,
      programs: base.programs.map((p) => ({ ...p, pilotEndsOn: null })),
    });
    expect(noEndDate.pilot).toEqual([]);
    expect(noEndDate.general.map((g) => g.userId)).toContain("coach");
  });

  test("excluded addresses are skipped as test accounts", () => {
    const r = selectNoticeRecipients({
      ...base,
      excludeEmails: ["A@school.edu"],
    });
    expect(r.general.map((g) => g.userId)).not.toContain("u1");
  });

  test("test domains and dedupe keys", () => {
    expect(isTestAddress("x@sub.example.com")).toBe(true);
    expect(isTestAddress("x@foo.test")).toBe(true);
    expect(isTestAddress("x@ucla.edu")).toBe(false);
    expect(noticeDedupeKey({ userId: "u", email: "e" })).toBe(
      "plans_2027_notice:u",
    );
    expect(
      noticeDedupeKey({
        userId: "u",
        email: "e",
        programId: "p",
        programName: "P",
        pilotEndsOn: null,
      }),
    ).toBe("plans_2027_pilot_notice:p:u");
  });
});

test("the Home strip shows in December 2026 only (UTC)", () => {
  const at = (iso: string) => plansNoticeShowing(new Date(iso));
  expect(at("2026-11-30T23:59:59Z")).toBe(false);
  expect(at("2026-12-01T00:00:00Z")).toBe(true);
  expect(at("2026-12-31T23:59:59Z")).toBe(true);
  expect(at("2027-01-01T00:00:00Z")).toBe(false);
});
