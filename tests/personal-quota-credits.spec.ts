import { expect, test } from "@playwright/test";

import { freeHoursReturnOn } from "@/lib/services/splitstep/config";
import {
  buildPeek,
  monthlyCapSecondsFor,
  peekRefusalMessage,
  personalRefusalMessage,
  quotaTierFor,
  splitSpend,
} from "@/lib/services/splitstep/quota";
import { smallestPackCovering } from "@/lib/services/credits/packs";

/**
 * A player's hours without a database: free hours first, then credits, and
 * what the refusal says. There is no shared house band any more (Cj,
 * 2026-10-16). The atomic half is `reserve_personal_quota`
 * (20261016123934_video_credits_ledger.sql).
 */

const HOUR = 3600;
const PERSONAL = { kind: "personal" } as const;
const TEAM = { kind: "team" } as const;

test("a pilot's personal workspace gets 10 hours; nothing else changes", () => {
  expect(
    monthlyCapSecondsFor({
      kind: "personal",
      orgType: null,
      individualPilot: true,
    }),
  ).toBe(10 * HOUR);
  expect(
    monthlyCapSecondsFor({
      kind: "personal",
      orgType: null,
      individualPilot: false,
    }),
  ).toBe(2 * HOUR);
  expect(monthlyCapSecondsFor({ kind: "personal", orgType: null })).toBe(
    2 * HOUR,
  );
  // A team never takes the pilot figure, even if the flag were set on it.
  expect(
    monthlyCapSecondsFor({
      kind: "team",
      orgType: "club",
      individualPilot: true,
    }),
  ).toBe(2 * HOUR);
  expect(monthlyCapSecondsFor({ kind: "team", orgType: "college" })).toBe(
    75 * HOUR,
  );
});

test("personal workspaces and custom orgs take the individual figure; colleges do not", () => {
  expect(quotaTierFor({ kind: "personal", orgType: null })).toBe("individual");
  expect(quotaTierFor({ kind: "team", orgType: "club" })).toBe("individual");
  expect(quotaTierFor({ kind: "team", orgType: "college" })).toBe("program");
});

test("an admin-granted pilot_eligible custom org takes the program figure; nothing else reads the flag", () => {
  // The grant: a club on the program figure, exactly as a college is.
  expect(
    quotaTierFor({ kind: "team", orgType: "club", pilotEligible: true }),
  ).toBe("program");
  expect(
    monthlyCapSecondsFor({
      kind: "team",
      orgType: "high_school",
      pilotEligible: true,
    }),
  ).toBe(75 * HOUR);
  // Explicitly false, or a constructor that never read the column: the
  // reduced figure — fail closed.
  expect(
    quotaTierFor({ kind: "team", orgType: "club", pilotEligible: false }),
  ).toBe("individual");
  expect(quotaTierFor({ kind: "team", orgType: "academy" })).toBe("individual");
  // The flag is a team fact; a personal workspace carrying it is ignored.
  expect(
    quotaTierFor({ kind: "personal", orgType: null, pilotEligible: true }),
  ).toBe("individual");
  expect(
    monthlyCapSecondsFor({
      kind: "personal",
      orgType: null,
      pilotEligible: true,
    }),
  ).toBe(2 * HOUR);
  // A college never needs it and is unchanged with or without it.
  expect(
    quotaTierFor({ kind: "team", orgType: "college", pilotEligible: false }),
  ).toBe("program");
});

test("free hours come first, then credits, and both count toward what fits", () => {
  const peek = buildPeek(HOUR + 36 * 60, 2 * HOUR, 3 * HOUR);
  expect(peek.freeRemainingSeconds).toBe(24 * 60);
  expect(peek.creditSeconds).toBe(3 * HOUR);
  expect(peek.remainingSeconds).toBe(3 * HOUR + 24 * 60);
  expect(peekRefusalMessage(peek, HOUR + 12 * 60, PERSONAL)).toBeNull();

  const split = splitSpend(peek, HOUR + 12 * 60);
  expect(split).toEqual({
    freeSeconds: 24 * 60,
    creditSeconds: 48 * 60,
    shortBySeconds: 0,
    fits: true,
  });
});

test("a video longer than free hours plus credits is short by the difference", () => {
  const peek = buildPeek(HOUR + 36 * 60, 2 * HOUR, 0);
  const split = splitSpend(peek, HOUR + 12 * 60);
  expect(split.fits).toBe(false);
  expect(split.shortBySeconds).toBe(48 * 60);
  // The paywall pre-selects the smallest pack that covers it.
  expect(smallestPackCovering(split.shortBySeconds).id).toBe("1h");
  expect(smallestPackCovering(90 * 60).id).toBe("5h");
  expect(smallestPackCovering(9 * HOUR).id).toBe("5h");
});

test("a personal refusal names the next step, never an allowance", () => {
  const october = new Date("2026-10-16T12:00:00Z");
  const message = personalRefusalMessage({
    neededSeconds: HOUR + 12 * 60,
    remainingSeconds: 24 * 60,
    now: october,
  });
  expect(message).toBe(
    "This video needs 1h 12m. You have 24m left. Add hours on Settings › " +
      "Plan to send it now, shorten the trim, or wait for your free hours on Nov 1.",
  );
  expect(message).not.toContain("allowance");
  expect(
    personalRefusalMessage({
      neededSeconds: 60,
      remainingSeconds: 0,
      now: october,
    }),
  ).toMatch(/^You're out of video hours\./);
});

test("in December free hours end rather than reset, so nobody is told to wait", () => {
  const december = new Date("2026-12-10T12:00:00Z");
  expect(freeHoursReturnOn(december)).toBeNull();
  expect(freeHoursReturnOn(new Date("2026-11-30T23:00:00Z"))).toBe("Dec 1");
  expect(
    personalRefusalMessage({
      neededSeconds: HOUR,
      remainingSeconds: 0,
      now: december,
    }),
  ).toBe(
    "You're out of video hours. Add hours on Settings › Plan to send it now, or shorten the trim.",
  );
});

test("a team refusal keeps its allowance wording and never offers credits", () => {
  const peek = buildPeek(74 * HOUR, 75 * HOUR, 0);
  const message = peekRefusalMessage(peek, 2 * HOUR, TEAM);
  expect(message).toContain("monthly allowance");
  expect(message).not.toContain("Plan");
});

test("no refusal mentions splitstep or a shared booking", () => {
  const messages = [
    peekRefusalMessage(buildPeek(2 * HOUR, 2 * HOUR, 0), 600, PERSONAL),
    peekRefusalMessage(buildPeek(75 * HOUR, 75 * HOUR, 0), 600, TEAM),
  ];
  for (const message of messages) {
    expect(message?.toLowerCase()).not.toContain("splitstep");
    expect(message?.toLowerCase()).not.toContain("fully booked");
  }
});
