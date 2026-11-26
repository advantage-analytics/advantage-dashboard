/**
 * What the team-claim flow says about cost — every sentence, on both sides of
 * `PLANS_BEGIN`, in one place a spec can pin (`tests/claim-copy.spec.ts`).
 *
 * Before January 1, 2027 the claim flow speaks for the fall pilot: free
 * through the end of the year, 75 hours a month. From that instant a team has
 * no video hours until it is on a plan, so the flow stops promising any. The
 * one exception is a program an admin has on a RUNNING pilot
 * (`pilotIsRunning()` in `services/splitstep/allowance.ts`): it keeps the
 * pilot's wording wherever the page knows which program it is talking about.
 *
 * Each function takes `onPlans`, the answer to that question
 * (`claimOnPlans()`), and returns the same number of strings either way: the
 * pages swap words, never elements.
 *
 * The plan names and the "from $3,000" come from `COLLEGE_PLANS`; nothing
 * about a plan is typed here. The pilot side keeps the literals the pages
 * held before this module existed.
 *
 * Client-safe and pure: no I/O, no server imports. The date is evaluated by
 * the server component or template that calls this, never in the browser.
 */

import { COLLEGE_PLANS, plansHaveBegun, usd } from "./plans";

/**
 * Whether a claim screen speaks for the paid plans (true) or for the pilot
 * (false): plans have begun and the program is not on a running pilot. A
 * screen that cannot know the program passes nothing for `pilotRunning`.
 */
export function claimOnPlans({
  now = new Date(),
  pilotRunning = false,
}: {
  now?: Date;
  pilotRunning?: boolean;
} = {}): boolean {
  return plansHaveBegun(now) && !pilotRunning;
}

/** `Starter, Program or Elite` — the college plans, as a sentence lists them. */
export function collegePlanNames(): string {
  const names = COLLEGE_PLANS.map((plan) => plan.name);
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/** `$3,000` — the least a college plan costs for the spring. */
export function lowestSpringPrice(): string {
  return usd(Math.min(...COLLEGE_PLANS.map((plan) => plan.spring.price)));
}

/** `Starter, Program or Elite, from $3,000 for the spring` */
function plansFromLine(): string {
  return `${collegePlanNames()}, from ${lowestSpringPrice()} for the spring`;
}

/* ---------- /claim/[programKey] — nobody has set the program up ---------- */

export interface ClaimStatusCopy {
  /** The "What you take on" panel, four rows. */
  takesOn: readonly [string, string, string, string];
  /** How the body sentence ends, after "… invites, upload permissions, ". */
  bodyEnd: string;
  /** The small print under the buttons. */
  micro: string;
}

export function claimStatusCopy(onPlans: boolean): ClaimStatusCopy {
  return {
    takesOn: [
      "Staff and roster access",
      "Who may send video",
      onPlans ? "The team's plan and video hours" : "75 hours a month, shared",
      "Transferable to another coach later",
    ],
    bodyEnd: onPlans ? "the team's video hours." : "the monthly budget.",
    micro: onPlans
      ? `Setting up is free. Video analysis needs a plan: ${plansFromLine()}.`
      : "Free through December 31, 2026. No hardware to buy, no contract, no cost.",
  };
}

/**
 * The claim link's unfurl description (`program-claim-preview.ts`), for a
 * program nobody has set up. `program` is "Stanford Women's Tennis".
 */
export function claimPreviewDescription(
  program: string,
  onPlans: boolean,
): string {
  return onPlans
    ? `Claim ${program} on Advantage: manage staff and roster access, control who sends video, and run the team's plan and video hours. Setting up is free.`
    : `Claim ${program} on Advantage: manage staff and roster access, control who sends video, and share a monthly analysis budget. Free through December 31, 2026.`;
}

/* ---------- /claim/ready — the auto-approved ending ---------- */

/** The "What you have" panel, four rows. */
export function claimReadyItems(
  onPlans: boolean,
): readonly [string, string, string, string] {
  return onPlans
    ? [
        "Your roster, staff and match reports",
        "SwingVision imports, free and unlimited",
        "No video hours until a plan is set up",
        plansFromLine(),
      ]
    : [
        "75 hours of processed video per program per month",
        "Free through December 31, 2026",
        "No hardware to buy, no contract, no cost",
        "Paid plans begin in January 2027",
      ];
}

/* ---------- /claim/team — the college-or-not fork ---------- */

/** The footer note on the fork's "A college program" card. */
export function collegeCardFoot(onPlans: boolean): string {
  return onPlans
    ? "NCAA · NAIA · NJCAA · shared plan hours"
    : "NCAA · NAIA · NJCAA · 75h shared";
}

/* ---------- /claim/team/setup — a club, high school or academy ---------- */

export interface TeamSetupAsideCopy {
  /** "How this differs from a college team", three rows. */
  items: readonly [string, string, string];
  footnote: string;
}

export function teamSetupAsideCopy(onPlans: boolean): TeamSetupAsideCopy {
  return {
    items: [
      "No school to find and no address to confirm",
      "You're the owner the moment you create it",
      onPlans
        ? "Your team is ready right away — nothing is held"
        : "Sending video works right away — nothing is held",
    ],
    footnote: onPlans
      ? "Video analysis needs a plan. Email us to set one up."
      : "Pilot pricing applies.",
  };
}

/* ---------- The two "send this to your coach" screens ---------- */

/**
 * The body under "… isn't on Advantage yet". `request` is
 * `/claim/[programKey]/request` (a listed program, a form below it);
 * `referral` is `/claim/program/referral` (no program, a link to copy).
 */
export function referralBody(
  screen: "request" | "referral",
  onPlans: boolean,
): string {
  if (screen === "request") {
    return onPlans
      ? "Team workspaces are free to set up for collegiate programs, and a coach has to set one up. Send them the link — and leave your name so they can add you the day it goes live."
      : "Team workspaces are free for collegiate programs through the 2026 pilot, and a coach has to set one up. Send them the link — and leave your name so they can add you the day it goes live.";
  }
  return onPlans
    ? "Team workspaces are free to set up for collegiate programs, and a coach has to set one up. Send them this and keep going on your own account."
    : "Team workspaces are free for collegiate programs during the pilot, and a coach has to set one up. Send them this and keep going on your own account.";
}

/* ---------- The terms a claim waits on, named outside the terms screen ---------- */

export interface TermsNamingCopy {
  /** The terms screens' tab title. */
  pageTitle: string;
  /** `/claim/verify/failed`, the `terms-not-accepted` ending. */
  failedHeading: string;
  failedSub: string;
  /** The custom-team setup form, when the hop to the terms screen failed. */
  setupFormRefusal: string;
}

/**
 * `onPlans` here is the date alone on the two screens that cannot know the
 * program (`failed`, the setup form), so after the date they say "the terms"
 * rather than naming a version that may not be the one the coach is shown.
 */
export function termsNamingCopy(onPlans: boolean): TermsNamingCopy {
  return onPlans
    ? {
        pageTitle: "Team terms",
        failedHeading: "Accept the terms first",
        failedSub:
          "Setting up this program waits on the terms. Nothing was created. Open the link from your email again and the terms come up before setup finishes.",
        setupFormRefusal:
          "Something changed with the terms. Try again to see them.",
      }
    : {
        pageTitle: "Pilot terms",
        failedHeading: "Accept the pilot terms first",
        failedSub:
          "Setting up this program waits on the pilot terms. Nothing was created. Open the link from your email again and the terms come up before setup finishes.",
        setupFormRefusal:
          "Something changed with the pilot terms. Try again to see them.",
      };
}

/* ---------- The admin's "come and take it" email ---------- */

/**
 * What `programClaimInviteEmail` may promise about the other side of the
 * link:
 *
 *  - `pilot`  — the program is on the pilot and opens on finish, free;
 *  - `plan`   — it opens on finish, and video waits on a plan;
 *  - `review` — a person checks the claim first.
 */
export type ClaimInviteOpening = "pilot" | "plan" | "review";

/**
 * `approved` is the admin's "start the pilot" switch having landed: the
 * recorded-contact row is in, so the claim approves itself on finish. Before
 * `PLANS_BEGIN` that IS the pilot. From it, an approved claim is on the pilot
 * only when the program's pilot is actually running; otherwise the workspace
 * still opens, with no hours behind it.
 */
export function claimInviteOpening({
  approved,
  pilotRunning,
  now = new Date(),
}: {
  approved: boolean;
  pilotRunning: boolean;
  now?: Date;
}): ClaimInviteOpening {
  if (!approved) return "review";
  if (!plansHaveBegun(now)) return "pilot";
  return pilotRunning ? "pilot" : "plan";
}

/** The email's second paragraph. */
export function claimInviteSentence(opening: ClaimInviteOpening): string {
  switch (opening) {
    case "pilot":
      return "Your program is already on the pilot, so the workspace opens as soon as you finish — there's no wait and nothing to pay.";
    case "plan":
      return "Your workspace opens as soon as you finish. Setting it up is free; video analysis starts once your program is on a plan.";
    case "review":
      return "Once you finish, we'll check the details and open the workspace.";
  }
}
