import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getActivityFeed } from "@/lib/data/activity-server";
import type { Workspace } from "@/lib/workspace/types";

/**
 * The header activity tray's failed rows carry their recovery class from the
 * server — the tray only subscribes to live patches while something is
 * live-updating, so a failure that settled before the page loaded never gets
 * a patch to decide it. Offline: a fake chainable query builder stands in for
 * Supabase and resolves the fixture rows below, newest first, as the real
 * query orders them.
 */

const MATCH = {
  noVideo: "match-no-video",
  rejected: "match-rejected",
  plain: "match-plain",
  ceiling: "match-ceiling",
  crash: "match-crash",
  refusal: "match-refusal",
} as const;

/** Storage-key values that must never reach an item. */
const VIDEO_KEY = (n: number) => `uploads/fixture-video-${n}.mp4`;
const RESULTS_KEY = (n: number) => `results/fixture-results-${n}.json`;

let seq = 0;
function row(
  matchId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  seq++;
  // Descending timestamps: rows are declared newest first.
  const at = new Date(Date.UTC(2026, 8, 28, 12, 0, 0) - seq * 60_000)
    .toISOString()
    .replace(".000Z", "Z");
  return {
    id: `job-${seq}`,
    match_id: matchId,
    status: "failed",
    upload_progress_percent: null,
    derivation_version: null,
    created_at: at,
    updated_at: at,
    error_code: null,
    error_category: null,
    error_step: null,
    video_object_key: VIDEO_KEY(seq),
    results_object_key: null,
    resubmitted_from_job_id: null,
    external_job_id: `ext-${seq}`,
    matches: {
      player1_name: "Maya Reid",
      player2_name: "Jin Park",
      program_id: null,
    },
    ...overrides,
  };
}

const ceilingNewest = row(MATCH.ceiling, {
  id: "ceiling-3",
  resubmitted_from_job_id: "ceiling-2",
});
const ceilingMiddle = row(MATCH.ceiling, {
  id: "ceiling-2",
  resubmitted_from_job_id: "ceiling-1",
});
const ceilingRoot = row(MATCH.ceiling, { id: "ceiling-1" });

const ROWS = [
  row(MATCH.noVideo, { video_object_key: null }),
  row(MATCH.rejected, {
    error_category: "invalid_input",
    error_code: "LOW_FPS",
  }),
  row(MATCH.plain, { error_code: "INTERNAL_ERROR" }),
  ceilingNewest,
  ceilingMiddle,
  ceilingRoot,
  row(MATCH.crash, {
    status: "derivation_failed",
    error_code: "DERIVATION_ERROR",
    derivation_version: "0.3.2",
    results_object_key: RESULTS_KEY(1),
  }),
  row(MATCH.refusal, {
    status: "derivation_failed",
    error_code: "DERIVATION_UNRECONCILED",
    derivation_version: "0.3.2",
    results_object_key: RESULTS_KEY(2),
  }),
  // An older attempt of a match already listed — must not add a second item.
  row(MATCH.plain, { error_code: "VIDEO_UNREACHABLE" }),
];

/** Every chained filter returns the builder; awaiting it yields the rows. */
function fakeClient(rows: unknown[]): {
  client: SupabaseClient;
  selects: string[];
} {
  const selects: string[] = [];
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = (columns: string) => {
    selects.push(columns);
    return builder;
  };
  builder.order = chain;
  builder.limit = chain;
  builder.eq = chain;
  builder.is = chain;
  builder.then = (
    resolve: (value: { data: unknown[]; error: null }) => unknown,
  ) => Promise.resolve({ data: rows, error: null }).then(resolve);
  const client = { from: () => builder } as unknown as SupabaseClient;
  return { client, selects };
}

const WORKSPACE = {
  id: "viewer-1",
  kind: "personal",
  name: "Personal",
} as unknown as Workspace;

test.describe("getActivityFeed carries each failed row's recovery class", () => {
  test("one item per match, classed per fixture", async () => {
    const { client, selects } = fakeClient(ROWS);
    const { items } = await getActivityFeed(client, WORKSPACE);

    expect(items.map((item) => item.matchId)).toEqual(Object.values(MATCH));

    const byMatch = new Map(items.map((item) => [item.matchId, item]));
    expect(byMatch.get(MATCH.noVideo)?.analysis.recovery).toBe("upload_again");
    expect(byMatch.get(MATCH.rejected)?.analysis.recovery).toBe(
      "fix_recording",
    );
    expect(byMatch.get(MATCH.plain)?.analysis.recovery).toBe("retry");
    expect(byMatch.get(MATCH.ceiling)?.analysis.recovery).toBe("wait_or_ask");
    expect(byMatch.get(MATCH.crash)?.analysis.recovery).toBe("rederive");
    expect(byMatch.get(MATCH.refusal)?.analysis.recovery).toBe(
      "stats_unavailable",
    );

    // What `withLiveAnalysis` re-decides against after a live resubmit.
    const ceiling = byMatch.get(MATCH.ceiling)!.analysis;
    expect(ceiling.jobId).toBe("ceiling-3");
    expect(ceiling.attemptsUsed).toBe(3);
    // The code only — `waitOrAskVariant()`'s input.
    expect(byMatch.get(MATCH.plain)?.analysis.errorCode).toBe("INTERNAL_ERROR");

    // The join stays inner and the message is never read.
    expect(selects[0]).toContain(
      "matches!inner(player1_name, player2_name, program_id)",
    );
    expect(selects[0]).not.toContain("error_message");
  });

  test("no storage key and no note reaches an item", async () => {
    const { client } = fakeClient(ROWS);
    const { items } = await getActivityFeed(client, WORKSPACE);
    const json = JSON.stringify(items);

    expect(json).not.toContain("object_key");
    for (const fixture of ROWS) {
      for (const key of ["video_object_key", "results_object_key"]) {
        const value = fixture[key];
        if (typeof value === "string") expect(json).not.toContain(value);
      }
    }
    expect(json).not.toContain('"note"');
    expect(json).not.toContain("failNote");
  });
});
