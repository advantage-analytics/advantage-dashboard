import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  CheckoutAccount,
  CheckoutMode,
  PreviewState,
} from "@/lib/billing/checkout-view";
import { planHoursSeconds } from "@/lib/billing/plans";
import { quoteUpgrade } from "@/lib/billing/upgrade";
import { createLoader } from "./fixtures/vm-modules";

/**
 * `PlanCheckoutDialog` drawn offline, once per entry point. Radix portals
 * draw nothing in a static render, so its parts are swapped for plain
 * elements; the band, the rows, the aside and the footer are the real ones.
 * What the rows SAY is `plan-checkout-view.spec.ts`'s; this holds the
 * dialog to drawing them — the struck price, the pill, the one primary.
 */

const el = React.createElement;
const part =
  (tag: string, name: string) =>
  ({
    children,
    className,
    hidden,
    "aria-label": label,
  }: {
    children?: React.ReactNode;
    className?: string;
    hidden?: boolean;
    "aria-label"?: string;
  }) =>
    el(
      tag,
      { "data-part": name, className, hidden, "aria-label": label },
      children,
    );
const pass = ({ children }: { children?: React.ReactNode }) =>
  el(React.Fragment, null, children);

const stubs = {
  "@radix-ui/react-dialog": {
    Root: pass,
    Portal: pass,
    Overlay: () => null,
    Content: part("div", "content"),
    Title: part("h2", "title"),
    Description: part("p", "description"),
    Close: part("button", "close"),
  },
  "next/image": {
    __esModule: true,
    default: () => el("i", { "data-logo": "" }),
  },
  // Stripe's frame is fetched only once Pay is pressed.
  "next/dynamic": {
    __esModule: true,
    default: () => () => el("div", { "data-stripe": "" }),
  },
  "@/components/ui/live-dots": { LiveDots: () => null },
};

const { PlanCheckoutDialog } = createLoader({ stubs }).load(
  "src/components/dashboard/billing/plan-checkout-dialog.tsx",
) as {
  PlanCheckoutDialog: React.ComponentType<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: CheckoutMode;
    account: CheckoutAccount;
    onDone: () => void;
    onShortenTrim?: () => void;
    sendsAfterPay?: boolean;
    paymentPending?: boolean;
    preview?: PreviewState;
    refusal?: string;
  }>;
};

const noop = () => {};
const H = 3600;
const M = 60;

const FREE: CheckoutAccount = {
  plan: "free",
  period: null,
  planLeftSeconds: 0,
  extraSeconds: 0,
  resetsOn: null,
  firstMonthEligible: true,
};
const COACH: CheckoutAccount = {
  plan: "coach",
  period: "monthly",
  planLeftSeconds: 3 * H + 12 * M,
  extraSeconds: 1 * H,
  resetsOn: "May 14",
  firstMonthEligible: false,
};
const COACH_SPENT: CheckoutAccount = {
  ...COACH,
  planLeftSeconds: 23 * M,
  extraSeconds: 0,
};

function preview(planLeftSeconds: number): PreviewState {
  return {
    status: "ready",
    preview: {
      ...quoteUpgrade({
        from: "coach",
        to: "coach-pro",
        period: "monthly",
        periodStart: new Date("2027-04-14T00:00:00Z"),
        periodEnd: new Date("2027-05-14T00:00:00Z"),
        now: new Date("2027-04-29T00:00:00Z"),
        usedSeconds: planHoursSeconds("coach") - planLeftSeconds,
      }),
      period: "monthly",
    },
  };
}

function draw(
  mode: CheckoutMode,
  account: CheckoutAccount,
  extra: {
    preview?: PreviewState;
    refusal?: string;
    wizard?: boolean;
    paymentPending?: boolean;
  } = {},
): string {
  return renderToStaticMarkup(
    el(PlanCheckoutDialog, {
      open: true,
      onOpenChange: noop,
      mode,
      account,
      onDone: noop,
      preview: extra.preview,
      refusal: extra.refusal,
      sendsAfterPay: extra.wizard,
      onShortenTrim: extra.wizard ? noop : undefined,
      paymentPending: extra.paymentPending,
    }),
  )
    .replace(/<!-- -->/g, "")
    .replace(/&#x27;/g, "'");
}

/** The text of every element matching a tag, in order. */
function texts(html: string, pattern: RegExp): string[] {
  return [...html.matchAll(pattern)].map((match) =>
    match[1].replace(/<[^>]+>/g, "").trim(),
  );
}
const radios = (html: string) =>
  texts(html, /<button[^>]*role="radio"[^>]*>(.*?)<\/button>/g);
const primary = (html: string) =>
  texts(
    html,
    /<button(?![^>]*role="radio")[^>]*type="button"[^>]*>(.*?)<\/button>/g,
  );
const NEEDED: CheckoutMode = { kind: "paywall", neededSeconds: 1 * H + 52 * M };

test("Choose a plan: the band, the pills, both plans with the full price struck through", () => {
  const html = draw({ kind: "choose" }, FREE);
  expect(texts(html, /<h2[^>]*>(.*?)<\/h2>/g)).toEqual(["Start Coach."]);
  // The figure carries full white and never wraps; the words step back.
  expect(html).toContain(
    '<span class="whitespace-nowrap text-white tabular-nums">Coach</span>',
  );
  expect(html).toContain("Half off your first month");
  expect(html).toContain("$75 today, then $150 a month");
  expect(radios(html)).toEqual([
    "Monthly",
    "Yearly · 1 month free",
    "Coach5h a month, about 3 matches$150$75then $150 a month",
    "Coach Pro10h a month, about 5 matches$300$150then $300 a month",
  ]);
  expect(texts(html, /<s [^>]*>(.*?)<\/s>/g)).toEqual(["$150", "$300"]);
  expect(html).toContain("Not now");
  expect(primary(html)).toEqual(["Continue to pay $75"]);
  expect(html).toContain("See a sample report");
});

test("Upload paywall, Free: the two plans, then extra hours for just this match", () => {
  const html = draw(NEEDED, FREE, { wizard: true });
  expect(texts(html, /<h2[^>]*>(.*?)<\/h2>/g)).toEqual([
    "This match needs 1h 52m.",
  ]);
  expect(radios(html)).toEqual([
    "Coach5h a month, about 3 matches · Verified by Advantage$150$75then $150 a month",
    "Coach Pro10h a month, about 5 matches · Verified by Advantage$300$150then $300 a month",
    "2 extra hours$35 an hour · No plan · Last 12 months$70",
  ]);
  expect(html.indexOf("Or pay for just this match")).toBeGreaterThan(
    html.indexOf("Coach Pro"),
  );
  expect(html.indexOf("Or pay for just this match")).toBeLessThan(
    html.indexOf("2 extra hours"),
  );
  // No billing pills here: the paywall sells the month.
  expect(html).not.toContain("Yearly · 1 month free");
  expect(primary(html)).toEqual([
    "Shorten the trim instead",
    "Pay $75 and send",
  ]);
});

test("Upload paywall, a subscriber: extra hours, the upgrade, and the draft aside", () => {
  const html = draw(NEEDED, COACH_SPENT, {
    wizard: true,
    preview: preview(23 * M),
  });
  expect(html).toContain("Coach · 23m left this month");
  expect(html).toContain("Hours reset May 14");
  expect(radios(html)).toEqual([
    "2 extra hoursCovers it, 31m to spare · Last 12 months$70$35 an hour",
    "Move up to Coach Pro10 fresh hours today · $11.50 credit for your 23m$288.50then $300 a month",
  ]);
  expect(html).toContain(
    "Or keep it as a draft and send it when your hours reset on May 14.",
  );
  expect(primary(html)).toEqual([
    "Shorten the trim instead",
    "Pay $70 and send",
  ]);
  // No first-month offer is made to someone already subscribed.
  expect(html).not.toContain("Half off");
});

test("Upgrade: Coach Pro chosen, the current plan beneath it and not selectable", () => {
  const html = draw({ kind: "upgrade" }, COACH, {
    preview: preview(3 * H + 12 * M),
  });
  expect(texts(html, /<h2[^>]*>(.*?)<\/h2>/g)).toEqual([
    "Move up to Coach Pro.",
  ]);
  // One radio: the plan being bought. The plan held is a row, not a choice.
  expect(radios(html)).toEqual([
    "Coach Pro10 fresh hours today · $75 credit for your 15 days left$225then $300 a month",
  ]);
  expect(html).toContain('aria-checked="true"');
  expect(html).toMatch(/Coach<span[^>]*>Your plan<\/span>/);
  expect(html).toContain(
    "15 days ($75) or 3h 12m of hours ($96). From today you're billed $300 on the 29th of each month, and your 1h of extra hours stays.",
  );
  expect(html).not.toContain("Yearly");
  expect(primary(html)).toEqual(["Continue to pay $225"]);
});

test("Upgrade: bars while the price loads, and the refusal sentence when it cannot be priced", () => {
  const loading = draw({ kind: "upgrade" }, COACH, {
    preview: { status: "loading" },
  });
  expect(loading).toContain('role="status"');
  expect(loading).toContain("animate-pulse");
  expect(radios(loading)).toEqual([]);
  expect(loading).toMatch(/<button[^>]*disabled=""[^>]*>Continue to pay</);

  const refused = draw({ kind: "upgrade" }, COACH, {
    preview: {
      status: "failed",
      message: "Update your card before upgrading.",
    },
  });
  expect(refused).toMatch(
    /<p role="alert"[^>]*>Update your card before upgrading\.<\/p>/,
  );
  expect(refused).toMatch(/<button[^>]*disabled=""[^>]*>Continue to pay</);
});

test("Upgrade: a refused charge keeps the quote, the amount and the button, and adds the sentence", () => {
  const html = draw({ kind: "upgrade" }, COACH, {
    preview: preview(3 * H + 12 * M),
    refusal: "Update your card before upgrading.",
  });
  expect(radios(html).join(" ")).toContain("Coach Pro");
  expect(primary(html)).toEqual(["Continue to pay $225"]);
  expect(html).toContain("$225");
  expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Continue to pay/);
  expect(html).toMatch(
    /<p role="alert"[^>]*>Update your card before upgrading\.<\/p>/,
  );
});

test("Extra hours: quick picks and one row, never a plan", () => {
  const html = draw({ kind: "hours" }, COACH);
  expect(texts(html, /<h2[^>]*>(.*?)<\/h2>/g)).toEqual(["Add extra hours."]);
  expect(radios(html)).toEqual(["1h", "2h", "5h", "10h"]);
  expect(html).toContain("1 extra hour");
  expect(primary(html)).toEqual(["Continue to pay $35"]);
});

test("a payment that has not shown up offers no way to pay again", () => {
  const html = draw({ kind: "choose" }, FREE, { paymentPending: true });
  expect(html).toContain("Your payment went through.");
  expect(radios(html)).toEqual([]);
  expect(html).not.toContain("Continue to pay");
});

test("Pay yearly: the year chosen with its credit, the month beside it with the grey pill, no checkout form", () => {
  const html = draw({ kind: "yearly" }, COACH, {
    preview: {
      status: "ready",
      preview: {
        ...quoteUpgrade({
          from: "coach",
          to: "coach",
          period: "monthly",
          toPeriod: "yearly",
          periodStart: new Date("2027-04-14T00:00:00Z"),
          periodEnd: new Date("2027-05-14T00:00:00Z"),
          now: new Date("2027-04-29T00:00:00Z"),
          usedSeconds: planHoursSeconds("coach") - (3 * H + 12 * M),
        }),
        period: "yearly",
        fromPeriod: "monthly",
      },
    },
  });
  expect(texts(html, /<h2[^>]*>(.*?)<\/h2>/g)).toEqual(["Pay yearly."]);
  // One selectable row; the current plan is not a choice.
  expect(radios(html)).toEqual([
    "Coach, yearly$75 credit for your 15 days left$1,575then $1,650 a year",
  ]);
  expect(html).toContain("Coach, monthly");
  expect(html).toContain("Your plan");
  expect(html).toContain("Then $1,650 a year, next on Apr 29, 2028");
  expect(primary(html)).toEqual(["Continue to pay $1,575"]);
  expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Continue to pay/);
  // The card on file is charged: Stripe's frame is never drawn.
  expect(html).not.toContain("data-stripe");
  // No monthly / yearly pills: there is one thing to do here.
  expect(html).not.toContain("Yearly · 1 month free");
});

test("Pay yearly: bars while the price loads, and nothing to press", () => {
  const html = draw({ kind: "yearly" }, COACH, {
    preview: { status: "loading" },
  });
  expect(html).toContain('role="status"');
  expect(radios(html)).toEqual([]);
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Continue to pay</);
});

test("Upload paywall, a failed payment: extra hours only, and Update card in the aside", () => {
  const html = draw(
    NEEDED,
    { ...COACH_SPENT, planLeftSeconds: 0, resetsOn: null, pastDue: true },
    { wizard: true },
  );
  expect(radios(html)).toHaveLength(1);
  expect(radios(html)[0]).toContain("2 extra hours");
  expect(html).not.toContain("Move up to");
  expect(html).toContain(
    "Your last payment failed. Update your card to get this month's hours.",
  );
  expect(html).toMatch(
    /<button[^>]*type="button"[^>]*>Update card ↗<\/button>/,
  );
  expect(html).toContain("Payment failed");
  expect(html).toContain("Pay $70 and send");
});

test("MOCK, move down to Coach: the smaller plan chosen, the current one with the pill, a live button", () => {
  const html = draw(
    {
      kind: "change",
      change: {
        to: { plan: "coach", period: "monthly" },
        effectiveOn: "2027-02-14",
      },
    },
    {
      plan: "coach-pro",
      period: "monthly",
      planLeftSeconds: 7 * H + 40 * M,
      extraSeconds: 0,
      resetsOn: "Feb 14",
      firstMonthEligible: false,
    },
  );
  expect(texts(html, /<h2[^>]*>(.*?)<\/h2>/g)).toEqual(["Move down to Coach."]);
  expect(radios(html)).toEqual([
    "Coach$150 a month from Feb 14 · 5 hours a month$0today",
  ]);
  expect(html).toContain("Coach Pro");
  expect(html).toContain("Your plan");
  expect(html).toContain(
    "You keep Coach Pro and its 10 hours until Feb 14. Nothing is charged today.",
  );
  expect(html).toContain("Not now");
  expect(html).toContain("Move to Coach on Feb 14");
  expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Move to Coach/);
  expect(html).not.toContain("data-stripe");
});

test("MOCK, yearly → monthly: Pay monthly, switching at the year's renewal", () => {
  const html = draw(
    {
      kind: "change",
      change: {
        to: { plan: "coach", period: "monthly" },
        effectiveOn: "2028-01-14",
      },
    },
    { ...COACH, period: "yearly", resetsOn: "Feb 14" },
  );
  expect(texts(html, /<h2[^>]*>(.*?)<\/h2>/g)).toEqual(["Pay monthly."]);
  expect(radios(html)).toEqual([
    "Coach, monthly$150 a month from Jan 14, 2028$0today",
  ]);
  expect(html).toContain(
    "Your year is paid through Jan 14, 2028. Nothing is charged today.",
  );
  expect(html).toContain("Switch on Jan 14, 2028");
});
