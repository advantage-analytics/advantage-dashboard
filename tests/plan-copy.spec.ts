import { expect, test } from "@playwright/test";

import {
  aboutMatchesPhrase,
  homeCardView,
  planHoursView,
  planPillHref,
  planPillView,
  planStandingFor,
  plansApplyTo,
  seasonEndsFact,
  seasonTitle,
  teamMeterSuffix,
  usageCardView,
} from "@/lib/billing/plan-copy";
import type { AllowanceWorkspace } from "@/lib/services/splitstep/allowance";

/**
 * `src/lib/billing/plan-copy.ts` — what the header pill, Home's usage card,
 * Settings › Usage, a team page's Plan & hours card and the wizard's footer
 * say from January 1, 2027, for every plan and team state. Pure: fixed
 * workspaces and a fixed `now`, no database and no render.
 *
 * The figures in the expected strings are the approved mock's (the Coach
 * example, a spring Program plan, the Georgia pilot); each comes out of the
 * plan module and the allowance resolver, never out of this module.
 */

const H = 3600;
const M = 60;
const NOW = new Date("2027-01-30T12:00:00Z");
const DECEMBER = new Date("2026-12-10T12:00:00Z");
const TODAY = "2027-01-30";
const PROGRAM_ID = "22222222-2222-2222-2222-222222222222";

const FREE: AllowanceWorkspace = {
  kind: "personal",
  orgType: null,
  plan: "free",
};
const COACH: AllowanceWorkspace = {
  kind: "personal",
  orgType: null,
  plan: "coach",
  planPeriodStart: "2027-01-14T00:00:00Z",
};
const COACH_PRO: AllowanceWorkspace = { ...COACH, plan: "coach-pro" };
const ADMIN: AllowanceWorkspace = { ...FREE, unlimitedVideo: true };
const SEASON: AllowanceWorkspace = {
  kind: "team",
  orgType: "college",
  programPlan: {
    id: "program",
    term: "spring",
    startsOn: "2027-01-01",
    endsOn: "2027-05-31",
  },
};
const FULL_YEAR: AllowanceWorkspace = {
  kind: "team",
  orgType: "college",
  programPlan: {
    id: "elite",
    term: "full_year",
    startsOn: "2026-08-01",
    endsOn: "2027-07-31",
  },
};
const PILOT: AllowanceWorkspace = {
  kind: "team",
  orgType: "college",
  pilotEligible: true,
  pilotEndsOn: "2027-05-31",
  pilotEndedAt: null,
};
const NO_PLAN: AllowanceWorkspace = { kind: "team", orgType: "college" };

const standing = (workspace: AllowanceWorkspace, now = NOW) =>
  planStandingFor(workspace, now);

test.describe("when plan wording applies", () => {
  test("a team switches on January 1, not before", () => {
    expect(plansApplyTo({ kind: "team" }, DECEMBER)).toBe(false);
    expect(
      plansApplyTo({ kind: "team" }, new Date("2026-12-31T23:59:59Z")),
    ).toBe(false);
    expect(
      plansApplyTo({ kind: "team" }, new Date("2027-01-01T00:00:00Z")),
    ).toBe(true);
  });

  test("a Free player keeps the beta's UI until January 1", () => {
    expect(plansApplyTo({ kind: "personal", plan: "free" }, DECEMBER)).toBe(
      false,
    );
    expect(plansApplyTo({ kind: "personal", plan: "pro" }, DECEMBER)).toBe(
      false,
    );
    expect(plansApplyTo({ kind: "personal", plan: "free" }, NOW)).toBe(true);
  });

  test("a player who bought a plan in December switches that day", () => {
    expect(plansApplyTo({ kind: "personal", plan: "coach" }, DECEMBER)).toBe(
      true,
    );
    expect(
      plansApplyTo({ kind: "personal", plan: "coach-pro" }, DECEMBER),
    ).toBe(true);
    // A team workspace never reads a person's plan.
    expect(plansApplyTo({ kind: "team", plan: "coach" }, DECEMBER)).toBe(false);
  });
});

test.describe("standing: the tag every surface shares", () => {
  test("a player's is their plan's name", () => {
    expect(standing(FREE).name).toBe("Free");
    expect(standing(COACH).name).toBe("Coach");
    expect(standing(COACH_PRO).name).toBe("Coach Pro");
    // The legacy Lifetime value reads as Free; nothing says "Lifetime".
    expect(standing({ ...FREE, plan: "pro" }).name).toBe("Free");
  });

  test("a team's is its plan, Pilot on a pilot, No plan with neither", () => {
    expect(standing(SEASON)).toMatchObject({
      name: "Program",
      kind: "season",
      period: "season",
    });
    expect(standing(FULL_YEAR).name).toBe("Elite");
    expect(standing(PILOT)).toMatchObject({
      name: "Pilot",
      kind: "pilot",
      period: "month",
      pilotEndsOn: "2027-05-31",
    });
    expect(standing(NO_PLAN)).toMatchObject({ name: "No plan", kind: "none" });
  });

  test("Pilot is only for a pilot that is running", () => {
    // Being a college grants nothing from January 1.
    expect(standing({ kind: "team", orgType: "college" }).name).toBe("No plan");
    // Ended by hand, or past its date: not a pilot team any more.
    expect(
      standing({ ...PILOT, pilotEndedAt: "2027-01-10T00:00:00Z" }).name,
    ).toBe("No plan");
    expect(standing({ ...PILOT, pilotEndsOn: "2027-01-15" }).name).toBe(
      "No plan",
    );
  });

  test("a pilot's end is never past the last day any pilot runs", () => {
    expect(standing({ ...PILOT, pilotEndsOn: "2027-09-30" }).pilotEndsOn).toBe(
      "2027-05-31",
    );
  });

  test("a season plan that has not started yet is not in force", () => {
    const fall: AllowanceWorkspace = {
      kind: "team",
      orgType: "college",
      programPlan: {
        id: "starter",
        term: "full_year",
        startsOn: "2027-08-01",
        endsOn: "2028-07-31",
      },
    };
    expect(standing(fall).name).toBe("No plan");
  });
});

test.describe("seasons", () => {
  test("spring is named Spring with its year and dates", () => {
    expect(seasonTitle(SEASON.programPlan!)).toBe(
      "Spring 2027 · Jan 1 – May 31",
    );
    expect(seasonEndsFact(SEASON.programPlan!)).toBe("Spring, ends May 31");
  });

  test("a full year is a season across two years, never Spring", () => {
    const title = seasonTitle(FULL_YEAR.programPlan!);
    expect(title).toBe("2026–27 season · Aug 1 – Jul 31");
    expect(title).not.toContain("Spring");
    expect(seasonEndsFact(FULL_YEAR.programPlan!)).toBe(
      "Full year, ends Jul 31",
    );
  });

  test("an extended spring prints the date the admin set", () => {
    expect(seasonTitle({ ...SEASON.programPlan!, endsOn: "2027-06-30" })).toBe(
      "Spring 2027 · Jan 1 – Jun 30",
    );
  });
});

test.describe("the header pill", () => {
  test("Free with no hours", () => {
    expect(
      planPillView(standing(FREE), { remainingSeconds: 0, capSeconds: 0 }),
    ).toEqual({
      tag: "Free",
      figure: { strong: "0h", rest: "left" },
      label: "Free plan",
      detail: "No video hours on the Free plan. Click to see plans.",
      ariaLabel: "Free: No video hours on the Free plan. Click to see plans.",
      share: 0,
    });
  });

  test("Free holding extra hours", () => {
    const view = planPillView(standing(FREE), {
      remainingSeconds: 0,
      capSeconds: 0,
      creditSeconds: 2 * H,
      nextCreditExpiresAt: "2027-10-16T00:00:00Z",
    });
    expect(view.figure).toEqual({ strong: "2h", rest: "extra" });
    expect(view.label).toBe("Using your extra hours");
    expect(view.detail).toBe(
      "2h of extra hours left, until Oct 16, 2027. Click for Plan.",
    );
  });

  test("Coach: plan hours left and the real reset date", () => {
    const view = planPillView(standing(COACH), {
      remainingSeconds: 3 * H + 12 * M,
      capSeconds: 5 * H,
    });
    expect(view.tag).toBe("Coach");
    expect(view.figure).toEqual({ strong: "3.2h", rest: "left" });
    expect(view.label).toBe("Coach plan");
    expect(view.detail).toBe(
      "3.2 of 5 plan hours left this month. They reset Feb 14. Click for Plan.",
    );
    expect(view.share).toBeCloseTo(0.64, 2);
  });

  test("Coach with extra hours: the figure is the total, the tooltip the split", () => {
    const view = planPillView(standing(COACH), {
      remainingSeconds: 3 * H + 12 * M,
      capSeconds: 5 * H,
      creditSeconds: 1 * H,
      nextCreditExpiresAt: "2027-10-16T00:00:00Z",
    });
    expect(view.figure).toEqual({ strong: "4.2h", rest: "left" });
    expect(view.label).toBe("4.2h left · 3.2h plan + 1h extra");
    expect(view.detail).toBe(
      "3.2 of 5 plan hours left this month, used first. Your 1h of extra hours last until Oct 16, 2027. Click for Plan.",
    );
  });

  test("Coach running low, then out, then on extra hours", () => {
    const low = planPillView(standing(COACH), {
      remainingSeconds: 48 * M,
      capSeconds: 5 * H,
    });
    expect(low.label).toBe("Running low");
    expect(low.detail).toBe(
      "0.8 of 5 plan hours left. They reset Feb 14, or add extra hours on Plan.",
    );

    const out = planPillView(standing(COACH), {
      remainingSeconds: 0,
      capSeconds: 5 * H,
    });
    expect(out.figure).toEqual({ strong: "Out of hours", rest: "" });
    expect(out.detail).toBe(
      "Your plan hours reset Feb 14. Click to add extra hours.",
    );
    expect(out.share).toBe(0);

    const extra = planPillView(standing(COACH), {
      remainingSeconds: 0,
      capSeconds: 5 * H,
      creditSeconds: 90 * M,
    });
    expect(extra.figure).toEqual({ strong: "1.5h", rest: "extra" });
    expect(extra.detail).toBe(
      "This month's plan hours are used until Feb 14. 1h 30m of extra hours left.",
    );
  });

  test("Coach Pro reads its own ten hours", () => {
    const view = planPillView(standing(COACH_PRO), {
      remainingSeconds: 10 * H,
      capSeconds: 10 * H,
    });
    expect(view.tag).toBe("Coach Pro");
    expect(view.detail).toContain("10 of 10 plan hours left this month.");
  });

  test("a season team says this season and when the season ends", () => {
    const view = planPillView(standing(SEASON), {
      remainingSeconds: 142 * H,
      capSeconds: 200 * H,
    });
    expect(view.tag).toBe("Program");
    expect(view.figure).toEqual({ strong: "142h", rest: "left" });
    expect(view.label).toBe("Program plan · Spring 2027 · Jan 1 – May 31");
    expect(view.detail).toBe(
      "142 of 200 video hours left this season. The season ends May 31.",
    );
    expect(view.detail).not.toContain("month");

    const spent = planPillView(standing(SEASON), {
      remainingSeconds: 0,
      capSeconds: 200 * H,
    });
    expect(spent.detail).toBe(
      "Your team has used its 200 video hours this season. The season ends May 31.",
    );
  });

  test("a pilot team is the only pill that says Pilot", () => {
    const view = planPillView(standing(PILOT), {
      remainingSeconds: 61.5 * H,
      capSeconds: 75 * H,
    });
    expect(view.tag).toBe("Pilot");
    expect(view.label).toBe("Pilot until May 31, 2027");
    expect(view.detail).toBe(
      "61.5 of 75 video hours left this month. They reset on Feb 1.",
    );
  });

  test("a team with neither says No plan and points at its page", () => {
    const view = planPillView(standing(NO_PLAN), {
      remainingSeconds: 0,
      capSeconds: 0,
    });
    expect(view).toMatchObject({
      tag: "No plan",
      figure: { strong: "0h", rest: "left" },
      label: "No plan",
      detail:
        "Your team has no plan or video hours yet. Click for the team's page.",
    });
  });

  test("a team never shows a person's extra hours", () => {
    const view = planPillView(standing(SEASON), {
      remainingSeconds: 10 * H,
      capSeconds: 200 * H,
      creditSeconds: 5 * H,
    });
    expect(view.figure.strong).toBe("10h");
  });

  test("an admin's uncapped workspace", () => {
    const view = planPillView(standing(ADMIN), {
      remainingSeconds: 2_147_483_647,
      capSeconds: 2_147_483_647,
    });
    expect(view.figure.strong).toBe("Unlimited");
  });

  test("no state of the pill says Beta, Lifetime or free", () => {
    const states = [
      planPillView(standing(FREE), { remainingSeconds: 0, capSeconds: 0 }),
      planPillView(standing(COACH), {
        remainingSeconds: 2 * H,
        capSeconds: 5 * H,
        creditSeconds: H,
      }),
      planPillView(standing(SEASON), {
        remainingSeconds: 0,
        capSeconds: 200 * H,
      }),
      planPillView(standing(NO_PLAN), { remainingSeconds: 0, capSeconds: 0 }),
    ];
    for (const view of states) {
      const words = `${view.tag} ${view.label} ${view.detail}`;
      expect(words).not.toMatch(/beta|lifetime|free hours|credits|pilot/i);
    }
  });

  test("it goes to Settings › Plan, or the team's own page", () => {
    expect(planPillHref({ kind: "personal", id: "u1" })).toBe(
      "/dashboard/settings/plan",
    );
    expect(planPillHref({ kind: "team", id: PROGRAM_ID })).toBe(
      `/dashboard/settings/teams/${PROGRAM_ID}`,
    );
  });
});

test.describe("Home's usage card", () => {
  test("Coach, as approved", () => {
    expect(
      homeCardView({
        standing: standing(COACH),
        owner: "Jordan Reyes",
        usedSeconds: 1 * H + 48 * M,
        capSeconds: 5 * H,
        creditSeconds: 1 * H,
        analyzed: 6,
        today: TODAY,
      }),
    ).toEqual({
      eyebrow: "Jordan Reyes · Coach",
      figure: "4",
      line1: "hours of match video",
      line2: "left this month",
      sentence: null,
      facts: [
        { text: "Resets Feb 14" },
        { text: "1h extra" },
        { text: "6 matches analyzed" },
      ],
      cta: "See plan",
      href: "/dashboard/settings/plan",
      ariaLabel: "Coach plan: see plan",
    });
  });

  test("Free: the one sentence and See plans", () => {
    const view = homeCardView({
      standing: standing(FREE),
      owner: "Jordan Reyes",
      usedSeconds: 0,
      capSeconds: 0,
      analyzed: 4,
      today: TODAY,
      firstMonthEligible: true,
    });
    expect(view).toMatchObject({
      eyebrow: "Jordan Reyes · Free",
      figure: "0",
      line1: "hours of match video",
      line2: "on the Free plan",
      sentence:
        "Choose a plan or buy extra hours to analyze your next match. Your first month of a plan is half off.",
      facts: [
        { text: "20 Ask questions a month" },
        { text: "4 matches analyzed" },
      ],
      cta: "See plans",
      href: "/dashboard/settings/plan",
    });
  });

  test("Free does not promise half off to a returning subscriber", () => {
    const view = homeCardView({
      standing: standing(FREE),
      owner: "Jordan Reyes",
      usedSeconds: 0,
      capSeconds: 0,
      analyzed: 1,
      today: TODAY,
      firstMonthEligible: false,
    });
    expect(view.sentence).toBe(
      "Choose a plan or buy extra hours to analyze your next match.",
    );
    expect(view.facts[1]).toEqual({ text: "1 match analyzed" });
  });

  test("a season team: this season, the term's end, days left", () => {
    expect(
      homeCardView({
        standing: standing(SEASON),
        owner: "Northfield University",
        programId: PROGRAM_ID,
        usedSeconds: 58 * H,
        capSeconds: 200 * H,
        analyzed: 31,
        today: TODAY,
      }),
    ).toEqual({
      eyebrow: "Northfield University · Program",
      figure: "142",
      line1: "hours of match video",
      line2: "left this season",
      sentence: null,
      facts: [
        { text: "Spring, ends May 31" },
        { text: "121 days left", optional: true },
        { text: "31 matches analyzed" },
      ],
      cta: "See usage",
      href: `/dashboard/settings/teams/${PROGRAM_ID}`,
      ariaLabel: "Program plan: see usage",
    });
  });

  test("a full-year team never reads Spring", () => {
    const view = homeCardView({
      standing: standing(FULL_YEAR),
      owner: "Northfield University",
      programId: PROGRAM_ID,
      usedSeconds: 90 * H,
      capSeconds: 400 * H,
      analyzed: 52,
      today: TODAY,
    });
    expect(view.facts[0]).toEqual({ text: "Full year, ends Jul 31" });
    expect(JSON.stringify(view)).not.toContain("Spring");
  });

  test("a pilot team, with its own end date", () => {
    const view = homeCardView({
      standing: standing(PILOT),
      owner: "University of Georgia",
      programId: PROGRAM_ID,
      usedSeconds: 13.5 * H,
      capSeconds: 75 * H,
      analyzed: 18,
      today: TODAY,
    });
    expect(view).toMatchObject({
      eyebrow: "University of Georgia · Pilot",
      figure: "61",
      line2: "left this month",
      facts: [
        { text: "Pilot until May 31" },
        { text: "121 days left", optional: true },
        { text: "18 matches analyzed" },
      ],
      cta: "See usage",
    });
  });

  test("a team with no plan says so and links to its page", () => {
    const view = homeCardView({
      standing: standing(NO_PLAN),
      owner: "Northfield University",
      programId: PROGRAM_ID,
      usedSeconds: 0,
      capSeconds: 0,
      analyzed: 12,
      today: TODAY,
    });
    expect(view).toMatchObject({
      eyebrow: "Northfield University · No plan",
      figure: "0",
      line2: "for team uploads",
      sentence:
        "Your team has no plan yet. A plan is set up from your team's page.",
      href: `/dashboard/settings/teams/${PROGRAM_ID}`,
    });
    expect(JSON.stringify(view)).not.toMatch(/pilot/i);
  });

  test("an uncapped account gets a headline, not a figure", () => {
    const view = homeCardView({
      standing: standing(ADMIN),
      owner: "Cj",
      usedSeconds: 0,
      capSeconds: 2_147_483_647,
      analyzed: 3,
      today: TODAY,
    });
    expect(view.figure).toBeNull();
    expect(view.line1).toBe("Unlimited video hours.");
    expect(JSON.stringify(view)).not.toMatch(/while we build|beta/i);
  });
});

test.describe("Settings › Usage: the personal card", () => {
  const MATCHES = [
    {
      id: "m1",
      opponent: "Lucas Moreno",
      date: "2027-01-18T00:00:00Z",
      seconds: 63 * M,
    },
    {
      id: "m2",
      opponent: "Ethan Park",
      date: "2027-01-09T00:00:00Z",
      seconds: 45 * M,
    },
  ];

  test("Coach, as approved", () => {
    expect(
      usageCardView({
        standing: standing(COACH),
        usedSeconds: 1 * H + 48 * M,
        capSeconds: 5 * H,
        creditSeconds: 1 * H,
        nextCreditExpiresAt: "2027-10-16T00:00:00Z",
        matches: MATCHES,
      }),
    ).toEqual({
      trailing: "4h 12m left",
      balance: {
        freeCapSeconds: 5 * H,
        freeLeftSeconds: 3 * H + 12 * M,
        creditSeconds: 1 * H,
      },
      line: "Coach: 3h 12m of 5h this month · Extra: 1h · Expires Oct 16, 2027",
      link: { label: "Manage on Plan", href: "/dashboard/settings/plan" },
      thisMonth: {
        summary: "2 matches",
        rows: [
          { id: "m1", name: "v. Lucas Moreno", date: "Jan 18", seconds: 3780 },
          { id: "m2", name: "v. Ethan Park", date: "Jan 9", seconds: 2700 },
        ],
      },
      footnote:
        "Personal uploads only · Coach hours reset Feb 14 · Extra hours are used after plan hours",
    });
  });

  test("Free, as approved", () => {
    expect(
      usageCardView({
        standing: standing(FREE),
        usedSeconds: 0,
        capSeconds: 0,
        creditSeconds: 0,
        nextCreditExpiresAt: null,
        matches: [],
      }),
    ).toMatchObject({
      trailing: "0h left",
      line: "Plan: none · Extra: none",
      link: { label: "Choose a plan on Plan" },
      thisMonth: { summary: "Nothing analyzed yet", rows: [] },
      footnote: "Personal uploads only · Free plan",
    });
  });

  test("one match reads as one match; a removed one still counts", () => {
    const view = usageCardView({
      standing: standing(COACH),
      usedSeconds: 30 * M,
      capSeconds: 5 * H,
      creditSeconds: 0,
      nextCreditExpiresAt: null,
      matches: [{ id: "row-1", opponent: null, date: null, seconds: 30 * M }],
    });
    expect(view.thisMonth.summary).toBe("1 match");
    expect(view.thisMonth.rows[0]).toEqual({
      id: "row-1",
      name: "A removed match",
      date: "",
      seconds: 1800,
    });
    expect(view.line).toBe("Coach: 4h 30m of 5h this month · Extra: none");
  });

  test("a match's date is its calendar day, not a local moment", () => {
    const view = usageCardView({
      standing: standing(COACH),
      usedSeconds: 0,
      capSeconds: 5 * H,
      creditSeconds: 0,
      nextCreditExpiresAt: null,
      matches: [
        { id: "m", opponent: "A B", date: "2027-01-01T00:00:00Z", seconds: 60 },
      ],
    });
    expect(view.thisMonth.rows[0].date).toBe("Jan 1");
  });

  test("a list that could not be read does not claim nothing was analyzed", () => {
    const view = usageCardView({
      standing: standing(COACH),
      usedSeconds: 2 * H,
      capSeconds: 5 * H,
      creditSeconds: 0,
      nextCreditExpiresAt: null,
      matches: null,
    });
    expect(view.thisMonth).toEqual({
      summary: "Couldn't load this month's matches",
      rows: [],
    });
    // The meter's own figures are still the resolver's.
    expect(view.trailing).toBe("3h left");
  });

  test("an uncapped account has no bar to draw", () => {
    const view = usageCardView({
      standing: standing(ADMIN),
      usedSeconds: 0,
      capSeconds: 2_147_483_647,
      creditSeconds: 0,
      nextCreditExpiresAt: null,
      matches: [],
    });
    expect(view.trailing).toBe("Unlimited");
    expect(view.balance).toBeNull();
    expect(view.footnote).toBe(
      "Personal uploads only · Admin accounts have no monthly cap",
    );
  });
});

test.describe("a team page's Plan & hours card", () => {
  test("a spring season, as approved", () => {
    expect(
      planHoursView({
        standing: standing(SEASON),
        usedSeconds: 58 * H,
        capSeconds: 200 * H,
      }),
    ).toEqual({
      kind: "season",
      trailing: "Spring 2027 · Jan 1 – May 31",
      figure: "142h",
      sub: "left of 200h · about 79 matches",
      balance: {
        freeCapSeconds: 200 * H,
        freeLeftSeconds: 142 * H,
        creditSeconds: 0,
      },
      period: "this season",
      footnoteLead: "To add hours or renew for the fall, email ",
    });
  });

  test("a full year is the 2026–27 season, never Spring", () => {
    const view = planHoursView({
      standing: standing(FULL_YEAR),
      usedSeconds: 90 * H,
      capSeconds: 400 * H,
    });
    expect(view.trailing).toBe("2026–27 season · Aug 1 – Jul 31");
    expect(JSON.stringify(view)).not.toContain("Spring");
  });

  test("a pilot, as approved", () => {
    expect(
      planHoursView({
        standing: standing(PILOT),
        usedSeconds: 13.5 * H,
        capSeconds: 75 * H,
      }),
    ).toMatchObject({
      kind: "pilot",
      trailing: "Pilot · until May 31, 2027",
      figure: "61h 30m",
      sub: "left of 75h this month · resets Feb 1",
      period: "this month",
      footnoteLead: "We'll talk about a season plan before May 31: ",
    });
  });

  test("no plan, as approved", () => {
    expect(
      planHoursView({
        standing: standing(NO_PLAN),
        usedSeconds: 0,
        capSeconds: 0,
      }),
    ).toEqual({
      kind: "none",
      trailing: "No plan this season",
      figure: "0h",
      sub: "for team uploads",
      action: "Set up a plan",
      offer: "Starter, Program or Elite, from $3,000 for the spring",
      footnote:
        "Your roster, matches and reports stay. Plans are set up on a short call.",
    });
  });

  test("the card repeats neither seats nor Verified", () => {
    for (const workspace of [SEASON, FULL_YEAR, PILOT, NO_PLAN]) {
      const words = JSON.stringify(
        planHoursView({
          standing: standing(workspace),
          usedSeconds: 0,
          capSeconds: standing(workspace).capSeconds,
        }),
      );
      expect(words).not.toMatch(/seat|verified/i);
    }
  });
});

test.describe("the wizard's footer suffix for a team", () => {
  test("a season prints its end, a pilot its own end date", () => {
    expect(teamMeterSuffix(standing(SEASON))).toBe("Spring, ends May 31");
    expect(teamMeterSuffix(standing(FULL_YEAR))).toBe("Full year, ends Jul 31");
    expect(teamMeterSuffix(standing(PILOT))).toBe("Pilot ends May 31");
    expect(
      teamMeterSuffix(standing({ ...PILOT, pilotEndsOn: "2027-03-15" })),
    ).toBe("Pilot ends Mar 15");
    expect(teamMeterSuffix(standing(NO_PLAN))).toBe("No plan");
  });

  test("a personal workspace keeps its own suffix", () => {
    expect(teamMeterSuffix(standing(COACH))).toBeNull();
  });
});

test.describe("what a balance covers", () => {
  test("from 1.8 hours a match", () => {
    expect(aboutMatchesPhrase(1 * H)).toBe("about half a match");
    expect(aboutMatchesPhrase(2 * H)).toBe("about 1 match");
    expect(aboutMatchesPhrase(5 * H)).toBe("about 3 matches");
    expect(aboutMatchesPhrase(10 * M)).toBe("less than half a match");
    expect(aboutMatchesPhrase(0)).toBe("less than half a match");
  });
});
