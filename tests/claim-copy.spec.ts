import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import {
  claimInviteOpening,
  claimInviteSentence,
  claimOnPlans,
  claimPreviewDescription,
  claimReadyItems,
  claimStatusCopy,
  collegeCardFoot,
  collegePlanNames,
  lowestSpringPrice,
  referralBody,
  teamSetupAsideCopy,
  termsNamingCopy,
} from "@/lib/billing/claim-copy";
import { COLLEGE_PLANS, usd } from "@/lib/billing/plans";
import { claimPreview } from "@/lib/data/program-claim-preview";
import { programClaimInviteEmail } from "@/lib/services/email";

/**
 * What the team-claim flow says about cost (`billing/claim-copy.ts`), on both
 * sides of `2027-01-01T00:00:00Z`. Offline: the module is pure and the email
 * template renders without sending.
 *
 * Before the date every sentence is the one the pages held before the module
 * existed, to the character. From it they promise no free hours, except for a
 * program whose pilot is running, which keeps the pilot's.
 */

const BEFORE = new Date("2026-12-31T23:59:59.999Z");
const AFTER = new Date("2027-01-01T00:00:00Z");

const read = (path: string) =>
  readFileSync(resolve(__dirname, "..", path), "utf8");

test.beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.test";
});

/* ---------- which side of the date ---------- */

test("plans' wording starts at the first instant of January 1, 2027 UTC", () => {
  expect(claimOnPlans({ now: BEFORE })).toBe(false);
  expect(claimOnPlans({ now: AFTER })).toBe(true);
});

test("a program on a running pilot keeps the pilot's wording after the date", () => {
  expect(claimOnPlans({ now: AFTER, pilotRunning: true })).toBe(false);
  // A pilot cannot bring the plans' wording forward.
  expect(claimOnPlans({ now: BEFORE, pilotRunning: true })).toBe(false);
  expect(claimOnPlans({ now: BEFORE, pilotRunning: false })).toBe(false);
});

/* ---------- the figures come from the plan module ---------- */

test("the plan names and the lowest spring price are the plan module's", () => {
  expect(collegePlanNames()).toBe("Starter, Program or Elite");
  for (const plan of COLLEGE_PLANS) {
    expect(collegePlanNames()).toContain(plan.name);
  }
  const lowest = Math.min(...COLLEGE_PLANS.map((plan) => plan.spring.price));
  expect(lowestSpringPrice()).toBe(usd(lowest));
  expect(lowestSpringPrice()).toBe("$3,000");
  for (const plan of COLLEGE_PLANS) {
    expect(plan.spring.price).toBeGreaterThanOrEqual(lowest);
  }
});

test("the copy module types no price and no plan name", () => {
  const source = read("src/lib/billing/claim-copy.ts")
    // Comments quote the sentences they describe; only code is checked.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  expect(source).not.toMatch(/\$\d/);
  expect(source).not.toMatch(/3,?000/);
  for (const plan of COLLEGE_PLANS) {
    expect(source).not.toContain(`"${plan.name}`);
    expect(source).not.toMatch(new RegExp(`\\b${plan.name}\\b,`));
  }
});

/* ---------- /claim/[programKey] ---------- */

test("the status page, before the date", () => {
  expect(claimStatusCopy(false)).toEqual({
    takesOn: [
      "Staff and roster access",
      "Who may send video",
      "75 hours a month, shared",
      "Transferable to another coach later",
    ],
    bodyEnd: "the monthly budget.",
    micro:
      "Free through December 31, 2026. No hardware to buy, no contract, no cost.",
  });
});

test("the status page, from January 1", () => {
  expect(claimStatusCopy(true)).toEqual({
    takesOn: [
      "Staff and roster access",
      "Who may send video",
      "The team's plan and video hours",
      "Transferable to another coach later",
    ],
    bodyEnd: "the team's video hours.",
    micro:
      "Setting up is free. Video analysis needs a plan: Starter, Program or Elite, from $3,000 for the spring.",
  });
});

test("the claim link's unfurl description follows the same switch", () => {
  const program = "Stanford Women's Tennis";
  expect(claimPreviewDescription(program, false)).toBe(
    "Claim Stanford Women's Tennis on Advantage: manage staff and roster access, control who sends video, and share a monthly analysis budget. Free through December 31, 2026.",
  );
  expect(claimPreviewDescription(program, true)).toBe(
    "Claim Stanford Women's Tennis on Advantage: manage staff and roster access, control who sends video, and run the team's plan and video hours. Setting up is free.",
  );

  const input = {
    schoolName: "Stanford",
    teamLabel: "Women's",
    status: "unclaimed",
  } as const;
  // Absent reads as the pilot's wording: an old caller changes nothing.
  expect(claimPreview(input).description).toBe(
    claimPreviewDescription(program, false),
  );
  expect(claimPreview({ ...input, onPlans: true }).description).toBe(
    claimPreviewDescription(program, true),
  );
});

/* ---------- /claim/ready ---------- */

test("the ready page's panel, before and from January 1", () => {
  expect(claimReadyItems(false)).toEqual([
    "75 hours of processed video per program per month",
    "Free through December 31, 2026",
    "No hardware to buy, no contract, no cost",
    "Paid plans begin in January 2027",
  ]);
  expect(claimReadyItems(true)).toEqual([
    "Your roster, staff and match reports",
    "SwingVision imports, free and unlimited",
    "No video hours until a plan is set up",
    "Starter, Program or Elite, from $3,000 for the spring",
  ]);
});

/* ---------- /claim/team and /claim/team/setup ---------- */

test("the fork's college card stops saying 75h", () => {
  expect(collegeCardFoot(false)).toBe("NCAA · NAIA · NJCAA · 75h shared");
  expect(collegeCardFoot(true)).toBe("NCAA · NAIA · NJCAA · shared plan hours");
});

test("the custom-team aside, before and from January 1", () => {
  expect(teamSetupAsideCopy(false)).toEqual({
    items: [
      "No school to find and no address to confirm",
      "You're the owner the moment you create it",
      "Sending video works right away — nothing is held",
    ],
    footnote: "Pilot pricing applies.",
  });
  expect(teamSetupAsideCopy(true)).toEqual({
    items: [
      "No school to find and no address to confirm",
      "You're the owner the moment you create it",
      "Your team is ready right away — nothing is held",
    ],
    footnote: "Video analysis needs a plan. Email us to set one up.",
  });
});

/* ---------- the two referral screens ---------- */

test("the referral screens say free to set up, not free", () => {
  expect(referralBody("request", false)).toBe(
    "Team workspaces are free for collegiate programs through the 2026 pilot, and a coach has to set one up. Send them the link — and leave your name so they can add you the day it goes live.",
  );
  expect(referralBody("request", true)).toBe(
    "Team workspaces are free to set up for collegiate programs, and a coach has to set one up. Send them the link — and leave your name so they can add you the day it goes live.",
  );
  expect(referralBody("referral", false)).toBe(
    "Team workspaces are free for collegiate programs during the pilot, and a coach has to set one up. Send them this and keep going on your own account.",
  );
  expect(referralBody("referral", true)).toBe(
    "Team workspaces are free to set up for collegiate programs, and a coach has to set one up. Send them this and keep going on your own account.",
  );
});

/* ---------- how the terms are named off the terms screen ---------- */

test("the terms are called pilot terms only while they are", () => {
  expect(termsNamingCopy(false)).toEqual({
    pageTitle: "Pilot terms",
    failedHeading: "Accept the pilot terms first",
    failedSub:
      "Setting up this program waits on the pilot terms. Nothing was created. Open the link from your email again and the terms come up before setup finishes.",
    setupFormRefusal:
      "Something changed with the pilot terms. Try again to see them.",
  });
  const after = termsNamingCopy(true);
  expect(after.pageTitle).toBe("Team terms");
  expect(after.failedHeading).toBe("Accept the terms first");
  expect(Object.values(after).join("\n")).not.toMatch(/pilot/i);
});

/* ---------- nothing from January 1 promises free hours ---------- */

test("from January 1 no sentence promises the pilot, 75 hours or a free season", () => {
  const status = claimStatusCopy(true);
  const aside = teamSetupAsideCopy(true);
  const all = [
    ...status.takesOn,
    status.bodyEnd,
    status.micro,
    claimPreviewDescription("X", true),
    ...claimReadyItems(true),
    collegeCardFoot(true),
    ...aside.items,
    aside.footnote,
    referralBody("request", true),
    referralBody("referral", true),
    ...Object.values(termsNamingCopy(true)),
    claimInviteSentence("plan"),
  ].join("\n");
  expect(all).not.toMatch(/\b75\b|75h/);
  expect(all).not.toMatch(/December|2026/);
  expect(all).not.toMatch(/pilot/i);
  expect(all).not.toMatch(/no cost|nothing to pay|Free through/i);
});

test("each panel has the same number of rows on both sides of the date", () => {
  expect(claimStatusCopy(true).takesOn).toHaveLength(
    claimStatusCopy(false).takesOn.length,
  );
  expect(claimReadyItems(true)).toHaveLength(claimReadyItems(false).length);
  expect(teamSetupAsideCopy(true).items).toHaveLength(
    teamSetupAsideCopy(false).items.length,
  );
});

/* ---------- the claim pages hold none of it themselves ---------- */

test("the claim pages type no pilot promise of their own", () => {
  for (const path of [
    "src/app/claim/[programKey]/page.tsx",
    "src/app/claim/[programKey]/request/page.tsx",
    "src/app/claim/ready/page.tsx",
    "src/app/claim/team/page.tsx",
    "src/app/claim/team/setup/page.tsx",
    "src/app/claim/program/referral/page.tsx",
    "src/app/claim/verify/failed/page.tsx",
    "src/components/claim/team-kind-choice.tsx",
    "src/lib/data/program-claim-preview.ts",
    "src/lib/services/email/templates/claim.ts",
  ]) {
    const source = read(path)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(source, path).not.toContain("December 31");
    expect(source, path).not.toMatch(/75 ?h/);
    expect(source, path).not.toMatch(/Free through|free for collegiate/);
    expect(source, path).not.toContain("Pilot pricing");
    expect(source, path).not.toContain("nothing to pay");
  }
});

/* ---------- the admin's claim-invite email ---------- */

test("what the invite may promise, on both sides of the date", () => {
  // Not approved on finish: a review, whatever the date or the pilot.
  for (const now of [BEFORE, AFTER]) {
    for (const pilotRunning of [false, true]) {
      expect(claimInviteOpening({ approved: false, pilotRunning, now })).toBe(
        "review",
      );
    }
  }
  // Before the date an approved claim is the pilot, as today.
  expect(
    claimInviteOpening({ approved: true, pilotRunning: false, now: BEFORE }),
  ).toBe("pilot");
  // From it, only a program whose pilot is running.
  expect(
    claimInviteOpening({ approved: true, pilotRunning: true, now: AFTER }),
  ).toBe("pilot");
  expect(
    claimInviteOpening({ approved: true, pilotRunning: false, now: AFTER }),
  ).toBe("plan");
});

test("the invite's three sentences", () => {
  expect(claimInviteSentence("pilot")).toBe(
    "Your program is already on the pilot, so the workspace opens as soon as you finish — there's no wait and nothing to pay.",
  );
  expect(claimInviteSentence("plan")).toBe(
    "Your workspace opens as soon as you finish. Setting it up is free; video analysis starts once your program is on a plan.",
  );
  expect(claimInviteSentence("review")).toBe(
    "Once you finish, we'll check the details and open the workspace.",
  );
});

for (const opening of ["pilot", "plan", "review"] as const) {
  test(`the invite email carries the ${opening} sentence in both parts, and only that one`, () => {
    const message = programClaimInviteEmail({
      to: "coach@stanford.edu",
      programName: "Stanford Women's Tennis",
      programKey: "stanford-womens",
      opening,
    });
    const sentence = claimInviteSentence(opening);
    expect(message.text).toContain(sentence);
    // The HTML part escapes the apostrophes; the unescaped head is enough.
    expect(message.html).toContain(sentence.split("'")[0]);
    for (const other of ["pilot", "plan", "review"] as const) {
      if (other === opening) continue;
      expect(message.text).not.toContain(claimInviteSentence(other));
    }
    // The preheader and subject promise nothing about cost on either side.
    expect(message.subject).toBe(
      "Stanford Women's Tennis is ready for you on Advantage",
    );
    expect(message.html).not.toMatch(/Free through|75 hours/);
  });
}
