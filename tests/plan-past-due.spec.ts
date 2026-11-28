import { expect, test } from "@playwright/test";

import {
  PAST_DUE_SENTENCE,
  buildCheckoutView,
  checkoutScene,
  fileStepHoursNote,
  initialSelection,
  meterSuffix,
  needsUpgradePreview,
  type CheckoutAccount,
  type CheckoutMode,
} from "@/lib/billing/checkout-view";
import {
  homeCardView,
  planPillView,
  planStandingFor,
  usageCardView,
} from "@/lib/billing/plan-copy";
import type { AllowanceWorkspace } from "@/lib/services/splitstep/allowance";

/**
 * A failed renewal, surface by surface. The plan stays (its name, Verified,
 * everything else) while Stripe retries; the unpaid window carries no plan
 * hours; extra hours still work; and each surface says one true sentence in
 * the slot it already had. The resolver's half is `video-allowance.spec.ts`,
 * Settings › Plan's is `plan-page-view.spec.ts`.
 */

const H = 3600;
const M = 60;
const NOW = new Date("2027-01-30T12:00:00Z");
const TODAY = "2027-01-30";
const SENTENCE =
  "Your last payment failed. Update your card to get this month's hours.";

const COACH: AllowanceWorkspace = {
  kind: "personal",
  orgType: null,
  plan: "coach",
  planPeriodStart: "2027-01-14T00:00:00Z",
};
const PAST_DUE: AllowanceWorkspace = { ...COACH, planStatus: "past_due" };

const standing = (workspace: AllowanceWorkspace) =>
  planStandingFor(workspace, NOW);

test("the sentence is one sentence pair, the same everywhere", () => {
  expect(PAST_DUE_SENTENCE).toBe(SENTENCE);
});

test.describe("standing", () => {
  test("the plan keeps its name; the hours and the reset day are gone", () => {
    expect(standing(PAST_DUE)).toMatchObject({
      scope: "personal",
      kind: "plan",
      name: "Coach",
      capSeconds: 0,
      resetsOn: null,
      pastDue: true,
    });
    expect(standing(COACH)).toMatchObject({
      name: "Coach",
      capSeconds: 5 * H,
      resetsOn: "Feb 14",
      pastDue: false,
    });
  });

  test("a team is never past due", () => {
    expect(
      standing({ kind: "team", orgType: "college", planStatus: "past_due" })
        .pastDue,
    ).toBe(false);
  });
});

test.describe("the header pill", () => {
  test("the tooltip says the payment failed, under the plan's own tag", () => {
    const view = planPillView(standing(PAST_DUE), {
      remainingSeconds: 0,
      capSeconds: 0,
    });
    expect(view).toEqual({
      tag: "Coach",
      figure: { strong: "0h", rest: "left" },
      label: "Payment failed",
      detail: SENTENCE,
      ariaLabel: `Coach: ${SENTENCE}`,
      share: 0,
    });
  });

  test("extra hours are still the figure", () => {
    const view = planPillView(standing(PAST_DUE), {
      remainingSeconds: 0,
      capSeconds: 0,
      creditSeconds: 2 * H,
      nextCreditExpiresAt: "2027-10-16T00:00:00Z",
    });
    expect(view.figure).toEqual({ strong: "2h", rest: "extra" });
    expect(view.detail).toBe(SENTENCE);
    expect(view.share).toBe(1);
  });

  test("it never reads as the Free plan or offers plans", () => {
    const view = planPillView(standing(PAST_DUE), {
      remainingSeconds: 0,
      capSeconds: 0,
    });
    expect(`${view.label} ${view.detail}`).not.toMatch(/Free|see plans/i);
  });
});

test.describe("Home's usage card", () => {
  const card = (creditSeconds = 0) =>
    homeCardView({
      standing: standing(PAST_DUE),
      owner: "Jordan Reyes",
      usedSeconds: 0,
      capSeconds: 0,
      creditSeconds,
      analyzed: 6,
      today: TODAY,
      firstMonthEligible: true,
    });

  test("the card's sentence is the failed payment, and it links to the plan", () => {
    expect(card()).toEqual({
      eyebrow: "Jordan Reyes · Coach",
      figure: "0",
      line1: "hours of match video",
      line2: "left this month",
      sentence: SENTENCE,
      facts: [{ text: "6 matches analyzed" }],
      cta: "See plan",
      href: "/dashboard/settings/plan",
      ariaLabel: "Coach plan: see plan",
    });
  });

  test("extra hours are counted, and the sentence stays", () => {
    const view = card(2 * H);
    expect([view.figure, view.line2, view.sentence]).toEqual([
      "2",
      "left in extra hours",
      SENTENCE,
    ]);
  });

  test("it is not the Free card: no offer, no first-month line", () => {
    const view = card();
    expect(`${view.sentence} ${view.cta}`).not.toMatch(
      /Choose a plan|half off|See plans/,
    );
    expect(view.facts.map((fact) => fact.text).join(" ")).not.toContain("Ask");
  });
});

test.describe("Settings › Usage: the personal card", () => {
  const usage = (creditSeconds = 0) =>
    usageCardView({
      standing: standing(PAST_DUE),
      usedSeconds: 0,
      capSeconds: 0,
      creditSeconds,
      nextCreditExpiresAt: creditSeconds > 0 ? "2027-10-16T00:00:00Z" : null,
      matches: [],
    });

  test("the personal line is the failed payment", () => {
    const view = usage();
    expect(view.line).toBe(SENTENCE);
    expect(view.trailing).toBe("0h left");
    // A subscriber manages a plan; they do not choose one.
    expect(view.link).toEqual({
      label: "Manage on Plan",
      href: "/dashboard/settings/plan",
    });
    expect(view.footnote).toBe("Personal uploads only · Coach plan");
  });

  test("extra hours follow it, with their expiry", () => {
    const view = usage(2 * H);
    expect(view.line).toBe(`${SENTENCE} Extra: 2h · Expires Oct 16, 2027`);
    expect(view.trailing).toBe("2h left");
  });
});

test.describe("the upload wizard", () => {
  const coach = { enabled: true, plan: "coach" } as const;

  test("the file step's note says it, whatever is left and before any video", () => {
    for (const remainingSeconds of [0, 2 * H]) {
      expect(
        fileStepHoursNote({ ...coach, remainingSeconds, pastDue: true }),
      ).toEqual({ kind: "past-due" });
    }
    // It outranks "this video is longer than what's left".
    expect(
      fileStepHoursNote({
        ...coach,
        remainingSeconds: 23 * M,
        videoSeconds: 6720,
        pastDue: true,
      }),
    ).toEqual({ kind: "past-due" });
  });

  test("never for Free, on an unread balance, or where plans are not on", () => {
    expect(
      fileStepHoursNote({
        enabled: true,
        plan: "free",
        remainingSeconds: 0,
        pastDue: true,
      }),
    ).toEqual({ kind: "no-hours" });
    expect(
      fileStepHoursNote({
        ...coach,
        remainingSeconds: undefined,
        pastDue: true,
      }),
    ).toEqual({ kind: "none" });
    expect(
      fileStepHoursNote({
        ...coach,
        enabled: false,
        remainingSeconds: 0,
        pastDue: true,
      }),
    ).toEqual({ kind: "none" });
  });

  test("the footer meter names no reset day", () => {
    expect(
      meterSuffix({ allowanceKind: "plan", resetsOn: null, pastDue: true }),
    ).toBe("payment failed");
    expect(meterSuffix({ allowanceKind: "plan", resetsOn: "Feb 14" })).toBe(
      "resets Feb 14",
    );
  });
});

test.describe("the upload paywall", () => {
  const NEEDED = 1 * H + 52 * M;
  const PAYWALL: CheckoutMode = { kind: "paywall", neededSeconds: NEEDED };
  const account: CheckoutAccount = {
    plan: "coach",
    period: "monthly",
    planLeftSeconds: 0,
    extraSeconds: 0,
    resetsOn: null,
    firstMonthEligible: false,
    pastDue: true,
  };
  const paywall = (who: CheckoutAccount = account) =>
    buildCheckoutView({
      mode: PAYWALL,
      account: who,
      selection: initialSelection(PAYWALL, who),
      sendsAfterPay: true,
    });

  test("no upgrade row and no price asked for; the extra-hours row stays", () => {
    expect(checkoutScene(PAYWALL, account)).toBe("paywall-subscriber");
    // The upgrade is not priced: `/api/billing/upgrade/preview` is not called.
    expect(needsUpgradePreview(PAYWALL, account)).toBe(false);
    expect(needsUpgradePreview(PAYWALL, { ...account, pastDue: false })).toBe(
      true,
    );

    const view = paywall();
    expect(view.rows.map((row) => [row.id, row.name, row.price])).toEqual([
      ["hours", "2 extra hours", "$70"],
    ]);
    expect(view.rows[0].selected).toBe(true);
    expect(view.action).toEqual({ kind: "hours", hours: 2, amountCents: 7000 });
    expect(view.primary).toBe("Pay $70 and send");
    expect(view.band.body).not.toContain("move up");
  });

  test("the aside is the failed payment, with the portal link", () => {
    const view = paywall();
    expect(view.aside).toBe(SENTENCE);
    expect(view.portalLink).toBe(true);
    expect(view.band.offer).toBe("Coach · 0h left this month");
    expect(view.band.offerDetail).toBe("Payment failed");
  });

  test("Coach Pro the same; a paid-up subscriber has no portal link", () => {
    const pro = paywall({ ...account, plan: "coach-pro" });
    expect(pro.aside).toBe(SENTENCE);
    expect(pro.rows.map((row) => row.id)).toEqual(["hours"]);

    const paid = paywall({ ...account, pastDue: false, resetsOn: "Feb 14" });
    expect(paid.portalLink).toBeUndefined();
    expect(paid.aside).toContain("when your hours reset on Feb 14");
  });
});
