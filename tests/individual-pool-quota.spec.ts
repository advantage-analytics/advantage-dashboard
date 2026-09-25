import { expect, test } from "@playwright/test";

import {
  getIndividualPoolCapSeconds,
  getOpenBetaCeilingSeconds,
} from "@/lib/services/splitstep/config";
import {
  peekRefusalMessage,
  pickPeek,
  quotaTierFor,
  type QuotaPeek,
} from "@/lib/services/splitstep/quota";

/**
 * The individual tier's shared bands, without a database: which limit a peek
 * reports and what the refusal says. The atomic half is
 * `reserve_individual_quota` (20260925043000_individual_open_tier.sql).
 */

const HOUR = 3600;
const POOL_CAP = getIndividualPoolCapSeconds();
const OPEN_CAP = getOpenBetaCeilingSeconds();

function own(usedSeconds: number, capSeconds = 2 * HOUR): QuotaPeek {
  return {
    usedSeconds,
    capSeconds,
    remainingSeconds: Math.max(0, capSeconds - usedSeconds),
    limit: "account",
  };
}

test("the pool is 10 hours", () => {
  expect(POOL_CAP).toBe(10 * HOUR);
});

test("personal workspaces and custom orgs draw from the pool; colleges do not", () => {
  expect(quotaTierFor({ kind: "personal", orgType: null })).toBe("individual");
  expect(quotaTierFor({ kind: "team", orgType: "club" })).toBe("individual");
  expect(quotaTierFor({ kind: "team", orgType: "college" })).toBe("program");
});

test("with room in the pool, a player's own cap is the limit", () => {
  const peek = pickPeek(own(HOUR), {
    pilot_used_seconds: 2 * HOUR,
    open_used_seconds: 0,
    is_player: true,
  });
  expect(peek.limit).toBe("account");
  expect(peek.remainingSeconds).toBe(HOUR);
});

test("a nearly spent pool caps a player who still has their own hours", () => {
  const peek = pickPeek(own(0), {
    pilot_used_seconds: POOL_CAP - 30 * 60,
    open_used_seconds: 0,
    is_player: true,
  });
  expect(peek.limit).toBe("pool_hours");
  expect(peek.remainingSeconds).toBe(30 * 60);
  expect(peekRefusalMessage(peek, 45 * 60)).toBe(
    "This match needs 45 min of analysis but only 30 min is left in this " +
      "month's shared allowance for individual players. It resets at the " +
      "start of next month; a shorter trim will fit sooner.",
  );
  expect(peekRefusalMessage(peek, 30 * 60)).toBeNull();
});

test("someone off the pilot list gets their own 2 hours", () => {
  const peek = pickPeek(own(0), {
    pilot_used_seconds: POOL_CAP,
    open_used_seconds: 0,
    is_player: false,
  });
  expect(peek.limit).toBe("account");
  expect(peek.remainingSeconds).toBe(2 * HOUR);
  expect(peekRefusalMessage(peek, HOUR)).toBeNull();
});

test("a pilot player is not held to the open ceiling", () => {
  const peek = pickPeek(own(0), {
    pilot_used_seconds: 0,
    open_used_seconds: OPEN_CAP,
    is_player: true,
  });
  expect(peek.limit).toBe("account");
});

test("a spent open ceiling refuses everyone off the pilot list", () => {
  const peek = pickPeek(own(0), {
    pilot_used_seconds: 0,
    open_used_seconds: OPEN_CAP,
    is_player: false,
  });
  expect(peek.limit).toBe("open_hours");
  expect(peek.remainingSeconds).toBe(0);
  expect(peekRefusalMessage(peek, 60)).toContain("fully booked");
  expect(peekRefusalMessage(peek, 60)).toContain("SwingVision");
});

test("no pool refusal mentions splitstep", () => {
  for (const limit of ["pool_hours", "open_hours"] as const) {
    const message = peekRefusalMessage(
      {
        usedSeconds: POOL_CAP,
        capSeconds: POOL_CAP,
        remainingSeconds: 0,
        limit,
      },
      600,
    );
    expect(message?.toLowerCase()).not.toContain("splitstep");
  }
});
