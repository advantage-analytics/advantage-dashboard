import { expect, test } from "@playwright/test";

import {
  INPUT_REJECTED_CATEGORY,
  isInputRejected,
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
