import { expect, test } from "@playwright/test";

import {
  ANALYSIS_LABEL,
  STATUS_MAP,
  analysisAction,
  isAnalysisFailed,
  isAnalysisReady,
  isInFlight,
  isLiveUpdating,
  isStalled,
  isWorking,
  jobTimingFields,
  matchListGroup,
  pipelinePercent,
  resolveAnalysisStatus,
  withStatsPublished,
  type MatchAnalysis,
  type RecoveryClass,
} from "@/lib/data/match-analysis";
import type {
  LiveAnalysisPatch,
  LiveJobRow,
} from "@/hooks/use-live-match-analysis";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The `timeline` state: a verified point-by-point transcript with no published
 * aggregate statistics.
 *
 * These assertions exist because the failure they guard against is silent. The
 * match page renders every section or none, and every aggregate coerces an
 * absent statistic to 0 on the way to the screen — so getting this wrong prints
 * "0 aces" for a match nobody measured aces on, which reads as a fact about the
 * player.
 */

test.describe("withStatsPublished", () => {
  test("a completed match with no statistics becomes timeline", () => {
    expect(withStatsPublished("completed", false)).toBe("timeline");
  });

  test("a completed match with statistics stays completed", () => {
    expect(withStatsPublished("completed", true)).toBe("completed");
  });

  test("it never promotes a match that has not finished", () => {
    // Only `completed` is eligible. Downgrading anything else would claim a
    // transcript exists for a job that is still running or has failed.
    for (const status of [
      "uploading",
      "uploaded",
      "queued",
      "processing",
      "deriving",
      "processed",
      "failed",
      "derivation_failed",
      "imported",
      "manual",
      "cancelled",
    ] as const) {
      expect(withStatsPublished(status, false)).toBe(status);
      expect(withStatsPublished(status, true)).toBe(status);
    }
  });
});

test.describe("the timeline state is terminal and renderable", () => {
  test("it is neither in flight nor failed, so the page renders its sections", () => {
    // The match page short-circuits to the progress card on
    // `isInFlight || isAnalysisFailed`. If `timeline` landed in either set, a
    // fully transcribed match would show nothing at all.
    expect(isInFlight("timeline")).toBe(false);
    expect(isAnalysisFailed("timeline")).toBe(false);
  });

  test("it reads as what is present, not as what is missing", () => {
    expect(ANALYSIS_LABEL.timeline).toBe("Timeline ready");
    // Distinct from both neighbours, which mean different things.
    expect(ANALYSIS_LABEL.timeline).not.toBe(ANALYSIS_LABEL.completed);
    expect(ANALYSIS_LABEL.timeline).not.toBe(ANALYSIS_LABEL.processed);
  });
});

test.describe("resolveAnalysisStatus is unchanged", () => {
  test("it still knows nothing about statistics", () => {
    // It projects a processing_jobs row and only that, because the realtime
    // hook calls it over a websocket with no access to match_stats. A caller
    // that cannot answer the statistics question must not guess.
    expect(resolveAnalysisStatus("completed", null)).toBe("processed");
    expect(resolveAnalysisStatus("completed", "0.2.0-transcript")).toBe(
      "completed",
    );
    expect(resolveAnalysisStatus("deriving", null)).toBe("deriving");
    expect(resolveAnalysisStatus("nonsense", null)).toBeUndefined();
  });
});

/**
 * `processed` is in flight and nothing is coming for it — and Team Home has to
 * ask the second question, not the first.
 *
 * The same silent-failure shape as the block above. `processed` is where every
 * vendor-analysed match rests until Phase 2 derivation ships, so a surface that
 * asks `isInFlight` treats the ORDINARY state as the exceptional one: Team
 * Home's match rows withheld a score they had known since the upload wizard,
 * and the first-report card promised a notification no process was ever going
 * to send. Nothing looked broken on either — they just quietly said the wrong
 * thing about most of the program's matches.
 *
 * These assertions pin the distinction the fix rests on. If `processed` is ever
 * moved out of IN_FLIGHT, or STALLED is emptied when Phase 2 lands, this block
 * fails and points at the surfaces that have to be revisited together.
 */
test.describe("processed: in flight, but no update is coming", () => {
  test("the three predicates give three different answers", () => {
    // Will it ever change? Yes — when Phase 2 ships.
    expect(isInFlight("processed")).toBe(true);
    // Is anything running right now? No.
    expect(isWorking("processed")).toBe(false);
    // Is a database update actually coming? No — only a deploy moves it.
    expect(isLiveUpdating("processed")).toBe(false);
  });

  test("it is the only in-flight status that is not live-updating", () => {
    // `uploaded` is the near neighbour and the reason this is a set rather
    // than a second `&&`: also idle, but auto-submit moves it within seconds,
    // so it must keep its dot and its counter.
    expect(isWorking("uploaded")).toBe(false);
    expect(isLiveUpdating("uploaded")).toBe(true);

    for (const status of [
      "uploading",
      "queued",
      "processing",
      "deriving",
    ] as const) {
      expect(isLiveUpdating(status)).toBe(true);
    }
  });

  test("the settled question separates it from the states that are running", () => {
    // `!isLiveUpdating && !isAnalysisFailed` is Team Home's `settled` in
    // `match-rows.tsx`. Spelled out here as a table because the row it decides
    // shows a result or hides one, and `isInFlight` in its place is a bug that
    // renders perfectly.
    const settled = (status: Parameters<typeof isLiveUpdating>[0]) =>
      !isLiveUpdating(status) && !isAnalysisFailed(status);

    for (const status of [
      "processed",
      "completed",
      "timeline",
      "imported",
      "manual",
    ] as const) {
      expect(settled(status)).toBe(true);
    }
    for (const status of [
      "uploading",
      "uploaded",
      "queued",
      "processing",
      "deriving",
    ] as const) {
      expect(settled(status)).toBe(false);
    }
    // A failed job keeps its dot even though no update is coming for it.
    for (const status of ["failed", "derivation_failed"] as const) {
      expect(settled(status)).toBe(false);
    }
  });
});

/**
 * A failed row's action follows its `recovery` class rather than a blanket
 * "Start over". "Start over" sends the player through the upload wizard as
 * if no video had ever landed — right for `upload_again`, but wrong for a
 * row that already has a video and only needs a retry, a rebuild, or has
 * nothing to press at all. Offering "Start over" there would spend a second
 * video upload on a job that never needed one.
 */
test.describe("analysisAction: failed row follows the recovery class", () => {
  const matchId = "m1";
  const baseFailed: MatchAnalysis = {
    status: "failed",
    providerId: null,
  };

  test("upload_again and fix_recording get the Add video action", () => {
    for (const recovery of ["upload_again", "fix_recording"] as const) {
      const action = analysisAction({ ...baseFailed, recovery }, matchId);
      expect(action?.label).toBe("Add video");
      expect(action?.href).toBe(`/dashboard/matches/new?match=${matchId}`);
    }
  });

  test("retry and rederive get a View-the-match action", () => {
    for (const recovery of ["retry", "rederive"] as const) {
      const action = analysisAction({ ...baseFailed, recovery }, matchId);
      expect(action?.label).toBe("View match");
      expect(action?.href).toBe(`/dashboard/matches/${matchId}`);
    }
  });

  test("stats_unavailable gets View stats", () => {
    const action = analysisAction(
      { ...baseFailed, recovery: "stats_unavailable" },
      matchId,
    );
    expect(action?.label).toBe("View stats");
    expect(action?.href).toBe(`/dashboard/matches/${matchId}`);
  });

  test("wait_or_ask points at the match page rather than a dead button", () => {
    // Nothing to press now — an allowance or attempt ceiling clears on its
    // own — so this offers the page that carries the stored note, not
    // "Start over" (which would misrepresent this as fixable by resubmitting).
    const action = analysisAction(
      { ...baseFailed, recovery: "wait_or_ask" },
      matchId,
    );
    expect(action?.label).toBe("View match");
    expect(action?.href).toBe(`/dashboard/matches/${matchId}`);
  });

  test('"Start over" is not returned for a failed row that has a video', () => {
    // Any recovery class other than upload_again implies a video exists
    // (the loader only sets upload_again when hasVideo is false). None of
    // those classes should ever produce "Start over".
    const classesWithVideo: RecoveryClass[] = [
      "fix_recording",
      "retry",
      "rederive",
      "stats_unavailable",
      "wait_or_ask",
    ];
    for (const recovery of classesWithVideo) {
      const action = analysisAction({ ...baseFailed, recovery }, matchId);
      expect(action?.label).not.toBe("Start over");
    }
  });

  test("no recovery set falls back to today's Start over", () => {
    // The loader could not classify the row (see MatchAnalysis.recovery's
    // doc comment) — guessing an action would be worse than the fallback.
    const action = analysisAction(baseFailed, matchId);
    expect(action?.label).toBe("Start over");
    expect(action?.href).toBe("/dashboard/matches/new");
  });
});

test.describe("cancelled: settled, never analysed, never Ready", () => {
  test("the job status maps to its own word", () => {
    expect(STATUS_MAP.cancelled).toBe("cancelled");
    // derivation_version is irrelevant — only `completed` reads it.
    expect(resolveAnalysisStatus("cancelled", null)).toBe("cancelled");
    expect(resolveAnalysisStatus("cancelled", "0.6.0")).toBe("cancelled");
    expect(ANALYSIS_LABEL.cancelled).toBe("Cancelled");
  });

  test("it is in none of the in-flight, failed or ready sets", () => {
    expect(isInFlight("cancelled")).toBe(false);
    expect(isWorking("cancelled")).toBe(false);
    expect(isLiveUpdating("cancelled")).toBe(false);
    expect(isStalled("cancelled")).toBe(false);
    expect(isAnalysisFailed("cancelled")).toBe(false);
    expect(isAnalysisReady("cancelled")).toBe(false);
  });

  test("the matches list groups it with a manual match, never Ready", () => {
    const group = matchListGroup({ status: "cancelled" });
    expect(group).toBe(matchListGroup({ status: "manual" }));
    expect(group).not.toBe("Ready");
    expect(group).not.toBe("In progress");
    expect(group).not.toBe("Failed");
  });

  test("no progress bar, and the row points at the match page", () => {
    expect(pipelinePercent("cancelled")).toBeUndefined();
    const action = analysisAction(
      { status: "cancelled", providerId: "splitstep", jobId: "j1" },
      "m1",
    );
    // Never "Cancel" — the job is already stopped.
    expect(action?.label).toBe("View match");
    expect(action?.href).toBe("/dashboard/matches/m1");
  });
});

test.describe("queuedAt, vendorStartedAt and reservedSeconds", () => {
  const QUEUED = "2026-09-29T10:00:00Z";
  const SUBMITTED = "2026-09-29T09:59:30Z";
  const STARTED = "2026-09-29T10:20:00Z";

  test("queuedAt is the vendor acknowledgement, falling back to submission", () => {
    expect(
      jobTimingFields({ queued_ack_at: QUEUED, submitted_at: SUBMITTED }),
    ).toMatchObject({ queuedAt: QUEUED });
    expect(
      jobTimingFields({ queued_ack_at: null, submitted_at: SUBMITTED }),
    ).toMatchObject({ queuedAt: SUBMITTED });
    expect(jobTimingFields({}).queuedAt).toBeUndefined();
  });

  test("vendorStartedAt and reservedSeconds read their columns", () => {
    expect(
      jobTimingFields({ vendor_started_at: STARTED, billable_seconds: 5340 }),
    ).toEqual({
      queuedAt: undefined,
      vendorStartedAt: STARTED,
      reservedSeconds: 5340,
    });
    // A zero reservation is no reservation — nothing "goes back".
    expect(jobTimingFields({ billable_seconds: 0 }).reservedSeconds).toBe(
      undefined,
    );
  });

  test("every key is present so a live patch clears a stale clock", () => {
    expect(Object.keys(jobTimingFields({})).sort()).toEqual([
      "queuedAt",
      "reservedSeconds",
      "vendorStartedAt",
    ]);
  });

  test("the realtime patch carries the same three fields and the cancelled status", () => {
    const loader = createLoader({
      stubs: {
        "@/lib/supabase/client": {
          createClient: () => {
            throw new Error("no socket in an offline spec");
          },
        },
      },
    });
    const { liveAnalysisPatch } = loader.load(
      "src/hooks/use-live-match-analysis.ts",
    ) as {
      liveAnalysisPatch: (row: LiveJobRow) => LiveAnalysisPatch | undefined;
    };

    const row: LiveJobRow = {
      id: "j1",
      match_id: "m1",
      status: "processing",
      upload_progress_percent: null,
      error_message: null,
      error_category: null,
      external_job_id: "ext-1",
      created_at: "2026-09-29T09:00:00Z",
      derivation_version: null,
      updated_at: STARTED,
      error_code: null,
      error_step: null,
      video_object_key: "videos/m1.mp4",
      results_object_key: null,
      resubmitted_from_job_id: null,
      submitted_at: SUBMITTED,
      queued_ack_at: QUEUED,
      vendor_started_at: STARTED,
      billable_seconds: 5340,
    };

    expect(liveAnalysisPatch(row)).toMatchObject({
      status: "processing",
      queuedAt: QUEUED,
      vendorStartedAt: STARTED,
      reservedSeconds: 5340,
    });

    const cancelled = liveAnalysisPatch({
      ...row,
      status: "cancelled",
      error_code: "CANCELLED",
      vendor_started_at: null,
    });
    expect(cancelled?.status).toBe("cancelled");
    expect(cancelled?.vendorStartedAt).toBeUndefined();
    // A cancel is not a failure: no recovery class, so no Retry.
    expect(cancelled?.recovery).toBeUndefined();
  });
});
