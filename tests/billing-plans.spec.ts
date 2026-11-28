import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  ASK_AGENT_QUESTION_WEIGHT,
  ASK_QUESTIONS_PER_MONTH,
  ASK_TEAM_QUESTIONS_PER_MONTH,
  COLLEGE_PLANS,
  EXTRA_HOUR_PRICE,
  EXTRA_HOUR_VALIDITY_MONTHS,
  EXTRA_MATCH_PRICE,
  FIRST_MONTH_DISCOUNT_PERCENT,
  FREE_PLAN_HEADLINE,
  HOURS_PER_MATCH,
  PERSONAL_PLANS,
  PERSONAL_PLAN_AUDIENCE,
  PILOT_LATEST_END,
  PLANS_BEGIN,
  PRIORITY_ADDON_PERCENT,
  RUSH_PRICE,
  RUSH_PRIORITY_COMING_SOON,
  SEASON_DEFAULTS,
  aboutMatches,
  collegePlan,
  defaultSeasonDates,
  extraHourRate,
  firstMonthOffer,
  isCollegePlanId,
  isPersonalPlanId,
  isPlanTerm,
  matchesPhrase,
  personalPlan,
  personalPlanIdFrom,
  planHeadline,
  planHoursLine,
  planHoursShort,
  planSubCopy,
  planHoursSeconds,
  plansBeginMonth,
  plansHaveBegun,
  programPlanFor,
  seasonAllowance,
  springExtendedEnd,
  usd,
} from "@/lib/billing/plans";
import { isPaidPlan, isProPlan, planFor } from "@/lib/user/plan";

/**
 * `src/lib/billing/plans.ts` — every figure the dashboard sells, enforces or
 * prints from 2027, against the final pricing
 * (docs/plans/2027-pricing.md, "Final pricing").
 *
 * The expected values are typed out here on purpose rather than derived: the
 * dashboard and the landing site share no code, so this file is the written
 * record of what was agreed, and a figure changed in the module fails here
 * until this file (and the landing site) change too. Pure — no database, no
 * browser.
 */

test.describe("personal plans", () => {
  test("the three plans: Free, Player and Player Pro", () => {
    expect(PERSONAL_PLANS).toEqual([
      {
        id: "free",
        name: "Free",
        monthly: 0,
        yearly: 0,
        hours: null,
        matches: 0,
        verified: false,
      },
      {
        id: "player",
        name: "Player",
        monthly: 150,
        yearly: 1650,
        hours: 5,
        matches: 3,
        verified: true,
      },
      {
        id: "player-pro",
        name: "Player Pro",
        monthly: 300,
        yearly: 3300,
        hours: 10,
        matches: 6,
        verified: true,
      },
    ]);
    expect(PERSONAL_PLAN_AUDIENCE).toBe("For players and parents.");
  });

  test("each plan is headlined in matches, with its hours underneath", () => {
    expect(FREE_PLAN_HEADLINE).toBe("Free for SwingVision users");
    expect(planHeadline("free")).toBe("Free for SwingVision users");
    expect(planHoursLine("free")).toBeNull();
    expect(planHeadline("player")).toBe("About 3 verified matches a month");
    expect(planHoursLine("player")).toBe("5 hours of match video");
    expect(planHeadline("player-pro")).toBe("About 6 verified matches a month");
    expect(planHoursLine("player-pro")).toBe("10 hours of match video");
    // The checkout dialog's narrower rows drop "of match video".
    expect(planHoursShort("free")).toBeNull();
    expect(planHoursShort("player")).toBe("5 hours");
    expect(planHoursShort("player-pro")).toBe("10 hours");
  });

  test("the full approved sub-copy stays whole for the landing handoff", () => {
    expect(planSubCopy("free")).toBeNull();
    expect(planSubCopy("player")).toBe(
      "5 hours of match video · every match verified",
    );
    expect(planSubCopy("player-pro")).toBe(
      "10 hours of match video · every match verified",
    );
  });

  test("the match counts are stated, not worked out from the hours", () => {
    // 10 hours at 1.8 a match rounds to 6, but 5 hours rounds to 3 only by
    // luck: the card shows what was agreed, whatever the arithmetic says.
    expect(personalPlan("player").matches).toBe(3);
    expect(personalPlan("player-pro").matches).toBe(6);
  });

  test("Free has no video at all: no free match", () => {
    expect(personalPlan("free").hours).toBeNull();
    expect(personalPlan("free").matches).toBe(0);
    expect(planHoursSeconds("free")).toBe(0);
  });

  test("yearly is eleven months' price", () => {
    for (const plan of PERSONAL_PLANS) {
      expect(plan.yearly).toBe(plan.monthly * 11);
    }
  });

  test("monthly hours in seconds", () => {
    expect(planHoursSeconds("player")).toBe(18_000);
    expect(planHoursSeconds("player-pro")).toBe(36_000);
  });

  test("the first-month offer is 30% off the monthly price", () => {
    expect(FIRST_MONTH_DISCOUNT_PERCENT).toBe(30);
    expect(firstMonthOffer()).toBe("30% off your first month");
    const firstMonth = (monthly: number) =>
      (monthly * (100 - FIRST_MONTH_DISCOUNT_PERCENT)) / 100;
    expect(firstMonth(personalPlan("player").monthly)).toBe(105);
    expect(firstMonth(personalPlan("player-pro").monthly)).toBe(210);
  });

  test("plan ids are recognised, anything else is not", () => {
    expect(isPersonalPlanId("player")).toBe(true);
    expect(isPersonalPlanId("player-pro")).toBe(true);
    expect(isPersonalPlanId("pro")).toBe(false);
    expect(isPersonalPlanId(null)).toBe(false);
    // The ids from before the rename are not plans any more.
    expect(isPersonalPlanId("coach")).toBe(false);
    expect(isPersonalPlanId("coach-pro")).toBe(false);
    expect(() => personalPlan("pro" as never)).toThrow();
    expect(() => personalPlan("coach" as never)).toThrow();
  });

  test("a value from outside: the old ids are read as the plans they became", () => {
    expect(personalPlanIdFrom("player")).toBe("player");
    expect(personalPlanIdFrom("player-pro")).toBe("player-pro");
    expect(personalPlanIdFrom("free")).toBe("free");
    expect(personalPlanIdFrom("coach")).toBe("player");
    expect(personalPlanIdFrom("coach-pro")).toBe("player-pro");
    for (const value of [
      "pro",
      "Coach",
      "coach_pro",
      "toString",
      "__proto__",
      "",
      null,
      undefined,
      42,
      ["coach"],
    ]) {
      expect(personalPlanIdFrom(value), String(value)).toBeNull();
    }
  });
});

test.describe("college programs", () => {
  test("the three plans, with their season figures", () => {
    expect(COLLEGE_PLANS).toEqual([
      {
        id: "starter",
        name: "Starter",
        spring: { price: 3000, hours: 80, matches: 45 },
        fullYear: { price: 4800, hours: 130, matches: 70 },
        covers: "Your top courts, every dual",
        rushIncluded: 0,
        priorityHours: null,
        priorityAddon: false,
      },
      {
        id: "program",
        name: "Program",
        spring: { price: 7500, hours: 225, matches: 125 },
        fullYear: { price: 10500, hours: 325, matches: 180 },
        covers: "Nearly every singles match, every dual",
        rushIncluded: 0,
        priorityHours: null,
        priorityAddon: false,
      },
      {
        id: "elite",
        name: "Elite",
        spring: { price: 12000, hours: 400, matches: 220 },
        fullYear: { price: 16500, hours: 550, matches: 305 },
        covers: "Every match, plus fall and practice",
        rushIncluded: 0,
        priorityHours: null,
        priorityAddon: false,
      },
    ]);
  });

  test("seasonAllowance picks the term's figures", () => {
    expect(seasonAllowance("starter", "spring")).toEqual({
      price: 3000,
      hours: 80,
      matches: 45,
    });
    expect(seasonAllowance("program", "full_year")).toEqual({
      price: 10500,
      hours: 325,
      matches: 180,
    });
    expect(seasonAllowance("elite", "spring").hours).toBe(400);
    expect(seasonAllowance("elite", "full_year").price).toBe(16500);
  });

  test("Rush and Priority are in no plan: one coming-soon line", () => {
    for (const plan of COLLEGE_PLANS) {
      expect(plan.rushIncluded, plan.id).toBe(0);
      expect(plan.priorityHours, plan.id).toBeNull();
      expect(plan.priorityAddon, plan.id).toBe(false);
    }
    expect(RUSH_PRIORITY_COMING_SOON).toBe("Rush and Priority: coming soon");
  });

  test("ids and terms are recognised in the database's spelling", () => {
    expect(isCollegePlanId("program")).toBe(true);
    expect(isCollegePlanId("player")).toBe(false);
    expect(isPlanTerm("spring")).toBe(true);
    expect(isPlanTerm("full_year")).toBe(true);
    // The landing site's spelling is not the column's.
    expect(isPlanTerm("full-year")).toBe(false);
    expect(() => collegePlan("gold" as never)).toThrow();
  });

  test("the migration stamps the same rush counts the module holds", () => {
    // The latest definition of `admin_set_program_plan`.
    const sql = readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/20261127060000_plans_2027_final_pricing.sql",
      ),
      "utf8",
    );
    for (const plan of COLLEGE_PLANS) {
      expect(sql).toMatch(
        new RegExp(`when '${plan.id}'\\s+then ${plan.rushIncluded}\\b`),
      );
    }
  });
});

test.describe("rules across plans", () => {
  test("add-on prices and terms", () => {
    expect(HOURS_PER_MATCH).toBe(1.8);
    expect(EXTRA_HOUR_PRICE).toBe(35);
    expect(EXTRA_HOUR_VALIDITY_MONTHS).toBe(12);
    expect(RUSH_PRICE).toBe(25);
    expect(PRIORITY_ADDON_PERCENT).toBe(15);
  });

  test("extra hours: $35 an hour, about $60 a match, both stated", () => {
    expect(EXTRA_MATCH_PRICE).toBe(60);
    expect(extraHourRate()).toBe("$35 an hour (about $60 per extra match)");
  });

  test("Ask limits: a month per person, and one pool a month per team", () => {
    expect(ASK_QUESTIONS_PER_MONTH).toEqual({
      free: 20,
      player: 150,
      "player-pro": 300,
    });
    expect(ASK_TEAM_QUESTIONS_PER_MONTH).toEqual({
      starter: 500,
      program: 1000,
      elite: 2000,
    });
    expect(ASK_AGENT_QUESTION_WEIGHT).toBe(3);
  });

  test("usd writes whole dollars with thousands separators", () => {
    expect(usd(35)).toBe("$35");
    expect(usd(1650)).toBe("$1,650");
    expect(usd(16500)).toBe("$16,500");
  });

  test("aboutMatches estimates at 1.8 hours a match", () => {
    expect(aboutMatches(0)).toBe(0);
    expect(aboutMatches(1)).toBe(1);
    expect(aboutMatches(1.8)).toBe(1);
    expect(aboutMatches(5)).toBe(3);
    expect(aboutMatches(9)).toBe(5);
    expect(aboutMatches(-2)).toBe(0);
  });

  test("matchesPhrase says a half, or whole matches, and nothing under half", () => {
    const H = 3600;
    expect(matchesPhrase(1 * H)).toBe("about half a match");
    expect(matchesPhrase(2 * H)).toBe("about 1 match");
    expect(matchesPhrase(5 * H)).toBe("about 3 matches");
    expect(matchesPhrase(10 * H)).toBe("about 6 matches");
    expect(matchesPhrase(600)).toBeNull();
    expect(matchesPhrase(0)).toBeNull();
    expect(matchesPhrase(-H)).toBeNull();
  });

  test("a row that sells hours counts matches from one whole match up", () => {
    const H = 3600;
    const sold = (hours: number) =>
      matchesPhrase(hours * H, { fromWholeMatch: true });
    // One hour at $35 as "half a match" would say $70 a match, not $60.
    expect(sold(1)).toBeNull();
    expect(sold(2)).toBe("about 1 match");
    expect(sold(5)).toBe("about 3 matches");
    expect(sold(10)).toBe("about 6 matches");
    expect(sold(0)).toBeNull();
  });
});

test.describe("dates", () => {
  test("plans begin at midnight UTC on January 1, 2027", () => {
    expect(PLANS_BEGIN).toBe("2027-01-01");
    expect(plansHaveBegun(new Date("2026-12-31T23:59:59.999Z"))).toBe(false);
    expect(plansHaveBegun(new Date("2027-01-01T00:00:00.000Z"))).toBe(true);
    expect(plansHaveBegun(new Date("2027-06-15T12:00:00Z"))).toBe(true);
    // Still December 31 in UTC, though already January 1 in Sydney.
    expect(plansHaveBegun(new Date("2027-01-01T08:00:00+11:00"))).toBe(false);
    // Already January 1 in UTC, though still December 31 in Los Angeles.
    expect(plansHaveBegun(new Date("2026-12-31T17:00:00-08:00"))).toBe(true);
  });

  test("pilots end by May 31, 2027", () => {
    expect(PILOT_LATEST_END).toBe("2027-05-31");
  });

  test("season defaults", () => {
    expect(SEASON_DEFAULTS).toEqual({
      spring: { starts: "01-01", ends: "05-31", extendableTo: "06-30" },
      full_year: { starts: "08-01", ends: "07-31" },
    });
  });

  test("spring runs January 1 to May 31, extendable to June 30", () => {
    expect(defaultSeasonDates("spring", 2027)).toEqual({
      startsOn: "2027-01-01",
      endsOn: "2027-05-31",
    });
    expect(springExtendedEnd(2027)).toBe("2027-06-30");
  });

  test("a full year runs August 1 to July 31 of the next year", () => {
    expect(defaultSeasonDates("full_year", 2026)).toEqual({
      startsOn: "2026-08-01",
      endsOn: "2027-07-31",
    });
  });

  test("leap years change nothing, and every default is a real day", () => {
    expect(defaultSeasonDates("spring", 2028)).toEqual({
      startsOn: "2028-01-01",
      endsOn: "2028-05-31",
    });
    expect(defaultSeasonDates("full_year", 2027)).toEqual({
      startsOn: "2027-08-01",
      endsOn: "2028-07-31",
    });
    expect(springExtendedEnd(2028)).toBe("2028-06-30");

    for (const year of [2026, 2027, 2028, 2032]) {
      for (const term of ["spring", "full_year"] as const) {
        const { startsOn, endsOn } = defaultSeasonDates(term, year);
        for (const day of [startsOn, endsOn, springExtendedEnd(year)]) {
          // A day that does not exist (Feb 30) would roll over and not
          // round-trip.
          expect(new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10)).toBe(
            day,
          );
        }
        expect(endsOn > startsOn).toBe(true);
      }
    }
  });
});

test.describe("planFor", () => {
  test("a plan on sale reads as itself", () => {
    expect(planFor("free").id).toBe("free");
    expect(planFor("player")).toBe(personalPlan("player"));
    expect(planFor("player-pro")).toBe(personalPlan("player-pro"));
  });

  test("the legacy Lifetime value reads as Free (decision 4)", () => {
    expect(planFor("pro").id).toBe("free");
    expect(isPaidPlan("pro")).toBe(false);
    // The beta's own Settings › Plan still names it until plans go on sale.
    expect(isProPlan("pro")).toBe(true);
  });

  test("unknown, empty and missing values read as Free", () => {
    for (const value of ["gold", "", "Player", "player_pro", null, undefined]) {
      expect(planFor(value).id).toBe("free");
      expect(isPaidPlan(value)).toBe(false);
    }
  });

  test("isPaidPlan is true for the two paid plans only", () => {
    expect(isPaidPlan("player")).toBe(true);
    expect(isPaidPlan("player-pro")).toBe(true);
    expect(isPaidPlan("free")).toBe(false);
  });

  test("the month plans begin is read from PLANS_BEGIN, not typed", () => {
    expect(plansBeginMonth()).toBe("January 2027");
    expect(isProPlan("player")).toBe(false);
    expect(isProPlan(null)).toBe(false);
  });
});

test.describe("programPlanFor", () => {
  test("a team's assigned plan, with its season figures", () => {
    const plan = programPlanFor({
      programPlan: {
        id: "program",
        term: "spring",
        startsOn: "2027-01-01",
        endsOn: "2027-05-31",
      },
    });
    expect(plan).toEqual({
      id: "program",
      term: "spring",
      startsOn: "2027-01-01",
      endsOn: "2027-05-31",
      plan: collegePlan("program"),
      allowance: { price: 7500, hours: 225, matches: 125 },
    });
  });

  test("a full-year plan reads the full-year figures", () => {
    const plan = programPlanFor({
      programPlan: {
        id: "elite",
        term: "full_year",
        startsOn: "2026-08-01",
        endsOn: "2027-07-31",
      },
    });
    expect(plan?.allowance).toEqual({ price: 16500, hours: 550, matches: 305 });
  });

  test("no plan, a personal workspace and an unknown plan are all null", () => {
    expect(programPlanFor({ programPlan: null })).toBeNull();
    expect(programPlanFor({})).toBeNull();
    expect(programPlanFor(null)).toBeNull();
    expect(programPlanFor(undefined)).toBeNull();
    expect(
      programPlanFor({
        programPlan: {
          id: "gold" as never,
          term: "spring",
          startsOn: "2027-01-01",
          endsOn: "2027-05-31",
        },
      }),
    ).toBeNull();
  });
});
