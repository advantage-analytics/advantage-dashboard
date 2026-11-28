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
  plan: "player",
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

const PLAYER: PlanPageInput = {
  plan: "player",
  billing: ACTIVE,
  allowanceKind: "plan",
  capSeconds: planHoursSeconds("player"),
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
    expect(buildPlanPage(PLAYER).hours).toEqual({
      figure: "4h 12m",
      unit: "left this month",
      line: "3h 12m of Player this month + 1h extra · Resets Feb 14",
    });
    expect(buildPlanPage({ ...PLAYER, extraSeconds: 0 }).hours.line).toBe(
      "3h 12m of Player this month · Resets Feb 14",
    );
    expect(
      buildPlanPage({ ...PLAYER, planLeftSeconds: 0, extraSeconds: 0 }).hours,
    ).toMatchObject({
      figure: "0h",
      line: "0h of Player this month · Resets Feb 14",
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
      "Free for SwingVision users · 20 Ask questions a month · Player from $150, 30% off your first month",
    );
    expect(plan.action).toEqual({
      kind: "dialog",
      label: "Choose a plan",
      tone: "primary",
      mode: { kind: "choose" },
    });
    expect(extra.description).toBe(
      "$35 an hour (about $60 per extra match) · Last 12 months · No plan needed",
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
    ).toBe(
      "Free for SwingVision users · 20 Ask questions a month · Player from $150 a month",
    );
  });

  test("Player: upgrade, buy hours, manage billing", () => {
    expect(rows(PLAYER)).toEqual([
      ["plan", "Player", "Upgrade to Player Pro"],
      ["yearly", "Pay yearly", "Switch to yearly"],
      ["extra", "Extra hours", "Buy hours"],
      ["billing", "Billing", "Manage billing ↗"],
    ]);
    const [plan, , extra, billing] = buildPlanPage(PLAYER).rows;
    expect(plan.pill).toBe("Monthly");
    expect(plan.description).toBe(
      "About 3 verified matches a month · 5 hours of match video · every match verified · Renews Feb 14 at $150",
    );
    expect(plan.action).toMatchObject({
      tone: "primary",
      mode: { kind: "upgrade" },
    });
    expect(extra.description).toBe(
      "$35 an hour (about $60 per extra match) · Last 12 months · Used after your plan's hours",
    );
    expect(billing.description).toBe("Card, receipts and cancelling.");
    expect(billing.action).toEqual({
      kind: "portal",
      label: "Manage billing ↗",
      tone: "outline",
    });
  });

  test("Player Pro has no upgrade", () => {
    const input: PlanPageInput = {
      ...PLAYER,
      plan: "player-pro",
      billing: { ...ACTIVE, plan: "player-pro", period: "yearly" },
      capSeconds: planHoursSeconds("player-pro"),
    };
    expect(rows(input)).toEqual([
      ["plan", "Player Pro", undefined],
      ["extra", "Extra hours", "Buy hours"],
      ["billing", "Billing", "Manage billing ↗"],
    ]);
    const [plan] = buildPlanPage(input).rows;
    expect(plan.pill).toBe("Yearly");
    // A yearly renewal is far enough off to need its year.
    expect(plan.description).toBe(
      "About 6 verified matches a month · 10 hours of match video · every match verified · Renews Feb 14, 2027 at $3,300",
    );
  });

  test("Pay yearly: a monthly subscriber's own plan, a year at a time", () => {
    const yearly = buildPlanPage(PLAYER).rows[1];
    expect(yearly).toEqual({
      id: "yearly",
      label: "Pay yearly",
      description: "$1,650 a year. One month free.",
      action: {
        kind: "dialog",
        label: "Switch to yearly",
        tone: "outline",
        mode: { kind: "yearly" },
      },
    });
    // Player Pro's own figure, from the plan module.
    const pro: PlanPageInput = {
      ...PLAYER,
      plan: "player-pro",
      billing: { ...ACTIVE, plan: "player-pro" },
    };
    expect(rows(pro)).toEqual([
      ["plan", "Player Pro", undefined],
      ["yearly", "Pay yearly", "Switch to yearly"],
      ["extra", "Extra hours", "Buy hours"],
      ["billing", "Billing", "Manage billing ↗"],
    ]);
    expect(buildPlanPage(pro).rows[1].description).toBe(
      "$3,300 a year. One month free.",
    );
    // Nobody already paying yearly, and nobody without a plan.
    for (const input of [
      FREE,
      { ...PLAYER, billing: { ...ACTIVE, period: "yearly" as const } },
      { ...PLAYER, billing: { ...ACTIVE, period: null } },
    ]) {
      expect(rows(input).map(([id]) => id)).not.toContain("yearly");
    }
  });

  test("a failed payment: the plan stays, the row says so and its action is Update card", () => {
    const pastDue: PlanPageInput = {
      ...PLAYER,
      billing: { ...ACTIVE, status: "past_due" },
      // What the resolver answers for the unpaid window.
      capSeconds: 0,
      planLeftSeconds: 0,
      resetsOn: null,
    };
    const view = buildPlanPage(pastDue);
    // No upgrade and no Pay yearly until the card is fixed.
    expect(rows(pastDue)).toEqual([
      ["plan", "Player", "Update card"],
      ["extra", "Extra hours", "Buy hours"],
      ["billing", "Billing", "Manage billing ↗"],
    ]);
    const [plan] = view.rows;
    expect(plan.pill).toBe("Monthly");
    expect(plan.description).toBe(
      "Payment failed. Update your card to get this month's hours.",
    );
    // The same portal call Manage billing makes.
    expect(plan.action).toEqual({
      kind: "portal",
      label: "Update card",
      tone: "primary",
    });
    // The Video hours line says the same where the reset day was; the extra
    // hour is still theirs to spend.
    expect(view.hours).toEqual({
      figure: "1h",
      unit: "left this month",
      line: "Payment failed. Update your card to get this month's hours.",
    });
    // Player Pro the same, with no upgrade to lose.
    expect(
      rows({
        ...pastDue,
        plan: "player-pro",
        billing: { ...ACTIVE, plan: "player-pro", status: "past_due" },
      })[0],
    ).toEqual(["plan", "Player Pro", "Update card"]);
    // A Free account whose old subscription ended past due is just Free.
    expect(
      rows({ ...FREE, billing: { ...NEVER, status: "past_due" } })[0],
    ).toEqual(["plan", "Free", "Choose a plan"]);
  });

  test("the real page offers no downgrade and nothing at renewal", () => {
    for (const input of [FREE, PLAYER]) {
      const view = buildPlanPage(input);
      const labels = view.rows.flatMap((row) => [
        row.label,
        row.description,
        row.action?.label ?? "",
      ]);
      expect(labels.join(" ")).not.toMatch(
        /downgrade|change plan|move down|moves to|keep player/i,
      );
      // Nothing but the two real kinds of action: a dialog, or the portal.
      for (const row of view.rows) {
        expect(["dialog", "portal", undefined]).toContain(row.action?.kind);
        if (row.action?.kind === "dialog") {
          expect(row.action.mode.kind).not.toBe("change");
        }
      }
    }
  });

  test("MOCK: a change at renewal is drawn only from the mock field", () => {
    const pro: PlanPageInput = {
      ...PLAYER,
      plan: "player-pro",
      billing: { ...ACTIVE, plan: "player-pro" },
    };
    const change = {
      to: { plan: "player", period: "monthly" },
      effectiveOn: "2027-02-14",
    } as const;

    const offered = buildPlanPage({
      ...pro,
      mock: { kind: "change-plan", change },
    }).rows[0];
    expect(offered.description).toBe(
      "About 6 verified matches a month · 10 hours of match video · every match verified · Renews Feb 14 at $300",
    );
    expect(offered.action).toEqual({
      kind: "quiet",
      label: "Change plan",
      mode: { kind: "change", change },
    });

    const scheduled = buildPlanPage({
      ...pro,
      mock: { kind: "scheduled", change },
    });
    expect(scheduled.rows[0].description).toBe("Moves to Player on Feb 14");
    expect(scheduled.rows[0].action).toEqual({
      kind: "quiet",
      label: "Keep Player Pro",
    });
    // A plan on its way down is not also offered a year.
    expect(scheduled.rows.map((row) => row.id)).toEqual([
      "plan",
      "extra",
      "billing",
    ]);
  });
});
