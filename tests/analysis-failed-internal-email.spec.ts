import { expect, test } from "@playwright/test";

import { emailOrigin } from "@/lib/site-url";
import {
  analysisFailedInternalEmail,
  type AnalysisFailedInternalInput,
} from "@/lib/services/email";
import { analysisFailureStage } from "@/lib/services/notifications/analysis-mail";

/**
 * T3 — the "analysis failed" internal alert. Offline: the template is pure,
 * and `analysisFailureStage` decides from a job row alone. Nothing here
 * touches a database or sends anything.
 */

const SITE = "https://app.example.test";
const MATCH_ID = "0b7c9a1e-4f2d-4b8a-9c3e-2d1f5a6b7c8d";

test.beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = SITE;
});

function input(
  overrides: Partial<AnalysisFailedInternalInput> = {},
): AnalysisFailedInternalInput {
  return {
    to: "team@advantage-analytics.com",
    jobId: "job-123",
    matchId: MATCH_ID,
    matchTitle: "Alex Rivera vs. Jordan Chen",
    stage: "failed · downloading_video",
    errorCode: "E_DOWNLOAD",
    errorMessage: "Could not fetch the source video.",
    uploaderName: "Alex Rivera",
    uploaderEmail: "alex@example.test",
    ...overrides,
  };
}

/* -------------------------------------------------------------------------
 * The template
 * ---------------------------------------------------------------------- */

test("full input: subject, tags, Stage/Code/Uploader facts and CTA", () => {
  const msg = analysisFailedInternalEmail(input());

  expect(msg.to).toBe("team@advantage-analytics.com");
  expect(msg.subject).toBe("Analysis failed: Alex Rivera vs. Jordan Chen");
  expect(msg.tags).toEqual({ type: "analysis_failed_internal" });
  // Resend rejects anything outside ASCII letters, numbers, `_` and `-`.
  for (const value of Object.values(msg.tags ?? {})) {
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
  }

  expect(msg.text).toContain("Job: job-123");
  expect(msg.text).toContain(`Match: ${MATCH_ID}`);
  expect(msg.text).toContain("Stage: failed · downloading_video");
  expect(msg.text).toContain("Code: E_DOWNLOAD");
  expect(msg.text).toContain("Uploader: Alex Rivera (alex@example.test)");

  const url = `${emailOrigin()}/dashboard/matches/${MATCH_ID}`;
  expect(url).toBe(`${SITE}/dashboard/matches/${MATCH_ID}`);
  expect(msg.html).toContain(`<a href="${url}"`);
  expect(msg.text).toContain(url);
});

test("null uploader and null code: Code omitted, Uploader says deleted", () => {
  const msg = analysisFailedInternalEmail(
    input({
      stage: "derivation_failed",
      errorCode: null,
      errorMessage: null,
      uploaderName: null,
      uploaderEmail: null,
    }),
  );

  expect(msg.tags).toEqual({ type: "analysis_failed_internal" });
  expect(msg.text).toContain("Stage: derivation_failed");
  expect(msg.text).not.toContain("Code:");
  expect(msg.text).toContain("Uploader: Unknown — account deleted");
  expect(msg.html).toContain(`<a href="${SITE}/dashboard/matches/${MATCH_ID}"`);
});

/* -------------------------------------------------------------------------
 * analysisFailureStage
 * ---------------------------------------------------------------------- */

test("derivation_failed stands alone", () => {
  expect(
    analysisFailureStage({
      status: "derivation_failed",
      error_step: "downloading_video",
    }),
  ).toBe("derivation_failed");
});

test("a vendor failure carries its step, or none", () => {
  expect(
    analysisFailureStage({ status: "failed", error_step: "downloading_video" }),
  ).toBe("failed · downloading_video");
  expect(analysisFailureStage({ status: "failed", error_step: null })).toBe(
    "failed",
  );
});
