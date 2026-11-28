import { expect, test } from "@playwright/test";

import { UNLIMITED_CAP_SECONDS } from "@/lib/data/usage-format";
import {
  allowanceFor,
  allowanceResetsOn,
  calendarMonthWindow,
  hoursWindow,
  pilotIsRunning,
  quotaTierFor,
  seasonWindowStart,
  type AllowanceWorkspace,
  type VideoAllowance,
} from "@/lib/services/splitstep/allowance";
import {
  buildPeek,
  capRefusalMessage,
  monthlyCapSecondsFor,
  peekRefusalMessage,
  personalRefusalMessage,
  scopeToAllowance,
  windowArgs,
} from "@/lib/services/splitstep/quota";

/**
 * `allowanceFor()` — which video hours a workspace draws and over which
 * window, on both sides of January 1, 2027 (UTC), for every kind of answer.
 *
 * The windows typed out under "the hours window" are the ones
 * `tests/database/plans-2027-allowances.test.mjs` hands the reserve functions,
 * so the app's arithmetic and the database's sums are pinned to the same
 * instants. Pure — no database, no browser.
 */

const H = 3600;
const LAST_BETA_INSTANT = new Date("2026-12-31T23:59:59.999Z");
const FIRST_PLAN_INSTANT = new Date("2027-01-01T00:00:00.000Z");
const FEB_10 = new Date("2027-02-10T09:00:00Z");

const personal = (fields: Partial<AllowanceWorkspace> = {}) =>
  ({ kind: "personal", orgType: null, ...fields }) as AllowanceWorkspace;
const team = (fields: Partial<AllowanceWorkspace> = {}) =>
  ({ kind: "team", orgType: "college", ...fields }) as AllowanceWorkspace;

const iso = (allowance: VideoAllowance) => [
  allowance.windowStart.toISOString(),
  allowance.windowEnd.toISOString(),
];
const window = (start: string, end: string) => [
  new Date(start).toISOString(),
  new Date(end).toISOString(),
];
const DECEMBER = window("2026-12-01T00:00:00Z", "2027-01-01T00:00:00Z");
const JANUARY = window("2027-01-01T00:00:00Z", "2027-02-01T00:00:00Z");
const FEBRUARY = window("2027-02-01T00:00:00Z", "2027-03-01T00:00:00Z");

const SPRING = {
  id: "starter",
  term: "spring",
  startsOn: "2027-01-01",
  endsOn: "2027-05-31",
} as const;
const PILOT = {
  orgType: "college",
  pilotEligible: true,
  pilotEndsOn: "2027-05-31",
  pilotEndedAt: null,
} as const;

test.describe("before January 1, 2027: today's answers, by calendar month", () => {
  const cases: [string, AllowanceWorkspace, VideoAllowance["kind"], number][] =
    [
      ["a player", personal(), "beta", 2 * H],
      [
        "a pilot individual",
        personal({ individualPilot: true }),
        "beta",
        10 * H,
      ],
      ["a college", team(), "beta", 75 * H],
      ["a custom org", team({ orgType: "club" }), "beta", 2 * H],
      [
        "a custom org on the pilot",
        team({ orgType: "club", pilotEligible: true }),
        "beta",
        75 * H,
      ],
      [
        "an admin's own allowance",
        personal({ videoHoursOverride: 6.5, individualPilot: true }),
        "override",
        6.5 * H,
      ],
      [
        "an admin's personal workspace",
        personal({ unlimitedVideo: true }),
        "unlimited",
        UNLIMITED_CAP_SECONDS,
      ],
      // A season already assigned, a pilot already dated: neither is read
      // until the date. (A PAID personal plan is — see the describe below.)
      [
        "a college with a season plan",
        team({ programPlan: { ...SPRING, startsOn: "2026-12-01" } }),
        "beta",
        75 * H,
      ],
      [
        "a college whose pilot was ended",
        team({ ...PILOT, pilotEndedAt: "2026-12-01T00:00:00Z" }),
        "beta",
        75 * H,
      ],
    ];

  for (const [name, workspace, kind, capSeconds] of cases) {
    test(name, () => {
      const allowance = allowanceFor(workspace, LAST_BETA_INSTANT);
      expect(allowance.kind).toBe(kind);
      expect(allowance.capSeconds).toBe(capSeconds);
      expect(allowance.windowed).toBe(false);
      expect(allowance.billingMonth).toBe("2026-12-01");
      expect(iso(allowance)).toEqual(DECEMBER);
      expect(monthlyCapSecondsFor(workspace, LAST_BETA_INSTANT)).toBe(
        capSeconds,
      );
    });
  }

  test("an override on a team workspace is not the team's", () => {
    expect(
      allowanceFor(team({ videoHoursOverride: 1 }), LAST_BETA_INSTANT).kind,
    ).toBe("beta");
  });

  test("the beta tier: a college or a team on the pilot draws the program figure", () => {
    expect(quotaTierFor({ kind: "personal", orgType: null })).toBe(
      "individual",
    );
    expect(quotaTierFor({ kind: "team", orgType: "college" })).toBe("program");
    expect(quotaTierFor({ kind: "team", orgType: "club" })).toBe("individual");
    expect(
      quotaTierFor({ kind: "team", orgType: "club", pilotEligible: true }),
    ).toBe("program");
  });
});

test.describe("a plan bought in December: its hours start that day (decision 8)", () => {
  const DEC_20 = new Date("2026-12-20T12:00:00Z");

  test("a paid plan is drawn before January 1, over its own window", () => {
    const allowance = allowanceFor(
      personal({ plan: "player-pro", planPeriodStart: "2026-12-15T10:00:00Z" }),
      DEC_20,
    );
    expect([allowance.kind, allowance.capSeconds]).toEqual(["plan", 10 * H]);
    expect(allowance.windowed).toBe(true);
    expect(allowance.billingMonth).toBe("2026-12-01");
    expect(iso(allowance)).toEqual(
      window("2026-12-15T10:00:00Z", "2027-01-15T10:00:00Z"),
    );
  });

  test("the same window on both sides of January 1", () => {
    const player = personal({
      plan: "player",
      planPeriodStart: "2026-12-15T10:00:00Z",
    });
    const before = allowanceFor(player, LAST_BETA_INSTANT);
    const after = allowanceFor(player, FIRST_PLAN_INSTANT);
    expect([before.kind, before.capSeconds]).toEqual(["plan", 5 * H]);
    expect(iso(before)).toEqual(iso(after));
    expect(before.windowed).toBe(true);
  });

  test("an override and an admin keep their precedence over the plan", () => {
    const override = allowanceFor(
      personal({ plan: "player", videoHoursOverride: 6.5 }),
      DEC_20,
    );
    expect([override.kind, override.capSeconds]).toEqual(["override", 6.5 * H]);
    expect(override.windowed).toBe(true);
    const admin = allowanceFor(
      personal({ plan: "player", unlimitedVideo: true }),
      DEC_20,
    );
    expect(admin.kind).toBe("unlimited");
  });

  test("Free, legacy pro and a team are still on the beta", () => {
    for (const plan of ["free", "pro", null, "enterprise"]) {
      const allowance = allowanceFor(personal({ plan }), DEC_20);
      expect([allowance.kind, allowance.windowed]).toEqual(["beta", false]);
    }
    // A team reads no personal plan, whatever rides on the workspace.
    const college = allowanceFor(team({ plan: "player-pro" }), DEC_20);
    expect([college.kind, college.capSeconds]).toEqual(["beta", 75 * H]);
  });
});

test.describe("from January 1, 2027: a personal workspace draws its plan", () => {
  test("the switch is the first instant of January 1, UTC", () => {
    const free = personal();
    expect(allowanceFor(free, LAST_BETA_INSTANT).kind).toBe("beta");
    const after = allowanceFor(free, FIRST_PLAN_INSTANT);
    expect(after.kind).toBe("none");
    expect(after.windowed).toBe(true);
    expect(after.billingMonth).toBe("2027-01-01");
    // 7 pm on December 31 in New York is already January 1 in UTC.
    expect(
      allowanceFor(
        personal({ plan: "player" }),
        new Date("2026-12-31T19:00:00-05:00"),
      ).kind,
    ).toBe("plan");
  });

  test("Free has no hours, on the calendar month", () => {
    for (const plan of ["free", null, undefined, "enterprise"]) {
      const allowance = allowanceFor(personal({ plan }), FEB_10);
      expect([allowance.kind, allowance.capSeconds]).toEqual(["none", 0]);
      expect(iso(allowance)).toEqual(FEBRUARY);
    }
  });

  test("the legacy pro plan reads as Free", () => {
    const allowance = allowanceFor(
      personal({ plan: "pro", planPeriodStart: "2027-01-20T00:00:00Z" }),
      FEB_10,
    );
    expect([allowance.kind, allowance.capSeconds]).toEqual(["none", 0]);
    // No hours, so no period to anchor on.
    expect(iso(allowance)).toEqual(FEBRUARY);
  });

  test("the pilot individual's 10 hours are gone", () => {
    const allowance = allowanceFor(personal({ individualPilot: true }), FEB_10);
    expect([allowance.kind, allowance.capSeconds]).toEqual(["none", 0]);
  });

  test("Player is 5 hours and Player Pro 10, over the hours window", () => {
    const anchor = "2027-01-31T12:00:00Z";
    const player = allowanceFor(
      personal({ plan: "player", planPeriodStart: anchor }),
      FEB_10,
    );
    expect([player.kind, player.capSeconds]).toEqual(["plan", 5 * H]);
    expect(iso(player)).toEqual(
      window("2027-01-31T12:00:00Z", "2027-02-28T12:00:00Z"),
    );
    // The row a reservation writes is still filed under the calendar month.
    expect(player.billingMonth).toBe("2027-02-01");

    const pro = allowanceFor(
      personal({ plan: "player-pro", planPeriodStart: anchor }),
      FEB_10,
    );
    expect([pro.kind, pro.capSeconds]).toEqual(["plan", 10 * H]);
  });

  test("a paid plan with no period start falls back to the calendar month", () => {
    for (const planPeriodStart of [null, undefined, "not a date"]) {
      const allowance = allowanceFor(
        personal({ plan: "player", planPeriodStart }),
        FEB_10,
      );
      expect([allowance.kind, allowance.capSeconds]).toEqual(["plan", 5 * H]);
      expect(iso(allowance)).toEqual(FEBRUARY);
    }
  });

  test("an admin's own allowance still wins, over the plan's window when there is one", () => {
    const free = allowanceFor(
      personal({
        videoHoursOverride: 3,
        planPeriodStart: "2027-01-20T00:00:00Z",
      }),
      FEB_10,
    );
    expect([free.kind, free.capSeconds, free.windowed]).toEqual([
      "override",
      3 * H,
      true,
    ]);
    expect(iso(free)).toEqual(FEBRUARY);

    const player = allowanceFor(
      personal({
        plan: "player",
        videoHoursOverride: 20,
        unlimitedVideo: true,
        planPeriodStart: "2027-01-20T00:00:00Z",
      }),
      FEB_10,
    );
    expect([player.kind, player.capSeconds]).toEqual(["override", 20 * H]);
    expect(iso(player)).toEqual(
      window("2027-01-20T00:00:00Z", "2027-02-20T00:00:00Z"),
    );
    // Zero is an allowance an admin can set, not "no override".
    expect(
      allowanceFor(personal({ plan: "player", videoHoursOverride: 0 }), FEB_10)
        .capSeconds,
    ).toBe(0);
  });

  test("an admin's personal workspace is still unlimited", () => {
    const allowance = allowanceFor(personal({ unlimitedVideo: true }), FEB_10);
    expect([allowance.kind, allowance.capSeconds]).toEqual([
      "unlimited",
      UNLIMITED_CAP_SECONDS,
    ]);
    expect(allowanceResetsOn(allowance)).toBeNull();
  });
});

test.describe("a failed renewal: the plan stays, the unpaid window has no plan hours", () => {
  const player = (fields: Partial<AllowanceWorkspace> = {}) =>
    personal({
      plan: "player",
      planPeriodStart: "2027-01-20T00:00:00Z",
      ...fields,
    });

  test("past_due is the plan path with a cap of 0 and the flag", () => {
    for (const plan of ["player", "player-pro"]) {
      const allowance = allowanceFor(
        player({ plan, planStatus: "past_due" }),
        FEB_10,
      );
      expect([
        allowance.kind,
        allowance.capSeconds,
        allowance.pastDue,
        allowance.windowed,
      ]).toEqual(["plan", 0, true, true]);
      // Still the subscription's own window: paying brings THIS month's hours.
      expect(iso(allowance)).toEqual(
        window("2027-01-20T00:00:00Z", "2027-02-20T00:00:00Z"),
      );
      // Nothing comes back with a date; it comes back with the payment.
      expect(allowanceResetsOn(allowance)).toBeNull();
    }
  });

  test("the hours appear the moment the status is active again", () => {
    const paid = allowanceFor(player({ planStatus: "active" }), FEB_10);
    expect([paid.kind, paid.capSeconds, paid.pastDue]).toEqual([
      "plan",
      5 * H,
      undefined,
    ]);
    // Every other status, and none at all, is a paid window.
    for (const planStatus of [null, undefined, "canceled", "trialing"]) {
      expect(allowanceFor(player({ planStatus }), FEB_10).capSeconds).toBe(
        5 * H,
      );
    }
  });

  test("it applies in December too, to a plan bought early", () => {
    const allowance = allowanceFor(
      player({
        planPeriodStart: "2026-12-10T00:00:00Z",
        planStatus: "past_due",
      }),
      LAST_BETA_INSTANT,
    );
    expect([allowance.kind, allowance.capSeconds, allowance.pastDue]).toEqual([
      "plan",
      0,
      true,
    ]);
  });

  test("an admin's override and an unlimited workspace keep their precedence", () => {
    const override = allowanceFor(
      player({ planStatus: "past_due", videoHoursOverride: 3 }),
      FEB_10,
    );
    expect([override.kind, override.capSeconds, override.pastDue]).toEqual([
      "override",
      3 * H,
      undefined,
    ]);
    const unlimited = allowanceFor(
      player({ planStatus: "past_due", unlimitedVideo: true }),
      FEB_10,
    );
    expect([unlimited.kind, unlimited.capSeconds, unlimited.pastDue]).toEqual([
      "unlimited",
      UNLIMITED_CAP_SECONDS,
      undefined,
    ]);
  });

  test("Free and a team are never past due, whatever the status says", () => {
    const free = allowanceFor(personal({ planStatus: "past_due" }), FEB_10);
    expect([free.kind, free.pastDue]).toEqual(["none", undefined]);
    const season = allowanceFor(
      team({ programPlan: SPRING, planStatus: "past_due" }),
      FEB_10,
    );
    expect([season.kind, season.capSeconds, season.pastDue]).toEqual([
      "season",
      80 * H,
      undefined,
    ]);
  });

  test("the out-of-hours refusal says the payment failed, not to add hours", () => {
    const SENTENCE =
      "Your last payment failed. Update your card to get this month's hours.";
    expect(
      personalRefusalMessage({
        neededSeconds: 2 * H,
        remainingSeconds: 0,
        pastDue: true,
      }),
    ).toBe(`You're out of video hours. ${SENTENCE}`);
    // Extra hours still count, and still fall short.
    expect(
      personalRefusalMessage({
        neededSeconds: 2 * H,
        remainingSeconds: 1 * H,
        pastDue: true,
      }),
    ).toBe(`This video needs 2h. You have 1h left. ${SENTENCE}`);
    // The peek `/api/splitstep/upload-url` refuses from says the same words.
    const peek = { ...buildPeek(0, 0, 1 * H), pastDue: true };
    expect(peekRefusalMessage(peek, 2 * H, { kind: "personal" })).toBe(
      `This video needs 2h. You have 1h left. ${SENTENCE}`,
    );
    // Extra hours that cover it are not refused at all.
    expect(peekRefusalMessage(peek, 30 * 60, { kind: "personal" })).toBeNull();
    // Paid up, the refusal is the usual one.
    expect(
      personalRefusalMessage({
        neededSeconds: 2 * H,
        remainingSeconds: 0,
        now: FEB_10,
      }),
    ).not.toContain("payment failed");
  });
});

test.describe("the hours window", () => {
  const at = (anchor: string | null, now: string) => {
    const { start, end } = hoursWindow(anchor, new Date(now));
    return [start.toISOString(), end.toISOString()];
  };

  test("an anchor on the 31st lands on each month's last day and comes back to the 31st", () => {
    const anchor = "2027-01-31T12:00:00Z";
    const first = window("2027-01-31T12:00:00Z", "2027-02-28T12:00:00Z");
    const second = window("2027-02-28T12:00:00Z", "2027-03-31T12:00:00Z");
    expect(at(anchor, "2027-01-31T12:00:00Z")).toEqual(first);
    expect(at(anchor, "2027-02-10T09:00:00Z")).toEqual(first);
    expect(at(anchor, "2027-02-28T11:59:59Z")).toEqual(first);
    expect(at(anchor, "2027-02-28T12:00:00Z")).toEqual(second);
    expect(at(anchor, "2027-03-31T11:59:59Z")).toEqual(second);
    expect(at(anchor, "2027-03-31T12:00:00Z")).toEqual(
      window("2027-03-31T12:00:00Z", "2027-04-30T12:00:00Z"),
    );
    // A leap February.
    expect(at("2027-12-31T00:00:00Z", "2028-02-15T00:00:00Z")).toEqual(
      window("2028-01-31T00:00:00Z", "2028-02-29T00:00:00Z"),
    );
  });

  test("a window straddles two calendar months", () => {
    const [start, end] = at("2027-01-20T00:00:00Z", "2027-02-03T00:00:00Z");
    expect([start, end]).toEqual(
      window("2027-01-20T00:00:00Z", "2027-02-20T00:00:00Z"),
    );
    expect(start.slice(0, 7)).not.toBe(end.slice(0, 7));
  });

  test("a yearly subscriber gets twelve monthly slices from one anchor", () => {
    const anchor = "2027-01-15T00:00:00Z";
    expect(at(anchor, "2027-01-20T00:00:00Z")).toEqual(
      window("2027-01-15T00:00:00Z", "2027-02-15T00:00:00Z"),
    );
    expect(at(anchor, "2027-02-20T00:00:00Z")).toEqual(
      window("2027-02-15T00:00:00Z", "2027-03-15T00:00:00Z"),
    );
    expect(at(anchor, "2027-12-31T23:00:00Z")).toEqual(
      window("2027-12-15T00:00:00Z", "2028-01-15T00:00:00Z"),
    );
    // The year after renews on the same day, so the slices never drift.
    expect(at(anchor, "2028-01-15T00:00:00Z")).toEqual(
      window("2028-01-15T00:00:00Z", "2028-02-15T00:00:00Z"),
    );
  });

  test("an upgrade moves the anchor, and with it the window", () => {
    const now = "2027-01-25T00:00:00Z";
    expect(at("2027-01-05T00:00:00Z", now)).toEqual(
      window("2027-01-05T00:00:00Z", "2027-02-05T00:00:00Z"),
    );
    expect(at("2027-01-20T00:00:00Z", now)).toEqual(
      window("2027-01-20T00:00:00Z", "2027-02-20T00:00:00Z"),
    );
  });

  test("a period that has not started yet counts back from its anchor", () => {
    expect(at("2027-03-10T00:00:00Z", "2027-02-20T00:00:00Z")).toEqual(
      window("2027-02-10T00:00:00Z", "2027-03-10T00:00:00Z"),
    );
  });

  test("no anchor is the calendar month, in UTC", () => {
    expect(at(null, "2027-02-10T09:00:00Z")).toEqual(FEBRUARY);
    const month = calendarMonthWindow(new Date("2027-01-31T23:59:59Z"));
    expect([month.start.toISOString(), month.end.toISOString()]).toEqual(
      JANUARY,
    );
  });
});

test.describe("from January 1, 2027: a team draws a season, a pilot, or nothing", () => {
  const seasonAt = (now: string, fields: Partial<AllowanceWorkspace> = {}) =>
    allowanceFor(team({ programPlan: SPRING, ...fields }), new Date(now));

  test("a season is one pool from its first day to its last, inclusive", () => {
    for (const now of [
      "2027-01-01T00:00:00Z",
      "2027-03-14T15:00:00Z",
      "2027-05-31T23:59:59Z",
    ]) {
      const allowance = seasonAt(now);
      expect([allowance.kind, allowance.capSeconds]).toEqual([
        "season",
        80 * H,
      ]);
      expect(iso(allowance)).toEqual(
        window("2027-01-01T00:00:00Z", "2027-06-01T00:00:00Z"),
      );
      expect(allowance.windowed).toBe(true);
    }
    expect(seasonAt("2027-03-14T15:00:00Z").billingMonth).toBe("2027-03-01");
  });

  test("a plan saved before its start date counts from the start date", () => {
    // Saved in December for a January 1 season: nothing earlier is in play.
    const allowance = seasonAt("2027-03-14T15:00:00Z", {
      programPlan: { ...SPRING, hoursFrom: "2026-12-12T18:30:00Z" },
    });
    expect(iso(allowance)).toEqual(
      window("2027-01-01T00:00:00Z", "2027-06-01T00:00:00Z"),
    );
    // Saved in the season's first instant is the same answer.
    expect(
      iso(
        seasonAt("2027-03-14T15:00:00Z", {
          programPlan: { ...SPRING, hoursFrom: "2027-01-01T00:00:00Z" },
        }),
      ),
    ).toEqual(window("2027-01-01T00:00:00Z", "2027-06-01T00:00:00Z"));
  });

  test("a plan saved mid-season counts from the moment it was saved", () => {
    // Saved February 10: January's video is not drawn from this pool.
    const saved = "2027-02-10T15:30:00.123Z";
    const allowance = seasonAt("2027-03-14T15:00:00Z", {
      programPlan: { ...SPRING, hoursFrom: saved },
    });
    expect([allowance.kind, allowance.capSeconds]).toEqual(["season", 80 * H]);
    expect(iso(allowance)).toEqual(window(saved, "2027-06-01T00:00:00Z"));
    // The same instants reach the window-keyed RPCs and the ledger read.
    expect(windowArgs(allowance)).toEqual({
      p_window_start: saved,
      p_window_end: "2027-06-01T00:00:00.000Z",
    });
    // The season still ends, and resets, where it did.
    expect(allowanceResetsOn(allowance)).toBe("Jun 1");
  });

  test("no hours_from column, or an unreadable one, reads as from the start date", () => {
    for (const hoursFrom of [undefined, null, "", "not a date"]) {
      expect(
        iso(
          seasonAt("2027-03-14T15:00:00Z", {
            programPlan: { ...SPRING, hoursFrom },
          }),
        ),
      ).toEqual(window("2027-01-01T00:00:00Z", "2027-06-01T00:00:00Z"));
    }
    // A stamp at or past the season's end cannot open a window: the start date.
    const end = new Date("2027-06-01T00:00:00Z");
    expect(
      seasonWindowStart(
        { startsOn: "2027-01-01", hoursFrom: "2027-06-01T00:00:00Z" },
        end,
      ).toISOString(),
    ).toBe("2027-01-01T00:00:00.000Z");
    expect(
      seasonWindowStart(
        { startsOn: "2027-01-01", hoursFrom: "2027-05-31T23:59:59Z" },
        end,
      ).toISOString(),
    ).toBe("2027-05-31T23:59:59.000Z");
  });

  test("the day after a season ends the team has nothing", () => {
    const after = seasonAt("2027-06-01T00:00:00Z");
    expect([after.kind, after.capSeconds]).toEqual(["none", 0]);
    expect(iso(after)).toEqual(
      window("2027-06-01T00:00:00Z", "2027-07-01T00:00:00Z"),
    );
  });

  test("a season that has not started yet grants nothing", () => {
    const early = allowanceFor(
      team({ programPlan: { ...SPRING, startsOn: "2027-02-01" } }),
      new Date("2027-01-31T23:59:59Z"),
    );
    expect(early.kind).toBe("none");
  });

  test("every plan and term names its own hours", () => {
    const hours = (id: string, term: string) =>
      allowanceFor(
        team({
          programPlan: {
            id,
            term,
            startsOn: "2027-01-01",
            endsOn: "2027-12-31",
          } as AllowanceWorkspace["programPlan"],
        }),
        FEB_10,
      ).capSeconds / H;
    expect([
      hours("starter", "spring"),
      hours("starter", "full_year"),
      hours("program", "spring"),
      hours("program", "full_year"),
      hours("elite", "spring"),
      hours("elite", "full_year"),
    ]).toEqual([80, 130, 225, 325, 400, 550]);
    // A plan this build does not know is no plan.
    expect(hours("platinum", "spring")).toBe(0);
  });

  test("a running pilot keeps 75 hours a calendar month", () => {
    const allowance = allowanceFor(team(PILOT), FEB_10);
    expect([allowance.kind, allowance.capSeconds]).toEqual(["pilot", 75 * H]);
    expect(iso(allowance)).toEqual(FEBRUARY);
    expect(allowance.windowed).toBe(true);
    // Its last day counts, to the last instant.
    expect(
      allowanceFor(team(PILOT), new Date("2027-05-31T23:59:59Z")).kind,
    ).toBe("pilot");
    expect(
      allowanceFor(team(PILOT), new Date("2027-06-01T00:00:00Z")).kind,
    ).toBe("none");
  });

  test("a pilot is running only while eligible, dated, and not ended", () => {
    const running = (fields: Partial<AllowanceWorkspace>, now = FEB_10) =>
      pilotIsRunning({ ...PILOT, ...fields }, now);
    expect(running({})).toBe(true);
    expect(running({ pilotEligible: false })).toBe(false);
    expect(running({ pilotEligible: undefined })).toBe(false);
    expect(running({ pilotEndsOn: null })).toBe(false);
    expect(running({ pilotEndsOn: undefined })).toBe(false);
    expect(running({ pilotEndsOn: "2027-02-09" })).toBe(false);
    expect(running({ pilotEndsOn: "2027-02-10" })).toBe(true);
    expect(running({ pilotEndedAt: "2027-02-01T00:00:00Z" })).toBe(false);
    // No pilot runs past May 31, 2027, whatever its own end date says.
    expect(
      running({ pilotEndsOn: "2027-12-31" }, new Date("2027-06-01T00:00:00Z")),
    ).toBe(false);
  });

  test("a season wins over a pilot", () => {
    expect(
      allowanceFor(team({ ...PILOT, programPlan: SPRING }), FEB_10).kind,
    ).toBe("season");
  });

  test("being a college alone no longer grants hours, and neither does the pilot switch without a date", () => {
    for (const workspace of [
      team(),
      team({ orgType: "club" }),
      team({ pilotEligible: true }),
      team({ orgType: "club", pilotEligible: true, pilotEndsOn: null }),
    ]) {
      const allowance = allowanceFor(workspace, FIRST_PLAN_INSTANT);
      expect([allowance.kind, allowance.capSeconds]).toEqual(["none", 0]);
      expect(iso(allowance)).toEqual(JANUARY);
      expect(monthlyCapSecondsFor(workspace, FIRST_PLAN_INSTANT)).toBe(0);
    }
  });

  test("a team never reads a member's plan or override", () => {
    const allowance = allowanceFor(
      team({
        plan: "player-pro",
        videoHoursOverride: 50,
        unlimitedVideo: true,
      }),
      FEB_10,
    );
    expect([allowance.kind, allowance.capSeconds]).toEqual(["none", 0]);
  });
});

test.describe("what the callers do with the answer", () => {
  test("the reset date is the day the window turns over, or null with nothing to come back", () => {
    const resets = (workspace: AllowanceWorkspace, now: Date) =>
      allowanceResetsOn(allowanceFor(workspace, now));
    expect(resets(team(), LAST_BETA_INSTANT)).toBe("Jan 1");
    expect(resets(team(PILOT), FEB_10)).toBe("Mar 1");
    expect(
      resets(
        personal({ plan: "player", planPeriodStart: "2027-01-31T12:00:00Z" }),
        FEB_10,
      ),
    ).toBe("Feb 28");
    // A season's hours expire the day after it ends.
    expect(resets(team({ programPlan: SPRING }), FEB_10)).toBe("Jun 1");
    expect(resets(team(), FEB_10)).toBeNull();
    expect(resets(personal(), FEB_10)).toBeNull();
  });

  test("a ledger read is keyed by month before the date and by window after", () => {
    const calls: [string, string, string][] = [];
    const query = {
      eq(column: string, value: string) {
        calls.push(["eq", column, value]);
        return query;
      },
      gte(column: string, value: string) {
        calls.push(["gte", column, value]);
        return query;
      },
      lt(column: string, value: string) {
        calls.push(["lt", column, value]);
        return query;
      },
    };

    expect(
      scopeToAllowance(query, allowanceFor(team(), LAST_BETA_INSTANT)),
    ).toBe(query);
    expect(calls).toEqual([["eq", "billing_month", "2026-12-01"]]);

    calls.length = 0;
    const season = allowanceFor(team({ programPlan: SPRING }), FEB_10);
    scopeToAllowance(query, season);
    expect(calls).toEqual([
      ["gte", "created_at", "2027-01-01T00:00:00.000Z"],
      ["lt", "created_at", "2027-06-01T00:00:00.000Z"],
    ]);
    expect(windowArgs(season)).toEqual({
      p_window_start: "2027-01-01T00:00:00.000Z",
      p_window_end: "2027-06-01T00:00:00.000Z",
    });
  });

  test("a team's refusal names the real reset date, or none", () => {
    const base = {
      neededSeconds: 2 * H,
      remainingSeconds: H,
      capSeconds: 80 * H,
    };
    expect(capRefusalMessage(base)).toContain(
      "It resets at the start of next month; a shorter trim will fit sooner.",
    );
    expect(capRefusalMessage({ ...base, resetsOn: "Jun 1" })).toContain(
      "It resets on Jun 1; a shorter trim will fit sooner.",
    );
    const none = capRefusalMessage({ ...base, capSeconds: 0, resetsOn: null });
    expect(none).not.toContain("resets");
    expect(none).toMatch(/\(0 min\)\.$/);
  });
});
