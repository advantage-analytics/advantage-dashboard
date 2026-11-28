import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  CheckoutAccount,
  CheckoutMode,
  PreviewState,
} from "@/lib/billing/checkout-view";
import { readFileSync } from "node:fs";
import { planHoursSeconds } from "@/lib/billing/plans";
import {
  PORTAL_TAB_BLOCKED,
  openBillingPortalTab,
} from "@/lib/billing/portal-client";
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

const { PlanCheckoutDialog, CheckoutProblemLine } = createLoader({
  stubs,
}).load("src/components/dashboard/billing/plan-checkout-dialog.tsx") as {
  CheckoutProblemLine: React.ComponentType<{
    message: string;
    portalUrl?: string | null;
  }>;
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
const PLAYER: CheckoutAccount = {
  plan: "player",
  period: "monthly",
  planLeftSeconds: 3 * H + 12 * M,
  extraSeconds: 1 * H,
  resetsOn: "May 14",
  firstMonthEligible: false,
};
const PLAYER_SPENT: CheckoutAccount = {
  ...PLAYER,
  planLeftSeconds: 23 * M,
  extraSeconds: 0,
};

function preview(planLeftSeconds: number): PreviewState {
  return {
    status: "ready",
    preview: {
      ...quoteUpgrade({
        from: "player",
        to: "player-pro",
        period: "monthly",
        periodStart: new Date("2027-04-14T00:00:00Z"),
        periodEnd: new Date("2027-05-14T00:00:00Z"),
        now: new Date("2027-04-29T00:00:00Z"),
        usedSeconds: planHoursSeconds("player") - planLeftSeconds,
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
  expect(texts(html, /<h2[^>]*>(.*?)<\/h2>/g)).toEqual(["Start Player."]);
  // The figure carries full white and never wraps; the words step back.
  expect(html).toContain(
    '<span class="whitespace-nowrap text-white tabular-nums">Player</span>',
  );
  expect(html).toContain("30% off your first month");
  expect(html).toContain("$105 today, then $150 a month");
  expect(radios(html)).toEqual([
    "Monthly",
    "Yearly · 1 month free",
    "PlayerAbout 3 verified matches a month · 5 hours$150$105then $150 a month",
    "Player ProAbout 6 verified matches a month · 10 hours$300$210then $300 a month",
  ]);
  expect(texts(html, /<s [^>]*>(.*?)<\/s>/g)).toEqual(["$150", "$300"]);
  expect(html).toContain("Not now");
  expect(primary(html)).toEqual(["Continue to pay $105"]);
  expect(html).toContain("See a sample report");
});

test("Upload paywall, Free: the two plans, then extra hours for just this match", () => {
  const html = draw(NEEDED, FREE, { wizard: true });
  expect(texts(html, /<h2[^>]*>(.*?)<\/h2>/g)).toEqual([
    "This match needs 1h 52m.",
  ]);
  expect(radios(html)).toEqual([
    "PlayerAbout 3 verified matches a month · 5 hours$150$105then $150 a month",
    "Player ProAbout 6 verified matches a month · 10 hours$300$210then $300 a month",
    "2 extra hours$35 an hour · No plan · Last 12 months$70",
  ]);
  expect(html.indexOf("Or pay for just this match")).toBeGreaterThan(
    html.indexOf("Player Pro"),
  );
  expect(html.indexOf("Or pay for just this match")).toBeLessThan(
    html.indexOf("2 extra hours"),
  );
  // No billing pills here: the paywall sells the month.
  expect(html).not.toContain("Yearly · 1 month free");
  expect(primary(html)).toEqual([
    "Shorten the trim instead",
    "Pay $105 and send",
  ]);
});

test("Upload paywall, a subscriber: extra hours, the upgrade, and the draft aside", () => {
  const html = draw(NEEDED, PLAYER_SPENT, {
    wizard: true,
    preview: preview(23 * M),
  });
  expect(html).toContain("Player · 23m left this month");
  expect(html).toContain("Hours reset May 14");
  expect(radios(html)).toEqual([
    "2 extra hoursCovers it, 31m to spare · Last 12 months$70$35 an hour",
    "Move up to Player Pro10 fresh hours today · $11.50 credit for your 23m$288.50then $300 a month",
  ]);
  expect(html).toContain(
    "Or keep it as a draft and send it when your hours reset on May 14.",
  );
  expect(primary(html)).toEqual([
    "Shorten the trim instead",
    "Pay $70 and send",
  ]);
  // No first-month offer is made to someone already subscribed.
  expect(html).not.toContain("off your first month");
});

test("Upgrade: Player Pro chosen, the current plan beneath it and not selectable", () => {
  const html = draw({ kind: "upgrade" }, PLAYER, {
    preview: preview(3 * H + 12 * M),
  });
  expect(texts(html, /<h2[^>]*>(.*?)<\/h2>/g)).toEqual([
    "Move up to Player Pro.",
  ]);
  // One radio: the plan being bought. The plan held is a row, not a choice.
  expect(radios(html)).toEqual([
    "Player Pro10 fresh hours today · $75 credit for your 15 days left$225then $300 a month",
  ]);
  expect(html).toContain('aria-checked="true"');
  expect(html).toMatch(/Player<span[^>]*>Your plan<\/span>/);
  expect(html).toContain(
    "15 days ($75) or 3h 12m of hours ($96). From today you're billed $300 on the 29th of each month, and your 1h of extra hours stays.",
  );
  expect(html).not.toContain("Yearly");
  expect(primary(html)).toEqual(["Continue to pay $225"]);
});

test("Upgrade: bars while the price loads, and the refusal sentence when it cannot be priced", () => {
  const loading = draw({ kind: "upgrade" }, PLAYER, {
    preview: { status: "loading" },
  });
  expect(loading).toContain('role="status"');
  expect(loading).toContain("animate-pulse");
  expect(radios(loading)).toEqual([]);
  expect(loading).toMatch(/<button[^>]*disabled=""[^>]*>Continue to pay</);

  const refused = draw({ kind: "upgrade" }, PLAYER, {
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
  const html = draw({ kind: "upgrade" }, PLAYER, {
    preview: preview(3 * H + 12 * M),
    refusal: "Update your card before upgrading.",
  });
  expect(radios(html).join(" ")).toContain("Player Pro");
  expect(primary(html)).toEqual(["Continue to pay $225"]);
  expect(html).toContain("$225");
  expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Continue to pay/);
  expect(html).toMatch(
    /<p role="alert"[^>]*>Update your card before upgrading\.<\/p>/,
  );
});

test("Extra hours: quick picks and one row, never a plan", () => {
  const html = draw({ kind: "hours" }, PLAYER);
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
  const html = draw({ kind: "yearly" }, PLAYER, {
    preview: {
      status: "ready",
      preview: {
        ...quoteUpgrade({
          from: "player",
          to: "player",
          period: "monthly",
          toPeriod: "yearly",
          periodStart: new Date("2027-04-14T00:00:00Z"),
          periodEnd: new Date("2027-05-14T00:00:00Z"),
          now: new Date("2027-04-29T00:00:00Z"),
          usedSeconds: planHoursSeconds("player") - (3 * H + 12 * M),
        }),
        period: "yearly",
        fromPeriod: "monthly",
      },
    },
  });
  expect(texts(html, /<h2[^>]*>(.*?)<\/h2>/g)).toEqual(["Pay yearly."]);
  // One selectable row; the current plan is not a choice.
  expect(radios(html)).toEqual([
    "Player, yearly$75 credit for your 15 days left$1,575then $1,650 a year",
  ]);
  expect(html).toContain("Player, monthly");
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
  const html = draw({ kind: "yearly" }, PLAYER, {
    preview: { status: "loading" },
  });
  expect(html).toContain('role="status"');
  expect(radios(html)).toEqual([]);
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Continue to pay</);
});

test("Upload paywall, a failed payment: extra hours only, and Update card in the aside", () => {
  const html = draw(
    NEEDED,
    { ...PLAYER_SPENT, planLeftSeconds: 0, resetsOn: null, pastDue: true },
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

test("MOCK, move down to Player: the smaller plan chosen, the current one with the pill, a live button", () => {
  const html = draw(
    {
      kind: "change",
      change: {
        to: { plan: "player", period: "monthly" },
        effectiveOn: "2027-02-14",
      },
    },
    {
      plan: "player-pro",
      period: "monthly",
      planLeftSeconds: 7 * H + 40 * M,
      extraSeconds: 0,
      resetsOn: "Feb 14",
      firstMonthEligible: false,
    },
  );
  expect(texts(html, /<h2[^>]*>(.*?)<\/h2>/g)).toEqual([
    "Move down to Player.",
  ]);
  expect(radios(html)).toEqual([
    "Player$150 a month from Feb 14 · 5 hours a month$0today",
  ]);
  expect(html).toContain("Player Pro");
  expect(html).toContain("Your plan");
  expect(html).toContain(
    "You keep Player Pro and its 10 hours until Feb 14. Nothing is charged today.",
  );
  expect(html).toContain("Not now");
  expect(html).toContain("Move to Player on Feb 14");
  expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Move to Player/);
  expect(html).not.toContain("data-stripe");
});

test("MOCK, yearly → monthly: Pay monthly, switching at the year's renewal", () => {
  const html = draw(
    {
      kind: "change",
      change: {
        to: { plan: "player", period: "monthly" },
        effectiveOn: "2028-01-14",
      },
    },
    { ...PLAYER, period: "yearly", resetsOn: "Feb 14" },
  );
  expect(texts(html, /<h2[^>]*>(.*?)<\/h2>/g)).toEqual(["Pay monthly."]);
  expect(radios(html)).toEqual([
    "Player, monthly$150 a month from Jan 14, 2028$0today",
  ]);
  expect(html).toContain(
    "Your year is paid through Jan 14, 2028. Nothing is charged today.",
  );
  expect(html).toContain("Switch on Jan 14, 2028");
});

test.describe("Update card when the browser will not open a tab", () => {
  const URL = "https://billing.stripe.com/p/session/test_123";
  const granted = async () => ({ ok: true as const, url: URL });

  function fakeTab() {
    const tab = {
      opener: {} as unknown,
      closed: false,
      replaced: [] as string[],
      openerWhenPointed: undefined as unknown,
      close() {
        tab.closed = true;
      },
      location: {
        replace(url: string) {
          tab.openerWhenPointed = tab.opener;
          tab.replaced.push(url);
        },
      },
    };
    return tab;
  }

  test("a blocked pop-up hands back the address instead of trying a second one", async () => {
    let opens = 0;
    const answer = await openBillingPortalTab(() => {
      opens++;
      return null;
    }, granted);
    expect(answer).toEqual({ kind: "blocked", url: URL });
    expect(opens).toBe(1);
  });

  test("the tab that opens is cut off from this page before it is pointed at the portal", async () => {
    const tab = fakeTab();
    const answer = await openBillingPortalTab(() => tab, granted);
    expect(answer).toEqual({ kind: "opened" });
    expect(tab.replaced).toEqual([URL]);
    expect(tab.openerWhenPointed).toBeNull();
  });

  test("a tab closed while the address was on its way counts as blocked", async () => {
    const tab = fakeTab();
    const answer = await openBillingPortalTab(
      () => tab,
      async () => {
        tab.close();
        return granted();
      },
    );
    expect(answer).toEqual({ kind: "blocked", url: URL });
    expect(tab.replaced).toEqual([]);
  });

  test("a portal that cannot be had closes the blank tab and says why", async () => {
    const tab = fakeTab();
    const answer = await openBillingPortalTab(
      () => tab,
      async () => ({ ok: false, message: "Billing couldn't open." }),
    );
    expect(answer).toEqual({
      kind: "failed",
      message: "Billing couldn't open.",
    });
    expect(tab.closed).toBe(true);
  });

  test("the error line carries the sentence and the address as a real link", () => {
    const html = renderToStaticMarkup(
      el(CheckoutProblemLine, { message: PORTAL_TAB_BLOCKED, portalUrl: URL }),
    ).replace(/&#x27;/g, "'");
    expect(html).toMatch(/^<p role="alert"[^>]*>.*<\/p>$/);
    expect(html).toContain("Billing couldn't open in a new tab.");
    const link = html.match(/<a [^>]*>(.*?)<\/a>/)!;
    expect(link[1]).toBe("Open billing ↗");
    expect(link[0]).toContain(`href="${URL}"`);
    expect(link[0]).toContain('target="_blank"');
    expect(link[0]).toContain('rel="noopener noreferrer"');
    // The quiet link "Update card" is drawn with, in the line it stood in.
    expect(link[0]).toContain(
      'class="text-[var(--blue)] hover:text-[var(--blue-hover)]"',
    );
  });

  test("any other problem is the sentence alone", () => {
    const html = renderToStaticMarkup(
      el(CheckoutProblemLine, {
        message: "Update your card before upgrading.",
      }),
    );
    expect(html).not.toContain("<a ");
    expect(draw(NEEDED, PLAYER_SPENT, { refusal: "No." })).not.toContain(
      "Open billing",
    );
  });

  test("the dialog draws the link only beside the blocked sentence, in the error line's own slot", () => {
    const source = readFileSync(
      "src/components/dashboard/billing/plan-checkout-dialog.tsx",
      "utf8",
    );
    expect(source).toContain(
      "portalUrl={problem === PORTAL_TAB_BLOCKED ? portalUrl : null}",
    );
    expect(source).toMatch(
      /if \(answer\.kind === "blocked"\) \{\s*setPortalUrl\(answer\.url\);\s*setProblem\(PORTAL_TAB_BLOCKED\);/,
    );
    // One open, inside the click: no second `window.open` after an await.
    expect(source).not.toContain("window.open(");
  });
});
