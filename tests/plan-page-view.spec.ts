import { expect, test } from "@playwright/test";

import type { PlanBilling } from "@/lib/billing/plan-fields";
import {
  buildPlanPage,
  type PlanPageInput,
} from "@/lib/billing/plan-page-view";
import { planHoursSeconds } from "@/lib/billing/plans";
import { UNLIMITED_CAP_SECONDS } from "@/lib/data/usage-format";

/**
 * Settings › Plan once plans are on sale: the Video hours figure and its one
 * line, and which rows the Plan card carries for each plan.
 */

const H = 3600;
const M = 60;

const NEVER: PlanBilling = {
  plan: "free",
  periodStart: null,
  period: null,
  status: null,
  periodEnd: null,
  everSubscribed: false,
};

const ACTIVE: PlanBilling = {
  plan: "coach",
  periodStart: "2027-01-14T08:00:00Z",
  period: "monthly",
  status: "active",
  periodEnd: "2027-02-14T08:00:00Z",
  everSubscribed: true,
};

const FREE: PlanPageInput = {
  plan: "free",
  billing: NEVER,
  allowanceKind: "none",
  capSeconds: 0,
  planLeftSeconds: 0,
  extraSeconds: 0,
  nextExtraExpiresAt: null,
  resetsOn: null,
  freeEnds: "Dec 31, 2026",
};

const COACH: PlanPageInput = {
  plan: "coach",
  billing: ACTIVE,
  allowanceKind: "plan",
  capSeconds: planHoursSeconds("coach"),
  planLeftSeconds: 3 * H + 12 * M,
  extraSeconds: 1 * H,
  nextExtraExpiresAt: "2028-01-05T00:00:00Z",
  resetsOn: "Feb 14",
  freeEnds: "Dec 31, 2026",
};

const rows = (input: PlanPageInput) =>
  buildPlanPage(input).rows.map((row) => [
    row.id,
    row.label,
    row.action?.label,
  ]);

test.describe("Video hours", () => {
  test("a Free player with nothing", () => {
    expect(buildPlanPage(FREE).hours).toEqual({
      figure: "0h",
      unit: "left this month",
      line: "No plan hours or extra hours yet",
    });
  });

  test("a subscriber: the total, then the split and the reset day", () => {
    expect(buildPlanPage(COACH).hours).toEqual({
      figure: "4h 12m",
      unit: "left this month",
      line: "3h 12m of Coach this month + 1h extra · Resets Feb 14",
    });
    expect(buildPlanPage({ ...COACH, extraSeconds: 0 }).hours.line).toBe(
      "3h 12m of Coach this month · Resets Feb 14",
    );
    expect(
      buildPlanPage({ ...COACH, planLeftSeconds: 0, extraSeconds: 0 }).hours,
    ).toMatchObject({
      figure: "0h",
      line: "0h of Coach this month · Resets Feb 14",
    });
  });

  test("a Free player holding extra hours sees them, not a month", () => {
    expect(
      buildPlanPage({
        ...FREE,
        extraSeconds: 2 * H,
        nextExtraExpiresAt: "2028-01-05T00:00:00Z",
      }).hours,
    ).toEqual({
      figure: "2h",
      unit: "left",
      line: "2h of extra hours · Next to expire Jan 5, 2028",
    });
  });

  test("the beta's free hours, while they last, say when they end", () => {
    expect(
      buildPlanPage({
        ...FREE,
        allowanceKind: "beta",
        capSeconds: 2 * H,
        planLeftSeconds: 1 * H + 36 * M,
        resetsOn: "Jan 1",
      }).hours,
    ).toEqual({
      figure: "1h 36m",
      unit: "left this month",
      line: "1h 36m free this month · Free hours end Dec 31, 2026",
    });
  });

  test("an admin has no cap and nothing to buy", () => {
    const page = buildPlanPage({
      ...FREE,
      allowanceKind: "unlimited",
      capSeconds: UNLIMITED_CAP_SECONDS,
    });
    expect(page.hours).toEqual({
      figure: "Unlimited",
      unit: "",
      line: "Admin accounts have no monthly cap.",
    });
    expect(page.rows.map((row) => row.id)).toEqual(["plan"]);
  });
});

test.describe("Plan rows", () => {
  test("Free: choose a plan, or buy hours", () => {
    expect(rows(FREE)).toEqual([
      ["plan", "Free", "Choose a plan"],
      ["extra", "Extra hours", "Buy hours"],
    ]);
    const [plan, extra] = buildPlanPage(FREE).rows;
    expect(plan.description).toBe(
      "20 Ask questions a month · Coach from $150, first month half off",
    );
    expect(plan.action).toEqual({
      kind: "dialog",
      label: "Choose a plan",
      tone: "primary",
      mode: { kind: "choose" },
    });
    expect(extra.description).toBe(
      "$35 an hour · Last 12 months · No plan needed",
    );
    expect(extra.action).toMatchObject({
      tone: "outline",
      mode: { kind: "hours" },
    });
  });

  test("a returning Free player is not promised the first-month offer", () => {
    expect(
      buildPlanPage({
        ...FREE,
        billing: { ...NEVER, status: "canceled", everSubscribed: true },
      }).rows[0].description,
    ).toBe("20 Ask questions a month · Coach from $150 a month");
  });

  test("Coach: upgrade, buy hours, manage billing", () => {
    expect(rows(COACH)).toEqual([
      ["plan", "Coach", "Upgrade to Coach Pro"],
      ["extra", "Extra hours", "Buy hours"],
      ["billing", "Billing", "Manage billing ↗"],
    ]);
    const [plan, extra, billing] = buildPlanPage(COACH).rows;
    expect(plan.pill).toBe("Monthly");
    expect(plan.description).toBe(
      "5 hours of match video a month · Renews Feb 14 at $150",
    );
    expect(plan.action).toMatchObject({
      tone: "primary",
      mode: { kind: "upgrade" },
    });
    expect(extra.description).toBe(
      "$35 an hour · Last 12 months · Used after your plan's hours",
    );
    expect(billing.description).toBe("Card, receipts and cancelling.");
    expect(billing.action).toEqual({
      kind: "portal",
      label: "Manage billing ↗",
      tone: "outline",
    });
  });

  test("Coach Pro has no upgrade", () => {
    const input: PlanPageInput = {
      ...COACH,
      plan: "coach-pro",
      billing: { ...ACTIVE, plan: "coach-pro", period: "yearly" },
      capSeconds: planHoursSeconds("coach-pro"),
    };
    expect(rows(input)).toEqual([
      ["plan", "Coach Pro", undefined],
      ["extra", "Extra hours", "Buy hours"],
      ["billing", "Billing", "Manage billing ↗"],
    ]);
    const [plan] = buildPlanPage(input).rows;
    expect(plan.pill).toBe("Yearly");
    // A yearly renewal is far enough off to need its year.
    expect(plan.description).toBe(
      "10 hours of match video a month · Renews Feb 14, 2027 at $3,300",
    );
  });

  test("a failed payment says so where the renewal date was", () => {
    expect(
      buildPlanPage({
        ...COACH,
        billing: { ...ACTIVE, status: "past_due" },
      }).rows[0].description,
    ).toBe(
      "5 hours of match video a month · Payment failed. Update your card in Manage billing",
    );
  });

  test("no row offers a switch to yearly or a downgrade", () => {
    for (const input of [FREE, COACH]) {
      const labels = buildPlanPage(input).rows.flatMap((row) => [
        row.label,
        row.action?.label ?? "",
      ]);
      expect(labels.join(" ")).not.toMatch(/yearly|downgrade|cancel/i);
    }
  });
});
