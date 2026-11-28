import { expect, test } from "@playwright/test";

import {
  planUsageAlertEmail,
  usageAlertEmail,
  type EmailMessage,
} from "@/lib/services/email";
import { usageAlertDedupeKey } from "@/lib/services/notifications/usage-alert-key";
import { allowanceFor } from "@/lib/services/splitstep/allowance";
import type { Workspace } from "@/lib/workspace/types";
import { createLoader } from "./fixtures/vm-modules";

/**
 * Stage F's usage emails: a player's plan hours at 80% and used up, a
 * program's season at the same two lines, and the rule that sends each once
 * per hours window.
 *
 * Offline, and nothing is sent. The templates are pure. The notifier runs
 * through `fixtures/vm-modules` with a fake database, fake preference and
 * claim reads and a fake sender that only records what it was handed.
 *
 * The personal copy is pinned to the approved table in
 * docs/plans/2027-pricing.md ("Email copy"), on its own Player example: 5h,
 * 4h used, hours resetting February 14.
 */

const SITE = "https://app.example.test";
const H = 3600;
const M = 60;

// Set at load, not in a hook: the fixtures below render at collection time.
process.env.NEXT_PUBLIC_SITE_URL = SITE;

const PLAYER = {
  to: "jordan@example.com",
  planId: "player" as const,
  capSeconds: 5 * H,
  resetsAt: new Date("2027-02-14T00:00:00Z"),
};

function wellFormed(message: EmailMessage) {
  expect(message.html).toContain("<html");
  expect(message.text.length).toBeGreaterThan(40);
  for (const value of Object.values(message.tags ?? {})) {
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
  }
}

test.describe("a player's plan: 80% used", () => {
  const message = planUsageAlertEmail({
    ...PLAYER,
    severity: "low",
    usedSeconds: 4 * H,
  });

  test("subject and heading", () => {
    expect(message.subject).toBe("1h of match video left this month");
    expect(message.html).toContain("1h of match video left this month");
  });

  test("the preheader is set, and is the approved line", () => {
    expect(message.html).toContain(
      "About half a match left on Player. Your hours reset Feb 14.",
    );
  });

  test("the body, word for word", () => {
    expect(message.text).toContain(
      "You've used 4h of your 5h on Player. The hour left covers about half a match, and your hours reset on February 14.",
    );
    expect(message.text).toContain(
      "Playing more before then? Extra hours are $35 each and last 12 months, or Player Pro gives you 10h a month.",
    );
  });

  test("facts, button and the opt-out note", () => {
    expect(message.text).toContain("Left: 1h · about half a match");
    expect(message.text).toContain("Resets: Feb 14");
    expect(message.text).toContain(
      `Add hours:\n${SITE}/dashboard/settings/plan`,
    );
    expect(message.html).toContain(`<a href="${SITE}/dashboard/settings/plan"`);
    expect(message.text).toContain('"Analysis allowance alerts"');
  });

  test("a text part, and machine-shaped tags", () => {
    wellFormed(message);
    expect(message.tags).toEqual({
      type: "usage_alert",
      severity: "low",
      plan: "player",
    });
    expect(message.to).toBe("jordan@example.com");
  });
});

test.describe("a player's plan: used up", () => {
  const message = planUsageAlertEmail({
    ...PLAYER,
    severity: "spent",
    usedSeconds: 5 * H,
  });

  test("subject, preheader and heading", () => {
    expect(message.subject).toBe("You've used this month's video hours");
    expect(message.html).toContain(
      "New uploads wait until Feb 14. Add hours to send one sooner.",
    );
    expect(message.html).toContain(
      "You&#39;ve used this month&#39;s 5h of match video",
    );
  });

  test("the body, word for word", () => {
    expect(message.text).toContain(
      "New matches wait until your hours reset on February 14. Anything you've already sent keeps processing.",
    );
    expect(message.text).toContain(
      "To analyze a match sooner, add extra hours at $35 each, or move up to Player Pro for 10h a month.",
    );
  });

  test("facts, button, text part", () => {
    expect(message.text).toContain("Used: 5h of 5h");
    expect(message.text).toContain("Resets: Feb 14");
    expect(message.text).toContain(
      `Add hours:\n${SITE}/dashboard/settings/plan`,
    );
    wellFormed(message);
  });
});

test.describe("a player's plan: the figures are the account's", () => {
  test("Player Pro reads its ten hours and offers no step up", () => {
    const low = planUsageAlertEmail({
      to: "sam@example.com",
      planId: "player-pro",
      severity: "low",
      usedSeconds: 8 * H,
      capSeconds: 10 * H,
      resetsAt: new Date("2027-03-02T00:00:00Z"),
    });
    expect(low.subject).toBe("2h of match video left this month");
    expect(low.text).toContain(
      "You've used 8h of your 10h on Player Pro. The 2h left covers about 1 match, and your hours reset on March 2.",
    );
    expect(low.text).toContain(
      "Playing more before then? Extra hours are $35 each and last 12 months.",
    );
    expect(low.text).not.toContain("gives you");

    const spent = planUsageAlertEmail({
      to: "sam@example.com",
      planId: "player-pro",
      severity: "spent",
      usedSeconds: 10 * H,
      capSeconds: 10 * H,
      resetsAt: new Date("2027-03-02T00:00:00Z"),
    });
    expect(spent.text).toContain(
      "To analyze a match sooner, add extra hours at $35 each.",
    );
    expect(spent.text).not.toContain("move up");
  });

  test("minutes left are said as minutes", () => {
    const low = planUsageAlertEmail({
      ...PLAYER,
      severity: "low",
      usedSeconds: 4 * H + 12 * M,
    });
    expect(low.subject).toBe("48m of match video left this month");
    expect(low.text).toContain("The 48m left covers about half a match");
  });

  test("with extra hours in hand, used up does not say uploads wait", () => {
    const spent = planUsageAlertEmail({
      ...PLAYER,
      severity: "spent",
      usedSeconds: 5 * H,
      extraSeconds: 2 * H,
    });
    expect(spent.text).toContain(
      "Your Player hours reset on February 14. Until then, new matches use your 2h of extra hours.",
    );
    expect(spent.text).not.toContain("New matches wait");
    expect(spent.html).toContain(
      "New uploads use your 2h of extra hours until Feb 14.",
    );

    const low = planUsageAlertEmail({
      ...PLAYER,
      severity: "low",
      usedSeconds: 4 * H,
      extraSeconds: 2 * H,
    });
    expect(low.text).toContain(
      "You also have 2h of extra hours, which are used after your plan's hours.",
    );
  });

  test("no version says beta, pilot, credits or allowance in its copy", () => {
    for (const severity of ["low", "spent"] as const) {
      const message = planUsageAlertEmail({
        ...PLAYER,
        severity,
        usedSeconds: severity === "low" ? 4 * H : 5 * H,
      });
      const copy = message.text.replace(/"Analysis allowance alerts"/, "");
      expect(copy).not.toMatch(/beta|pilot|credits|allowance|free hours/i);
    }
  });
});

test.describe("a program's season", () => {
  const SEASON = {
    to: "alex@example.com",
    recipientName: "Alex",
    programName: "Northfield University Men's",
    capSeconds: 200 * H,
    billingMonth: "2027-03-01",
    resetsOn: "Jun 1",
    period: "season" as const,
    seasonEndsOn: "2027-05-31",
    programId: "22222222-2222-2222-2222-222222222222",
  };

  test("80%: this season, and the season's end where a month has its reset", () => {
    const message = usageAlertEmail({
      ...SEASON,
      severity: "low",
      usedSeconds: 160 * H,
    });
    expect(message.subject).toBe(
      "Northfield University Men's: 80% of this season's analysis time used",
    );
    expect(message.html).toContain(
      "40h of analysis time left for Northfield University Men&#39;s this season.",
    );
    expect(message.text).toContain(
      "Alex, the program has 40h of video analysis left this season, which ends on May 31.",
    );
    expect(message.text).toContain("Used: 160h of 200h");
    expect(message.text).toContain("Left: 40h");
    expect(message.text).toContain("Season ends: May 31");
    // A season's hours do not renew: no monthly reset is promised.
    expect(message.text).not.toMatch(/renews|this month|Jun 1/);
    wellFormed(message);
    expect(message.tags).toEqual({
      type: "usage_alert",
      severity: "low",
      period: "season",
    });
  });

  test("spent: uploads pause until hours are added, not until a date", () => {
    const message = usageAlertEmail({
      ...SEASON,
      severity: "spent",
      usedSeconds: 200 * H,
    });
    expect(message.subject).toBe(
      "Northfield University Men's: this season's analysis time is spent",
    );
    expect(message.text).toContain(
      "the program's 200h of video analysis for this season is fully reserved. New video uploads will be refused until hours are added; the season ends on May 31.",
    );
    expect(message.text).not.toMatch(/renews|this month/);
    wellFormed(message);
  });

  test("the link is the team's own page, where its hours live", () => {
    const message = usageAlertEmail({
      ...SEASON,
      severity: "low",
      usedSeconds: 160 * H,
    });
    expect(message.html).toContain(
      `<a href="${SITE}/dashboard/settings/teams/${SEASON.programId}"`,
    );
  });

  test("the pre-January mail is unchanged: a month, and Settings › Usage", () => {
    const message = usageAlertEmail({
      to: "alex@example.com",
      recipientName: "Alex",
      programName: "Northfield University Men's",
      severity: "low",
      usedSeconds: 60 * H,
      capSeconds: 75 * H,
      billingMonth: "2026-11-01",
    });
    expect(message.subject).toBe(
      "Northfield University Men's: 80% of this month's analysis time used",
    );
    expect(message.text).toContain("before the allowance renews on Dec 1");
    expect(message.html).toContain(`${SITE}/dashboard/settings/usage`);
    expect(message.tags).toEqual({ type: "usage_alert", severity: "low" });
  });
});

/* -------------------------------------------------------------------------
 * One mail per threshold per hours window
 * ---------------------------------------------------------------------- */

const USER = "33333333-3333-3333-3333-333333333333";
const PROGRAM = "22222222-2222-2222-2222-222222222222";

function personal(planPeriodStart: string, plan = "player"): Workspace {
  return {
    id: USER,
    kind: "personal",
    name: "Jordan Reyes",
    orgType: null,
    plan,
    planPeriodStart,
  } as unknown as Workspace;
}

const SEASON_TEAM = {
  id: PROGRAM,
  kind: "team",
  name: "Northfield University",
  team: "mens",
  orgType: "college",
  programPlan: {
    id: "program",
    term: "spring",
    startsOn: "2027-01-01",
    endsOn: "2027-05-31",
  },
} as unknown as Workspace;

const PILOT_TEAM = {
  id: PROGRAM,
  kind: "team",
  name: "University of Georgia",
  team: "womens",
  orgType: "college",
  pilotEligible: true,
  pilotEndsOn: "2027-05-31",
  pilotEndedAt: null,
} as unknown as Workspace;

test.describe("the dedupe key", () => {
  test("a personal plan keys on the hours window, not the calendar month", () => {
    const workspace = personal("2027-01-14T09:30:00Z");
    // January 30 and February 5 are two calendar months and one hours window.
    const late = allowanceFor(workspace, new Date("2027-01-30T12:00:00Z"));
    const early = allowanceFor(workspace, new Date("2027-02-05T12:00:00Z"));
    expect(late.billingMonth).not.toBe(early.billingMonth);
    expect(usageAlertDedupeKey("low", USER, late)).toBe(
      `usage_low:${USER}:2027-01-14T09:30:00.000Z`,
    );
    expect(usageAlertDedupeKey("low", USER, early)).toBe(
      usageAlertDedupeKey("low", USER, late),
    );

    // The next window is a new key; so is the other threshold.
    const next = allowanceFor(workspace, new Date("2027-02-14T09:30:00Z"));
    expect(usageAlertDedupeKey("low", USER, next)).toBe(
      `usage_low:${USER}:2027-02-14T09:30:00.000Z`,
    );
    expect(usageAlertDedupeKey("spent", USER, late)).not.toBe(
      usageAlertDedupeKey("low", USER, late),
    );
  });

  test("an upgrade the same day starts a new window, so a new key", () => {
    const before = allowanceFor(
      personal("2027-01-14T09:30:00Z"),
      new Date("2027-01-20T18:00:00Z"),
    );
    const after = allowanceFor(
      personal("2027-01-20T15:00:00Z", "player-pro"),
      new Date("2027-01-20T18:00:00Z"),
    );
    expect(usageAlertDedupeKey("spent", USER, after)).not.toBe(
      usageAlertDedupeKey("spent", USER, before),
    );
  });

  test("a season keys on the day it starts: once a season, not once a month", () => {
    const march = allowanceFor(SEASON_TEAM, new Date("2027-03-10T12:00:00Z"));
    const april = allowanceFor(SEASON_TEAM, new Date("2027-04-10T12:00:00Z"));
    expect(usageAlertDedupeKey("low", PROGRAM, march)).toBe(
      `usage_low:${PROGRAM}:2027-01-01`,
    );
    expect(usageAlertDedupeKey("low", PROGRAM, april)).toBe(
      usageAlertDedupeKey("low", PROGRAM, march),
    );
  });

  test("a pilot and the beta key on the billing month, as before", () => {
    const pilot = allowanceFor(PILOT_TEAM, new Date("2027-03-10T12:00:00Z"));
    expect(usageAlertDedupeKey("low", PROGRAM, pilot)).toBe(
      `usage_low:${PROGRAM}:2027-03-01`,
    );
    const beta = allowanceFor(
      { ...PILOT_TEAM, pilotEligible: false } as Workspace,
      new Date("2026-11-10T12:00:00Z"),
    );
    expect(usageAlertDedupeKey("spent", PROGRAM, beta)).toBe(
      `usage_spent:${PROGRAM}:2026-11-01`,
    );
  });
});

/* -------------------------------------------------------------------------
 * The notifier, on fakes
 * ---------------------------------------------------------------------- */

interface Fakes {
  sent: EmailMessage[];
  claimed: string[];
  spent: Set<string>;
  wantsAlerts: boolean;
  creditSeconds: number;
  email: string | null;
  staff: { user_id: string; email: string }[];
}

function harness(overrides: Partial<Fakes> = {}) {
  const fakes: Fakes = {
    sent: [],
    claimed: [],
    spent: new Set(),
    wantsAlerts: true,
    creditSeconds: 0,
    email: "jordan@example.com",
    staff: [{ user_id: "owner-1", email: "alex@example.com" }],
    ...overrides,
  };

  // The few query shapes the notifier makes, answered from the fixture.
  const db = {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () =>
          table === "program_members"
            ? Promise.resolve({
                data: fakes.staff.map((row) => ({
                  user_id: row.user_id,
                  users: {
                    first_name: "Alex",
                    last_name: "Morgan",
                    email: row.email,
                  },
                })),
                error: null,
              })
            : chain,
        maybeSingle: () =>
          Promise.resolve({ data: { email: fakes.email }, error: null }),
      };
      return chain;
    },
  };

  const loader = createLoader({
    stubs: {
      "@/lib/supabase/admin": { createAdminClient: () => db },
      "@/lib/services/email": {
        planUsageAlertEmail,
        usageAlertEmail,
        sendEmail: async (message: EmailMessage) => {
          fakes.sent.push(message);
          return { ok: true };
        },
      },
      "@/lib/data/programs-server": {
        programDisplayName: (name: string) => name,
      },
      "@/lib/services/programs/invite-acceptance": {
        displayName: (first: string | null) => first,
      },
      "@/lib/services/notifications/should-notify": {
        alreadySent: async (key: string) => fakes.spent.has(key),
        claimSend: async (key: string) => {
          if (fakes.spent.has(key)) return false;
          fakes.spent.add(key);
          fakes.claimed.push(key);
          return true;
        },
        wantsNotification: async () => fakes.wantsAlerts,
        getNotificationPrefs: async (ids: string[]) =>
          new Map(
            ids.map((id) => [id, { notifyUsageAlerts: fakes.wantsAlerts }]),
          ),
      },
      "@/lib/services/splitstep/quota": {
        NO_CREDITS: { seconds: 0, grantedSeconds: 0, nextExpiresAt: null },
        readCreditBalance: async () => ({
          seconds: fakes.creditSeconds,
          grantedSeconds: 0,
          nextExpiresAt: null,
        }),
      },
    },
  });
  const { notifyUsageThreshold } = loader.load(
    "src/lib/services/notifications/usage-alert-mail.ts",
  ) as {
    notifyUsageThreshold: (params: {
      workspace: Workspace;
      usedSeconds: number;
      capSeconds: number;
      now?: Date;
    }) => Promise<void>;
  };
  return { fakes, notifyUsageThreshold };
}

const quiet = () => {
  const log = console.log;
  console.log = () => {};
  return () => {
    console.log = log;
  };
};

test.describe("the notifier, on fakes", () => {
  let restore: () => void;
  test.beforeEach(() => {
    restore = quiet();
  });
  test.afterEach(() => restore());

  test("a Player reservation crossing 80% mails the player once per window", async () => {
    const { fakes, notifyUsageThreshold } = harness();
    const workspace = personal("2027-01-14T00:00:00Z");
    const now = new Date("2027-01-30T12:00:00Z");

    await notifyUsageThreshold({
      workspace,
      usedSeconds: 4 * H,
      capSeconds: 5 * H,
      now,
    });
    expect(fakes.sent).toHaveLength(1);
    expect(fakes.sent[0].to).toBe("jordan@example.com");
    expect(fakes.sent[0].subject).toBe("1h of match video left this month");
    expect(fakes.sent[0].text).toContain("your hours reset on February 14");
    expect(fakes.claimed).toEqual([
      `usage_low:${USER}:2027-01-14T00:00:00.000Z`,
    ]);

    // The next upload past the line, a calendar month later, same window.
    await notifyUsageThreshold({
      workspace,
      usedSeconds: 4.5 * H,
      capSeconds: 5 * H,
      now: new Date("2027-02-05T12:00:00Z"),
    });
    expect(fakes.sent).toHaveLength(1);
  });

  test("reaching the cap sends the used-up mail, with its own key", async () => {
    const { fakes, notifyUsageThreshold } = harness();
    const workspace = personal("2027-01-14T00:00:00Z");
    const now = new Date("2027-01-30T12:00:00Z");
    await notifyUsageThreshold({
      workspace,
      usedSeconds: 4 * H,
      capSeconds: 5 * H,
      now,
    });
    await notifyUsageThreshold({
      workspace,
      usedSeconds: 5 * H,
      capSeconds: 5 * H,
      now,
    });
    expect(fakes.sent.map((message) => message.subject)).toEqual([
      "1h of match video left this month",
      "You've used this month's video hours",
    ]);
  });

  test("the next hours window mails again", async () => {
    const { fakes, notifyUsageThreshold } = harness();
    const workspace = personal("2027-01-14T00:00:00Z");
    for (const now of ["2027-01-30T12:00:00Z", "2027-02-20T12:00:00Z"]) {
      await notifyUsageThreshold({
        workspace,
        usedSeconds: 4 * H,
        capSeconds: 5 * H,
        now: new Date(now),
      });
    }
    expect(fakes.sent).toHaveLength(2);
    expect(fakes.sent[1].text).toContain("your hours reset on March 14");
  });

  test("extra hours in hand reach the mail", async () => {
    const { fakes, notifyUsageThreshold } = harness({ creditSeconds: 2 * H });
    await notifyUsageThreshold({
      workspace: personal("2027-01-14T00:00:00Z"),
      usedSeconds: 5 * H,
      capSeconds: 5 * H,
      now: new Date("2027-01-30T12:00:00Z"),
    });
    expect(fakes.sent[0].text).toContain(
      "new matches use your 2h of extra hours",
    );
  });

  test("below 80% nothing is read and nothing is sent", async () => {
    const { fakes, notifyUsageThreshold } = harness();
    await notifyUsageThreshold({
      workspace: personal("2027-01-14T00:00:00Z"),
      usedSeconds: 3 * H,
      capSeconds: 5 * H,
      now: new Date("2027-01-30T12:00:00Z"),
    });
    expect(fakes.sent).toHaveLength(0);
    expect(fakes.claimed).toHaveLength(0);
  });

  test("the switch off: no mail, and the window's key is not spent", async () => {
    const { fakes, notifyUsageThreshold } = harness({ wantsAlerts: false });
    await notifyUsageThreshold({
      workspace: personal("2027-01-14T00:00:00Z"),
      usedSeconds: 4 * H,
      capSeconds: 5 * H,
      now: new Date("2027-01-30T12:00:00Z"),
    });
    expect(fakes.sent).toHaveLength(0);
    expect(fakes.claimed).toHaveLength(0);
  });

  test("a player with no address is skipped without spending the key", async () => {
    const { fakes, notifyUsageThreshold } = harness({ email: null });
    await notifyUsageThreshold({
      workspace: personal("2027-01-14T00:00:00Z"),
      usedSeconds: 4 * H,
      capSeconds: 5 * H,
      now: new Date("2027-01-30T12:00:00Z"),
    });
    expect(fakes.sent).toHaveLength(0);
    expect(fakes.claimed).toHaveLength(0);
  });

  test("the beta's personal hours still send nothing", async () => {
    const { fakes, notifyUsageThreshold } = harness();
    await notifyUsageThreshold({
      workspace: personal("", "free"),
      usedSeconds: 2 * H,
      capSeconds: 2 * H,
      now: new Date("2026-11-20T12:00:00Z"),
    });
    expect(fakes.sent).toHaveLength(0);
  });

  test("a plan bought in December alerts in December", async () => {
    const { fakes, notifyUsageThreshold } = harness();
    await notifyUsageThreshold({
      workspace: personal("2026-12-10T00:00:00Z"),
      usedSeconds: 5 * H,
      capSeconds: 5 * H,
      now: new Date("2026-12-20T12:00:00Z"),
    });
    expect(fakes.sent).toHaveLength(1);
    expect(fakes.sent[0].text).toContain("your hours reset on January 10");
  });

  test("a season team gets the season mail, once a season", async () => {
    const { fakes, notifyUsageThreshold } = harness();
    for (const now of ["2027-03-10T12:00:00Z", "2027-04-10T12:00:00Z"]) {
      await notifyUsageThreshold({
        workspace: SEASON_TEAM,
        usedSeconds: 160 * H,
        capSeconds: 200 * H,
        now: new Date(now),
      });
    }
    expect(fakes.sent).toHaveLength(1);
    expect(fakes.sent[0].to).toBe("alex@example.com");
    expect(fakes.sent[0].subject).toContain("this season's analysis time");
    expect(fakes.sent[0].text).toContain("Season ends: May 31");
    expect(fakes.sent[0].html).toContain(
      `${SITE}/dashboard/settings/teams/${PROGRAM}`,
    );
    expect(fakes.claimed).toEqual([`usage_low:${PROGRAM}:2027-01-01`]);
  });

  test("a pilot team keeps the monthly mail, once a month", async () => {
    const { fakes, notifyUsageThreshold } = harness();
    for (const now of ["2027-03-10T12:00:00Z", "2027-04-10T12:00:00Z"]) {
      await notifyUsageThreshold({
        workspace: PILOT_TEAM,
        usedSeconds: 60 * H,
        capSeconds: 75 * H,
        now: new Date(now),
      });
    }
    expect(fakes.sent).toHaveLength(2);
    expect(fakes.sent[0].subject).toContain("this month's analysis time");
    expect(fakes.sent[0].text).toContain("renews on Apr 1");
  });
});
