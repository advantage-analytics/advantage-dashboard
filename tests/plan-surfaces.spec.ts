import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  homeCardView,
  planHoursView,
  planStandingFor,
  usageCardView,
  type PlanStanding,
} from "@/lib/billing/plan-copy";
import type { AllowanceWorkspace } from "@/lib/services/splitstep/allowance";
import { capRefusalMessage } from "@/lib/services/splitstep/quota";
import { quotaRefusal } from "@/components/dashboard/matches/new-match-wizard/validation";
import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * Stage F's components, rendered offline from the real source through
 * `fixtures/vm-modules`: the header pill once plans apply, Home's plan card,
 * Settings › Usage's personal card with "This month", and a team page's Plan
 * & hours card in its three states. The words are `plan-copy.ts`'s
 * (`tests/plan-copy.spec.ts`); this file checks that the markup draws them —
 * the tag, the figure, the rows with no bars, the disclosure collapsed.
 *
 * Also here: the refusal sentences a season and a plan-less team get.
 */

const H = 3600;
const M = 60;
const NOW = new Date("2027-01-30T12:00:00Z");
const PROGRAM_ID = "22222222-2222-2222-2222-222222222222";

const FREE: AllowanceWorkspace = {
  kind: "personal",
  orgType: null,
  plan: "free",
};
const PLAYER: AllowanceWorkspace = {
  kind: "personal",
  orgType: null,
  plan: "player",
  planPeriodStart: "2027-01-14T00:00:00Z",
};
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

const standing = (workspace: AllowanceWorkspace) =>
  planStandingFor(workspace, NOW);

const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const linkStub = {
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => React.createElement("a", { href, ...rest }, children),
};

/* ---------- The header pill ---------- */

type PillHours =
  | {
      remainingSeconds: number;
      capSeconds: number;
      creditSeconds?: number;
    }
  | "loading"
  | null;

function renderPill(planStanding: PlanStanding, hours: PillHours): string {
  const loader = createLoader({
    stubs: {
      "next/navigation": {
        usePathname: () => "/dashboard",
        useRouter: () => ({ push: () => {} }),
      },
      "@/components/dashboard/workspace-provider": {
        useWorkspace: () => ({ active: { id: "w1", kind: "personal" } }),
      },
      "@/components/dashboard/beta-welcome-dialog": {
        BetaWelcomeDialog: marker("BetaWelcomeDialog"),
        useBetaWelcomeTerms: () => ({ hours: 2 }),
      },
      "@/components/dashboard/shared/chrome-tooltip": {
        ChromeTooltip: ({
          label,
          detail,
          children,
        }: {
          label: string;
          detail: string;
          children: React.ReactNode;
        }) =>
          React.createElement(
            "div",
            { "data-tip-label": label, "data-tip-detail": detail },
            children,
          ),
      },
    },
  });
  const { PlanMeterPill } = loader.load(
    "src/components/dashboard/beta-header-meter.tsx",
  ) as {
    PlanMeterPill: React.ComponentType<{
      standing: PlanStanding;
      hours: PillHours;
      onClick: () => void;
    }>;
  };
  return renderToStaticMarkup(
    React.createElement(PlanMeterPill, {
      standing: planStanding,
      hours,
      onClick: () => {},
    }),
  );
}

test.describe("the header pill once plans apply", () => {
  const cases: [string, AllowanceWorkspace, PillHours, string, string][] = [
    ["Free", FREE, { remainingSeconds: 0, capSeconds: 0 }, "Free", "0h left"],
    [
      "Player",
      PLAYER,
      { remainingSeconds: 3 * H + 12 * M, capSeconds: 5 * H },
      "Player",
      "3.2h left",
    ],
    [
      "Player Pro",
      { ...PLAYER, plan: "player-pro" },
      { remainingSeconds: 7.5 * H, capSeconds: 10 * H },
      "Player Pro",
      "7.5h left",
    ],
    [
      "a team on Starter",
      {
        ...SEASON,
        programPlan: { ...SEASON.programPlan!, id: "starter" },
      },
      { remainingSeconds: 60 * H, capSeconds: 80 * H },
      "Starter",
      "60h left",
    ],
    [
      "a team on Program",
      SEASON,
      { remainingSeconds: 142 * H, capSeconds: 200 * H },
      "Program",
      "142h left",
    ],
    [
      "a team on Elite",
      FULL_YEAR,
      { remainingSeconds: 310 * H, capSeconds: 400 * H },
      "Elite",
      "310h left",
    ],
    [
      "a pilot team",
      PILOT,
      { remainingSeconds: 61.5 * H, capSeconds: 75 * H },
      "Pilot",
      "61.5h left",
    ],
    [
      "a team with no plan",
      NO_PLAN,
      { remainingSeconds: 0, capSeconds: 0 },
      "No plan",
      "0h left",
    ],
  ];

  for (const [name, workspace, hours, tag, figure] of cases) {
    test(`${name}: tag "${tag}", figure "${figure}"`, () => {
      const html = renderPill(standing(workspace), hours);
      expect(text(html)).toBe(`${tag} ${figure}`);
      expect(html).toContain(`aria-label="${tag}: `);
      expect(html).not.toMatch(/>Beta</);
    });
  }

  test("only a pilot team's pill says Pilot", () => {
    for (const [, workspace, hours, tag] of cases) {
      const html = renderPill(standing(workspace), hours);
      if (tag === "Pilot") continue;
      expect(html).not.toMatch(/pilot/i);
    }
  });

  test("a season's tooltip says this season, with the season's own end", () => {
    const html = renderPill(standing(SEASON), {
      remainingSeconds: 142 * H,
      capSeconds: 200 * H,
    });
    expect(html).toContain(
      'data-tip-detail="142 of 200 video hours left this season. The season ends May 31."',
    );
  });

  test("loading keeps the tag and draws a bar where the figure goes", () => {
    const html = renderPill(standing(PLAYER), "loading");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Player: checking video hours left"');
    expect(text(html)).toBe("Player");
  });

  test("a failed read is the bare tag, never a ring or a skeleton", () => {
    const html = renderPill(standing(PLAYER), null);
    expect(html).not.toContain("aria-busy");
    expect(html).toContain('aria-label="Player"');
    expect(text(html)).toBe("Player");
    expect(html).not.toContain("<svg");
  });
});

/* ---------- Home's plan card ---------- */

function renderHomeCard(view: ReturnType<typeof homeCardView>): string {
  const loader = createLoader({
    stubs: {
      "next/link": linkStub,
      "@/components/ui/live-dots": { LiveDots: () => null },
    },
  });
  const { PlanHomeCard } = loader.load(
    "src/components/dashboard/home-feed/pilot-card.tsx",
  ) as {
    PlanHomeCard: React.ComponentType<{ view: typeof view }>;
  };
  return renderToStaticMarkup(React.createElement(PlanHomeCard, { view }));
}

test.describe("Home's plan card", () => {
  test("Player: one link to Settings › Plan, the figure and the fact line", () => {
    const html = renderHomeCard(
      homeCardView({
        standing: standing(PLAYER),
        owner: "Jordan Reyes",
        usedSeconds: 1 * H + 48 * M,
        capSeconds: 5 * H,
        creditSeconds: 1 * H,
        analyzed: 6,
        today: "2027-01-30",
      }),
    );
    expect(html).toContain('href="/dashboard/settings/plan"');
    expect(text(html)).toBe(
      "See plan Jordan Reyes · Player 4 hours of match video left this month Resets Feb 14 1h extra 6 matches analyzed",
    );
  });

  test("a season team: the days-left fact gives way on a narrow rail", () => {
    const html = renderHomeCard(
      homeCardView({
        standing: standing(SEASON),
        owner: "Northfield University",
        programId: PROGRAM_ID,
        usedSeconds: 58 * H,
        capSeconds: 200 * H,
        analyzed: 31,
        today: "2027-01-30",
      }),
    );
    expect(html).toContain(`href="/dashboard/settings/teams/${PROGRAM_ID}"`);
    expect(text(html)).toBe(
      "See usage Northfield University · Program 142 hours of match video left this season Spring, ends May 31 121 days left 31 matches analyzed",
    );
    expect(html).toMatch(/class="@max-\[380px\]:hidden">121 days left/);
  });

  test("Free: the sentence sits under the figure", () => {
    const html = renderHomeCard(
      homeCardView({
        standing: standing(FREE),
        owner: "Jordan Reyes",
        usedSeconds: 0,
        capSeconds: 0,
        analyzed: 4,
        today: "2027-01-30",
        firstMonthEligible: true,
      }),
    );
    expect(text(html)).toBe(
      "See plans Jordan Reyes · Free 0 hours of match video on the Free plan Choose a plan or buy extra hours to analyze your next match. Your first month of a plan is 30% off. 20 Ask questions a month 4 matches analyzed",
    );
  });
});

/* ---------- Settings › Usage ---------- */

function renderUsageCard(view: ReturnType<typeof usageCardView>): string {
  const loader = createLoader({ stubs: { "next/link": linkStub } });
  const { PersonalUsageCard } = loader.load(
    "src/components/dashboard/settings/personal-usage-card.tsx",
  ) as {
    PersonalUsageCard: React.ComponentType<{ view: typeof view }>;
  };
  return renderToStaticMarkup(React.createElement(PersonalUsageCard, { view }));
}

test.describe("Settings › Usage: the personal card", () => {
  const player = usageCardView({
    standing: standing(PLAYER),
    usedSeconds: 1 * H + 48 * M,
    capSeconds: 5 * H,
    creditSeconds: 1 * H,
    nextCreditExpiresAt: "2027-10-16T00:00:00Z",
    matches: [
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
    ],
  });

  test("Player: the lines, then This month with one row a match", () => {
    const html = renderUsageCard(player);
    expect(text(html)).toBe(
      "Your analysis time 4h 12m left Player: 3h 12m of 5h this month · Extra: 1h · Expires Oct 16, 2027 Manage on Plan This month 2 matches v. Lucas Moreno Jan 18 1:03 v. Ethan Park Jan 9 0:45 Personal uploads only · Player hours reset Feb 14 · Extra hours are used after plan hours",
    );
  });

  test("the rows carry no bars: the only meter is the card's own", () => {
    const html = renderUsageCard(player);
    expect(html.match(/role="meter"/g)).toHaveLength(1);
    const rows = html.slice(html.indexOf("This month"));
    expect(rows).not.toContain("w-[88px]");
    expect(rows).not.toContain("blue-soft");
  });

  test("Free: nothing analyzed yet, and no rows", () => {
    const html = renderUsageCard(
      usageCardView({
        standing: standing(FREE),
        usedSeconds: 0,
        capSeconds: 0,
        creditSeconds: 0,
        nextCreditExpiresAt: null,
        matches: [],
      }),
    );
    expect(text(html)).toBe(
      "Your analysis time 0h left Plan: none · Extra: none Choose a plan on Plan This month Nothing analyzed yet Personal uploads only · Free plan",
    );
  });
});

/* ---------- A team page's Plan & hours ---------- */

const USAGE = {
  usedSeconds: 58 * H,
  capSeconds: 200 * H,
  billingMonth: "2027-01-01",
  lines: [
    { userId: "u1", name: "Jordan Reyes", usedSeconds: 21 * H, matchCount: 12 },
  ],
};

function renderPlanHours(workspace: AllowanceWorkspace, usage = USAGE): string {
  const loader = createLoader({
    stubs: { "@/components/ui/you-pill": { YouPill: marker("YouPill") } },
  });
  const { PlanHoursCard } = loader.load(
    "src/components/dashboard/settings/teams/plan-hours-card.tsx",
  ) as {
    PlanHoursCard: React.ComponentType<Record<string, unknown>>;
  };
  return renderToStaticMarkup(
    React.createElement(PlanHoursCard, {
      view: planHoursView({
        standing: standing(workspace),
        usedSeconds: usage.usedSeconds,
        capSeconds: usage.capSeconds,
      }),
      usage,
      pendingSeconds: 0,
      roles: new Map([["u1", "coach"]]),
      viewerId: "u1",
    }),
  );
}

test.describe("a team page's Plan & hours card", () => {
  test("a season: the season, hours left, the meter, the breakdown collapsed", () => {
    const html = renderPlanHours(SEASON);
    expect(text(html)).toBe(
      "Plan & hours Spring 2027 · Jan 1 – May 31 142h left of 200h · about 79 matches Breakdown by person To add hours or renew for the fall, email team@advantage-analytics.com .",
    );
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-expanded="false"');
    // Collapsed: no person's line is drawn until it is opened.
    expect(html).not.toContain("Jordan Reyes");
  });

  test("a full year reads the 2026–27 season, never Spring", () => {
    const html = renderPlanHours(FULL_YEAR, {
      ...USAGE,
      usedSeconds: 90 * H,
      capSeconds: 400 * H,
    });
    expect(text(html)).toContain("2026–27 season · Aug 1 – Jul 31");
    expect(html).not.toContain("Spring");
  });

  test("a pilot: its end date and this month's hours", () => {
    const html = renderPlanHours(PILOT, {
      ...USAGE,
      usedSeconds: 13.5 * H,
      capSeconds: 75 * H,
    });
    expect(text(html)).toBe(
      "Plan & hours Pilot · until May 31, 2027 61h 30m left of 75h this month · resets Feb 1 Breakdown by person We'll talk about a season plan before May 31: team@advantage-analytics.com .",
    );
  });

  test("no plan: 0h, the one action, and no meter", () => {
    const html = renderPlanHours(NO_PLAN, {
      ...USAGE,
      usedSeconds: 0,
      capSeconds: 0,
      lines: [],
    });
    expect(text(html)).toBe(
      "Plan & hours No plan this season 0h for team uploads Set up a plan Starter, Program or Elite, from $3,000 for the spring Your roster, matches and reports stay. Plans are set up on a short call.",
    );
    expect(html).toContain(
      'href="mailto:team@advantage-analytics.com?subject=College%20plan"',
    );
    expect(html).not.toContain('role="meter"');
    expect(html).not.toContain("Breakdown by person");
    expect(html).not.toMatch(/pilot/i);
  });

  test("no state repeats seats or Verified by Advantage", () => {
    for (const workspace of [SEASON, FULL_YEAR, PILOT, NO_PLAN]) {
      expect(renderPlanHours(workspace)).not.toMatch(/seat|verified/i);
    }
  });
});

/* ---------- Refusals ---------- */

test.describe("the wizard's refusal", () => {
  test("a team with no plan and no pilot never had hours to use up", () => {
    const message = quotaRefusal({
      remainingSeconds: 0,
      neededSeconds: 0,
      resetsOn: null,
      workspaceKind: "team",
      allowanceKind: "none",
    });
    expect(message).toBe(
      "Your team has no plan or video hours yet; its page in Settings › Teams says how to set one up.",
    );
    expect(message).not.toContain("used up");
  });

  test("a season says this season, and promises no reset", () => {
    expect(
      quotaRefusal({
        remainingSeconds: 0,
        neededSeconds: 0,
        resetsOn: "Jun 1",
        workspaceKind: "team",
        allowanceKind: "season",
      }),
    ).toBe("Your team's analysis hours for this season are used up.");
    expect(
      quotaRefusal({
        remainingSeconds: 30 * M,
        neededSeconds: 90 * M,
        resetsOn: "Jun 1",
        workspaceKind: "team",
        allowanceKind: "season",
      }),
    ).toBe(
      "This trim is 1.0 h over the 30 min left this season. Shorten the selection to continue.",
    );
  });

  test("a pilot month and the beta keep the monthly sentence", () => {
    for (const allowanceKind of ["pilot", "beta", undefined]) {
      expect(
        quotaRefusal({
          remainingSeconds: 0,
          neededSeconds: 0,
          resetsOn: "Feb 1",
          workspaceKind: "team",
          allowanceKind,
        }),
      ).toBe(
        "Your team's analysis hours for this month are used up. They reset on Feb 1.",
      );
    }
  });
});

test.describe("the server's refusal", () => {
  const figures = {
    neededSeconds: 2 * H,
    remainingSeconds: 1 * H,
    capSeconds: 200 * H,
  };

  test("a season is this season's hours, not a monthly allowance", () => {
    const message = capRefusalMessage({
      ...figures,
      resetsOn: "Jun 1",
      kind: "season",
    });
    expect(message).toBe(
      "This match needs 2 hr of analysis but only 1 hr is left of your team's hours this season (200 hr). A shorter trim will fit sooner.",
    );
    expect(message).not.toMatch(/monthly|resets/);
  });

  test("a team with no plan is told that, not that it ran out", () => {
    expect(
      capRefusalMessage({
        neededSeconds: 2 * H,
        remainingSeconds: 0,
        capSeconds: 0,
        resetsOn: null,
        kind: "none",
      }),
    ).toBe(
      "Your team has no plan or video hours yet. Its page in Settings › Teams says how to set one up.",
    );
  });

  test("a pilot month is unchanged", () => {
    expect(
      capRefusalMessage({ ...figures, capSeconds: 75 * H, resetsOn: "Feb 1" }),
    ).toBe(
      "This match needs 2 hr of analysis but only 1 hr is left in your monthly allowance (75 hr). It resets on Feb 1; a shorter trim will fit sooner.",
    );
  });
});
