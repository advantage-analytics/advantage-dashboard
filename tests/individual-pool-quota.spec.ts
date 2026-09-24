import { expect, test } from "@playwright/test";

import {
  getIndividualPoolCapSeconds,
  INDIVIDUAL_POOL_PLAYER_LIMIT,
} from "@/lib/services/splitstep/config";
import {
  peekRefusalMessage,
  pickPeek,
  quotaTierFor,
  type QuotaPeek,
} from "@/lib/services/splitstep/quota";

/**
 * The individual tier's shared pool, without a database: which limit a peek
 * reports and what the refusal says. The atomic half is
 * `reserve_individual_pool_quota` (20260924193000_individual_pool_quota.sql).
 */

const HOUR = 3600;
const POOL_CAP = getIndividualPoolCapSeconds();

function own(usedSeconds: number, capSeconds = 2 * HOUR): QuotaPeek {
  return {
    usedSeconds,
    capSeconds,
    remainingSeconds: Math.max(0, capSeconds - usedSeconds),
    limit: "account",
  };
}

test("the pool is 10 hours for 20 players", () => {
  expect(POOL_CAP).toBe(10 * HOUR);
  expect(INDIVIDUAL_POOL_PLAYER_LIMIT).toBe(20);
});

test("personal workspaces and custom orgs draw from the pool; colleges do not", () => {
  expect(quotaTierFor({ kind: "personal", orgType: null })).toBe("individual");
  expect(quotaTierFor({ kind: "team", orgType: "club" })).toBe("individual");
  expect(quotaTierFor({ kind: "team", orgType: "college" })).toBe("program");
});

test("with room in the pool, a player's own cap is the limit", () => {
  const peek = pickPeek(own(HOUR), {
    pool_used_seconds: 2 * HOUR,
    player_count: 5,
    is_player: true,
  });
  expect(peek.limit).toBe("account");
  expect(peek.remainingSeconds).toBe(HOUR);
});

test("a nearly spent pool caps a player who still has their own hours", () => {
  const peek = pickPeek(own(0), {
    pool_used_seconds: POOL_CAP - 30 * 60,
    player_count: 12,
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

test("a 21st player is refused however much time is left", () => {
  const peek = pickPeek(own(0), {
    pool_used_seconds: 0,
    player_count: 20,
    is_player: false,
  });
  expect(peek.limit).toBe("pool_players");
  expect(peekRefusalMessage(peek, 60)).toContain(
    "limited to 20 individual players",
  );
});

test("one of the 20 keeps their place when the limit is full", () => {
  const peek = pickPeek(own(0), {
    pool_used_seconds: 0,
    player_count: 20,
    is_player: true,
  });
  expect(peek.limit).toBe("account");
});

test("no pool refusal mentions splitstep", () => {
  for (const limit of ["pool_hours", "pool_players"] as const) {
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
