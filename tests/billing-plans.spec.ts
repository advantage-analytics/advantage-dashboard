import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  ASK_AGENT_QUESTION_WEIGHT,
  ASK_QUESTIONS_PER_MONTH,
  COACH_PLANS,
  COLLEGE_PLANS,
  EXTRA_HOUR_PRICE,
  EXTRA_HOUR_VALIDITY_MONTHS,
  FIRST_MONTH_DISCOUNT_PERCENT,
  HOURS_PER_MATCH,
  PILOT_LATEST_END,
  PLANS_BEGIN,
  PRIORITY_ADDON_PERCENT,
  RUSH_PRICE,
  SEASON_DEFAULTS,
  aboutMatches,
  coachPlan,
  collegePlan,
  defaultSeasonDates,
  isCoachPlanId,
  isCollegePlanId,
  isPlanTerm,
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
 * prints from 2027, against the literal the landing site's
 * `advantage-landing/src/lib/plans.ts` holds.
 *
 * The expected values are typed out here on purpose rather than derived: the
 * two repos share no code, so this file is the written record of what was
 * copied, and a figure changed in the module without the landing site
 * changing too fails here. Pure — no database, no browser.
 */

test.describe("players and coaches", () => {
  test("the three plans, with the landing site's prices and hours", () => {
    expect(COACH_PLANS).toEqual([
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
        id: "coach",
        name: "Coach",
        monthly: 150,
        yearly: 1650,
        hours: 5,
        matches: 3,
        verified: true,
      },
      {
        id: "coach-pro",
        name: "Coach Pro",
        monthly: 300,
        yearly: 3300,
        hours: 10,
        matches: 5,
        verified: true,
      },
    ]);
  });

  test("Free has no video at all (decision 2: no free match)", () => {
    expect(coachPlan("free").hours).toBeNull();
    expect(coachPlan("free").matches).toBe(0);
    expect(planHoursSeconds("free")).toBe(0);
  });

  test("yearly is eleven months' price", () => {
    for (const plan of COACH_PLANS) {
      expect(plan.yearly).toBe(plan.monthly * 11);
    }
  });

  test("monthly hours in seconds", () => {
    expect(planHoursSeconds("coach")).toBe(18_000);
    expect(planHoursSeconds("coach-pro")).toBe(36_000);
  });

  test("the first-month offer halves the monthly price", () => {
    expect(FIRST_MONTH_DISCOUNT_PERCENT).toBe(50);
    const firstMonth = (monthly: number) =>
      (monthly * (100 - FIRST_MONTH_DISCOUNT_PERCENT)) / 100;
    expect(firstMonth(coachPlan("coach").monthly)).toBe(75);
    expect(firstMonth(coachPlan("coach-pro").monthly)).toBe(150);
  });

  test("plan ids are recognised, anything else is not", () => {
    expect(isCoachPlanId("coach-pro")).toBe(true);
    expect(isCoachPlanId("pro")).toBe(false);
    expect(isCoachPlanId(null)).toBe(false);
    expect(() => coachPlan("pro" as never)).toThrow();
  });
});

test.describe("college programs", () => {
  test("the three plans, with the landing site's season figures", () => {
    expect(COLLEGE_PLANS).toEqual([
      {
        id: "starter",
        name: "Starter",
        spring: { price: 3000, hours: 80, matches: 45 },
        fullYear: { price: 4800, hours: 130, matches: 70 },
        rushIncluded: 0,
        priorityHours: null,
        priorityAddon: false,
      },
      {
        id: "program",
        name: "Program",
        spring: { price: 7500, hours: 200, matches: 110 },
        fullYear: { price: 10500, hours: 280, matches: 155 },
        rushIncluded: 3,
        priorityHours: null,
        priorityAddon: true,
      },
      {
        id: "elite",
        name: "Elite",
        spring: { price: 11000, hours: 300, matches: 165 },
        fullYear: { price: 15000, hours: 400, matches: 220 },
        rushIncluded: 6,
        priorityHours: 30,
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
      hours: 280,
      matches: 155,
    });
    expect(seasonAllowance("elite", "spring").hours).toBe(300);
    expect(seasonAllowance("elite", "full_year").price).toBe(15000);
  });

  test("ids and terms are recognised in the database's spelling", () => {
    expect(isCollegePlanId("program")).toBe(true);
    expect(isCollegePlanId("coach")).toBe(false);
    expect(isPlanTerm("spring")).toBe(true);
    expect(isPlanTerm("full_year")).toBe(true);
    // The landing site's spelling is not the column's.
    expect(isPlanTerm("full-year")).toBe(false);
    expect(() => collegePlan("gold" as never)).toThrow();
  });

  test("the migration stamps the same rush counts the module holds", () => {
    const sql = readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/20261126060000_plans_2027_plan_model.sql",
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

  test("Ask limits are the working numbers", () => {
    expect(ASK_QUESTIONS_PER_MONTH).toEqual({
      free: 20,
      coach: 150,
      "coach-pro": 300,
      teamMember: 300,
    });
    expect(ASK_AGENT_QUESTION_WEIGHT).toBe(3);
  });

  test("usd writes whole dollars with thousands separators", () => {
    expect(usd(35)).toBe("$35");
    expect(usd(1650)).toBe("$1,650");
    expect(usd(15000)).toBe("$15,000");
  });

  test("aboutMatches estimates at 1.8 hours a match", () => {
    expect(aboutMatches(0)).toBe(0);
    expect(aboutMatches(1)).toBe(1);
    expect(aboutMatches(1.8)).toBe(1);
    expect(aboutMatches(5)).toBe(3);
    expect(aboutMatches(9)).toBe(5);
    expect(aboutMatches(-2)).toBe(0);
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
    expect(planFor("coach")).toBe(coachPlan("coach"));
    expect(planFor("coach-pro")).toBe(coachPlan("coach-pro"));
  });

  test("the legacy Lifetime value reads as Free (decision 4)", () => {
    expect(planFor("pro").id).toBe("free");
    expect(isPaidPlan("pro")).toBe(false);
    // The beta's own Settings › Plan still names it until plans go on sale.
    expect(isProPlan("pro")).toBe(true);
  });

  test("unknown, empty and missing values read as Free", () => {
    for (const value of ["gold", "", "Coach", "coach_pro", null, undefined]) {
      expect(planFor(value).id).toBe("free");
      expect(isPaidPlan(value)).toBe(false);
    }
  });

  test("isPaidPlan is true for the two paid plans only", () => {
    expect(isPaidPlan("coach")).toBe(true);
    expect(isPaidPlan("coach-pro")).toBe(true);
    expect(isPaidPlan("free")).toBe(false);
  });

  test("the month plans begin is read from PLANS_BEGIN, not typed", () => {
    expect(plansBeginMonth()).toBe("January 2027");
    expect(isProPlan("coach")).toBe(false);
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
      allowance: { price: 7500, hours: 200, matches: 110 },
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
    expect(plan?.allowance).toEqual({ price: 15000, hours: 400, matches: 220 });
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
