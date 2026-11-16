import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  showsVerificationPending,
  verificationPendingFor,
} from "@/lib/data/match-verification";
import {
  loadVerificationPending,
  withVerificationPending,
} from "@/lib/data/match-verification-server";
import { transformDbMatch, type DbMatch } from "@/lib/data/matches-list-types";
import { groupMatchesIntoEvents } from "@/lib/data/home-recent-data";
import { LABEL_QUEUE_FROM } from "@/lib/services/labels/queue";

/**
 * "Verification pending" (T41): the pure rule, the never-fatal loader over
 * `match_label_states`, and the three surfaces that carry the flag. No
 * database — the loader is driven through a stub client.
 */

const CUTOFF = Date.parse(LABEL_QUEUE_FROM);
const iso = (ms: number) => new Date(ms).toISOString();

test.describe("verificationPendingFor", () => {
  test("before the cut-off is not pending", () => {
    expect(
      verificationPendingFor({
        results_at: iso(CUTOFF - 1000),
        has_video: true,
        labelling: false,
      }),
    ).toBe(false);
  });

  test("at the cut-off is pending", () => {
    expect(
      verificationPendingFor({
        results_at: LABEL_QUEUE_FROM,
        has_video: true,
        labelling: false,
      }),
    ).toBe(true);
    expect(
      verificationPendingFor({
        results_at: iso(CUTOFF + 86_400_000),
        has_video: true,
        labelling: false,
      }),
    ).toBe(true);
  });

  test("no video is never pending, labelling or not", () => {
    expect(
      verificationPendingFor({
        results_at: iso(CUTOFF + 1000),
        has_video: false,
        labelling: false,
      }),
    ).toBe(false);
    expect(
      verificationPendingFor({
        results_at: iso(CUTOFF + 1000),
        has_video: false,
        labelling: true,
      }),
    ).toBe(false);
  });

  test("labelling before the cut-off is pending", () => {
    expect(
      verificationPendingFor({
        results_at: iso(CUTOFF - 30 * 86_400_000),
        has_video: true,
        labelling: true,
      }),
    ).toBe(true);
  });

  test("no state, or no results yet, is not pending", () => {
    expect(verificationPendingFor(null)).toBe(false);
    expect(
      verificationPendingFor({
        results_at: null,
        has_video: true,
        labelling: false,
      }),
    ).toBe(false);
  });

  test("the cut-off is imported, not a second literal", () => {
    const source = readFileSync("src/lib/data/match-verification.ts", "utf8");
    expect(source).toContain(
      'import { LABEL_QUEUE_FROM } from "@/lib/services/labels/queue"',
    );
    expect(source).not.toContain("2026-10-29");
  });
});

test.describe("showsVerificationPending", () => {
  test("never on a verified match", () => {
    expect(
      showsVerificationPending({
        verification: { verifiedAt: "2026-11-10T00:00:00Z" },
        pending: true,
      }),
    ).toBe(false);
  });

  test("never while analysis is in flight or statistics were refused", () => {
    expect(
      showsVerificationPending({
        verification: null,
        pending: true,
        analysis: { status: "processing" },
      }),
    ).toBe(false);
    expect(
      showsVerificationPending({
        verification: null,
        pending: true,
        analysis: {
          status: "derivation_failed",
          recovery: "stats_unavailable",
        },
      }),
    ).toBe(false);
  });

  test("an unverified, ready, pending match shows it", () => {
    expect(
      showsVerificationPending({
        verification: null,
        pending: true,
        analysis: { status: "completed" },
      }),
    ).toBe(true);
    expect(
      showsVerificationPending({ verification: null, pending: true }),
    ).toBe(true);
  });
});

/** A client whose `rpc` is the stub; nothing else is reachable. */
function stubClient(
  rpc: (fn: string, args: { p_match_ids: string[] }) => unknown,
): SupabaseClient {
  return { rpc } as unknown as SupabaseClient;
}

test.describe("loadVerificationPending", () => {
  test("keeps only pending matches, through match_label_states", async () => {
    const calls: { fn: string; ids: string[] }[] = [];
    const supabase = stubClient(async (fn, args) => {
      calls.push({ fn, ids: args.p_match_ids });
      return {
        data: [
          {
            match_id: "a",
            results_at: iso(CUTOFF + 1000),
            has_video: true,
            labelling: false,
          },
          {
            match_id: "b",
            results_at: iso(CUTOFF - 1000),
            has_video: true,
            labelling: false,
          },
        ],
        error: null,
      };
    });
    const pending = await loadVerificationPending(supabase, ["a", "b", "c"]);
    expect([...pending]).toEqual(["a"]);
    expect(calls).toEqual([{ fn: "match_label_states", ids: ["a", "b", "c"] }]);
  });

  test("batches a long list instead of calling per row", async () => {
    const sizes: number[] = [];
    const supabase = stubClient(async (_fn, args) => {
      sizes.push(args.p_match_ids.length);
      return { data: [], error: null };
    });
    const ids = Array.from({ length: 1200 }, (_, i) => `m${i}`);
    await loadVerificationPending(supabase, ids);
    expect(sizes).toEqual([500, 500, 200]);
  });

  test("no ids, no call", async () => {
    let called = false;
    const supabase = stubClient(async () => {
      called = true;
      return { data: [], error: null };
    });
    expect((await loadVerificationPending(supabase, [])).size).toBe(0);
    expect(called).toBe(false);
  });

  test("a missing function reads as nothing pending, logged once", async () => {
    const warnings: unknown[][] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args);
    try {
      const supabase = stubClient(async () => ({
        data: null,
        error: {
          code: "PGRST202",
          message: "Could not find the function public.match_label_states",
        },
      }));
      const first = await loadVerificationPending(supabase, ["a"]);
      const second = await loadVerificationPending(supabase, ["a", "b"]);
      expect(first.size).toBe(0);
      expect(second.size).toBe(0);
      expect(warnings).toHaveLength(1);
    } finally {
      console.warn = warn;
    }
  });

  test("a thrown call does not throw", async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const supabase = stubClient(async () => {
        throw new Error("network down");
      });
      await expect(loadVerificationPending(supabase, ["a"])).resolves.toEqual(
        new Set(),
      );
    } finally {
      console.warn = warn;
    }
  });

  test("the loader never reaches for the service role", () => {
    for (const file of [
      "src/lib/data/match-verification-server.ts",
      "src/lib/data/home-recent-data.ts",
    ]) {
      expect(readFileSync(file, "utf8")).not.toContain("createAdminClient");
    }
  });
});

const listRow = (
  id: string,
  verified: boolean,
): DbMatch & { player2_id: null; created_by: string } => ({
  id,
  player1_id: "viewer",
  player1_name: "Me",
  player2_name: "Opp",
  tournament_name: "Fall Open",
  round: null,
  date: "2026-11-01T12:00:00Z",
  score: { player1: [6, 6], player2: [3, 4] },
  result: null,
  match_type: null,
  court_type: null,
  verified,
  verified_at: verified ? "2026-11-05T00:00:00Z" : null,
  duration: null,
  player2_id: null,
  created_by: "viewer",
});

test.describe("matches list rows", () => {
  test("start false, and stay false once verified", async () => {
    const rows = [listRow("a", false), listRow("b", true), listRow("c", false)];
    const display = rows.map((r) => transformDbMatch(r, "viewer")!);
    expect(display.every((m) => m.verificationPending === false)).toBe(true);
    display[2].analysis = {
      status: "derivation_failed",
      recovery: "stats_unavailable",
    } as NonNullable<(typeof display)[number]["analysis"]>;
    const out = await withVerificationPending(
      Promise.resolve(display),
      Promise.resolve(new Set(["a", "b", "c"])),
    );
    expect(out.map((m) => [m.id, m.verificationPending])).toEqual([
      ["a", true],
      ["b", false],
      ["c", false],
    ]);
  });
});

test.describe("Home recent rows", () => {
  const recent = (id: string, verified: boolean) => ({
    ...listRow(id, verified),
    opponent_hand: null,
    opponent_backhand: null,
  });

  test("an event is pending when not all verified and one is pending", () => {
    const [event] = groupMatchesIntoEvents(
      [recent("a", true), recent("b", false)],
      ["viewer"],
      "viewer",
      new Map(),
      new Map(),
      undefined,
      new Set(["b"]),
    );
    expect(event.verification).toBeNull();
    expect(event.verificationPending).toBe(true);
    expect(event.matches.map((m) => [m.id, m.verificationPending])).toEqual([
      ["a", false],
      ["b", true],
    ]);
  });

  test("not pending when none of its matches is", () => {
    const [event] = groupMatchesIntoEvents(
      [recent("a", true), recent("b", false)],
      ["viewer"],
      "viewer",
      new Map(),
      new Map(),
    );
    expect(event.verificationPending).toBe(false);
  });

  test("never pending once every match is verified", () => {
    const [event] = groupMatchesIntoEvents(
      [recent("a", true), recent("b", true)],
      ["viewer"],
      "viewer",
      new Map(),
      new Map(),
      undefined,
      new Set(["a", "b"]),
    );
    expect(event.verification).not.toBeNull();
    expect(event.verificationPending).toBe(false);
  });

  test("an analysing match is not pending", () => {
    const [event] = groupMatchesIntoEvents(
      [recent("b", false)],
      ["viewer"],
      "viewer",
      new Map(),
      new Map([["b", "processing"]]),
      undefined,
      new Set(["b"]),
    );
    expect(event.verificationPending).toBe(false);
  });
});
