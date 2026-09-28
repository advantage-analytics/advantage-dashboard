import { expect, test } from "@playwright/test";

import {
  classifyFailure,
  INPUT_REJECTED_CATEGORY,
  isInputRejected,
  MAX_TOTAL_ATTEMPTS,
  showsStoredNote,
  type RecoveryClass,
  type RecoveryInput,
} from "@/lib/data/match-analysis";
import type {
  LiveAnalysisPatch,
  LiveJobRow,
} from "@/hooks/use-live-match-analysis";
import { createLoader } from "./fixtures/vm-modules";

/**
 * A job the vendor refused outright (`error_category = invalid_input`, e.g.
 * VIDEO_FRAME_RATE_TOO_LOW) cannot succeed on a resubmit of the same file, so
 * `MatchAnalysis.inputRejected` tells the UI to hide Retry.
 *
 * Both projections — the server loader and the realtime hook — decide it
 * through `isInputRejected()`, so the matches list and the match page cannot
 * disagree about the same row. The hook is loaded through `fixtures/vm-modules`
 * with the browser Supabase client stubbed, so its pure `liveAnalysisPatch()`
 * runs without a socket.
 */

const HOOK = "src/hooks/use-live-match-analysis.ts";

test("isInputRejected: only a vendor `failed` job with the invalid_input category", () => {
  expect(INPUT_REJECTED_CATEGORY).toBe("invalid_input");

  expect(isInputRejected("failed", "invalid_input")).toBe(true);

  expect(isInputRejected("failed", "internal")).toBe(false);
  expect(isInputRejected("failed", null)).toBe(false);
  expect(isInputRejected("failed", undefined)).toBe(false);
  expect(isInputRejected("derivation_failed", "invalid_input")).toBe(false);
  expect(isInputRejected("completed", "invalid_input")).toBe(false);
});

test("liveAnalysisPatch sets inputRejected on every patch, through the same predicate", () => {
  const loader = createLoader({
    stubs: {
      "@/lib/supabase/client": {
        createClient: () => {
          throw new Error("no socket in an offline spec");
        },
      },
    },
  });
  const { liveAnalysisPatch } = loader.load(HOOK) as {
    liveAnalysisPatch: (row: LiveJobRow) => LiveAnalysisPatch | undefined;
  };

  const row: LiveJobRow = {
    match_id: "m1",
    status: "failed",
    error_category: "invalid_input",
    upload_progress_percent: null,
    error_message: "VIDEO_FRAME_RATE_TOO_LOW",
    external_job_id: "ext-1",
    created_at: "2026-09-28T00:00:00Z",
    derivation_version: null,
  };

  const rejected = liveAnalysisPatch(row);
  expect(rejected?.status).toBe("failed");
  expect(rejected?.inputRejected).toBe(true);

  expect(
    liveAnalysisPatch({ ...row, error_category: "internal" })?.inputRejected,
  ).toBe(false);

  // A later non-failed row (a resubmission) resets it rather than leaving the
  // earlier refusal merged over the server render.
  const resubmitted = liveAnalysisPatch({
    ...row,
    status: "queued",
    error_message: null,
  });
  expect(resubmitted).toBeDefined();
  expect(resubmitted?.inputRejected).toBe(false);
});

/**
 * classifyFailure() against every non-healthy production row on 2026-09-27
 * (the design's live-data table), then the edges the table does not cover.
 */
const BASE: RecoveryInput = {
  dbStatus: "failed",
  errorCode: null,
  errorCategory: null,
  errorStep: null,
  hasVideo: true,
  hasResults: false,
  attemptsUsed: 1,
  stalledSubmit: false,
};

const NO_VIDEO_FAILED: RecoveryInput = { ...BASE, hasVideo: false };

const CASES: [label: string, input: RecoveryInput, want: RecoveryClass][] = [
  [
    "45ff4bd7 frame rate rejected",
    {
      ...BASE,
      errorCode: "VIDEO_FRAME_RATE_TOO_LOW",
      errorCategory: "invalid_input",
      errorStep: "trimming_video",
    },
    "fix_recording",
  ],
  [
    "e6e8dea4 internal error while downloading",
    {
      ...BASE,
      errorCode: "INTERNAL_ERROR",
      errorCategory: "internal",
      errorStep: "downloading_video",
    },
    "retry",
  ],
  ["70748f2a no video", NO_VIDEO_FAILED, "upload_again"],
  ["cca2efbe no video", NO_VIDEO_FAILED, "upload_again"],
  ["f91bad2c no video", NO_VIDEO_FAILED, "upload_again"],
  ["eb7f9fe5 no video", NO_VIDEO_FAILED, "upload_again"],
  ["6b7406fa no video", NO_VIDEO_FAILED, "upload_again"],
  [
    "b74a1e04 derivation failed, no code",
    { ...BASE, dbStatus: "derivation_failed", hasResults: true },
    "stats_unavailable",
  ],
  [
    "c1d36200 stalled submit over allowance",
    {
      ...BASE,
      dbStatus: "uploaded",
      errorCode: "QUOTA_EXCEEDED",
      stalledSubmit: true,
    },
    "wait_or_ask",
  ],
  [
    "85518306 stalled submit, no code",
    { ...BASE, dbStatus: "uploaded", stalledSubmit: true },
    "retry",
  ],
  // Edges
  [
    "no video beats an input rejection",
    { ...NO_VIDEO_FAILED, errorCategory: "invalid_input" },
    "upload_again",
  ],
  [
    "a retry at the attempt ceiling",
    { ...BASE, errorCode: "INTERNAL_ERROR", attemptsUsed: 3 },
    "wait_or_ask",
  ],
  [
    "a download-failure retry at the attempt ceiling",
    {
      ...BASE,
      errorCode: "INTERNAL_ERROR",
      errorStep: "downloading_video",
      attemptsUsed: 3,
    },
    "wait_or_ask",
  ],
  [
    "derivation crash",
    { ...BASE, dbStatus: "derivation_failed", errorCode: "DERIVATION_ERROR" },
    "rederive",
  ],
  [
    "derivation refusal",
    { ...BASE, dbStatus: "derivation_failed", errorCode: "DERIVATION_REFUSED" },
    "stats_unavailable",
  ],
  [
    "unknown video_quality code is not an input rejection",
    { ...BASE, errorCode: "VIDEO_TOO_DARK", errorCategory: "video_quality" },
    "retry",
  ],
  [
    "stalled submit, not eligible",
    {
      ...BASE,
      dbStatus: "uploaded",
      errorCode: "NOT_ELIGIBLE",
      stalledSubmit: true,
    },
    "wait_or_ask",
  ],
  [
    "stalled submit, no billing workspace",
    {
      ...BASE,
      dbStatus: "uploaded",
      errorCode: "NO_BILLING_WORKSPACE",
      stalledSubmit: true,
    },
    "wait_or_ask",
  ],
];

test("classifyFailure: live rows and edges, first rule wins", () => {
  expect(MAX_TOTAL_ATTEMPTS).toBe(3);
  for (const [label, input, want] of CASES) {
    expect(classifyFailure(input), label).toBe(want);
  }
});

test("classifyFailure: null for rows that did not fail", () => {
  expect(
    classifyFailure({ ...BASE, dbStatus: "uploaded", stalledSubmit: false }),
  ).toBeNull();
  expect(classifyFailure({ ...BASE, dbStatus: "completed" })).toBeNull();
  expect(classifyFailure({ ...BASE, dbStatus: "analyzing" })).toBeNull();
});

test("showsStoredNote: any code except our DERIVATION_ ones", () => {
  const table: [string | null | undefined, boolean][] = [
    [null, false],
    [undefined, false],
    ["DERIVATION_ERROR", false],
    ["DERIVATION_REFUSED", false],
    ["QUOTA_EXCEEDED", true],
    ["INTERNAL_ERROR", true],
    ["VIDEO_FRAME_RATE_TOO_LOW", true],
  ];
  for (const [code, want] of table) {
    expect(showsStoredNote(code), String(code)).toBe(want);
  }
});
