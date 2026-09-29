import { expect, test } from "@playwright/test";

import { siteUrl } from "@/lib/site-url";
import {
  analysisFailedEmail,
  type AnalysisFailedInput,
} from "@/lib/services/email";
import { createLoader } from "./fixtures/vm-modules";

/**
 * T19 — the athlete-facing "analysis failed" email uses the same recovery
 * class copy as the in-app retry surfaces (`analysis-failure-copy.ts`),
 * never the vendor's raw `error_code` or `failed · ${error_step}`.
 *
 * Two parts:
 *  - `analysisFailedEmail()` is pure, so its output is asserted directly
 *    against real rows (an uncoded "Failed to fetch" failure with no video,
 *    and 45ff4bd7's fps rejection).
 *  - `notifyAnalysisOutcome()`'s `stats_unavailable` skip is asserted by
 *    loading `analysis-mail.ts` through the vm loader with its `@/lib/services/email`
 *    and `./should-notify` imports stubbed, so nothing touches Resend or a
 *    real database, and the athlete-facing template is never even called.
 */

const SITE = "https://app.example.test";
const MATCH_ID = "0b7c9a1e-4f2d-4b8a-9c3e-2d1f5a6b7c8d";

test.beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = SITE;
});

function input(
  overrides: Partial<AnalysisFailedInput> = {},
): AnalysisFailedInput {
  return {
    to: "alex@example.test",
    matchId: MATCH_ID,
    matchTitle: "Alex Rivera vs. Jordan Chen",
    matchContext: "Stanford vs. Cal · Singles 3",
    failureClass: "retry",
    errorCode: null,
    errorMessage: null,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------
 * analysisFailedEmail — class copy in, no vendor code/step out
 * ---------------------------------------------------------------------- */

test("uncoded 'Failed to fetch' failure with no video: upload_again copy, no raw string", () => {
  // dbStatus "failed" with no video classifies as upload_again regardless of
  // the (absent) error code — see classifyFailure() in match-analysis.ts.
  const msg = analysisFailedEmail(
    input({
      failureClass: "upload_again",
      errorCode: null,
      errorMessage: "Failed to fetch",
    }),
  );

  // The class title is present (html entity-encodes the apostrophe)...
  expect(msg.html).toContain("The video didn&#39;t finish uploading");
  expect(msg.text).toContain("The video didn't finish uploading");
  // ...but the raw vendor string is not: showsStoredNote(null) is false for
  // an uncoded row, so the note never renders.
  expect(msg.html).not.toContain("Failed to fetch");
  expect(msg.text).not.toContain("Failed to fetch");

  expect(msg.html).not.toContain("error_code");
  expect(msg.html).not.toContain("failed ·");
  expect(msg.text).not.toContain("failed ·");

  const url = `${siteUrl()}/dashboard/matches/${MATCH_ID}`;
  expect(msg.html).toContain(`<a href="${url}"`);
});

test("45ff4bd7 fps rejection: vendor note shown, code and step never appear", () => {
  const msg = analysisFailedEmail(
    input({
      failureClass: "fix_recording",
      errorCode: "VIDEO_FRAME_RATE_TOO_LOW",
      errorMessage: "The video must be at least 29.9 fps.",
    }),
  );

  // fix_recording's class title is present.
  expect(msg.html).toContain("Analysis stopped");
  // The vendor's own message is shown, verbatim, as the stored note.
  expect(msg.html).toContain("The video must be at least 29.9 fps.");
  expect(msg.text).toContain("The video must be at least 29.9 fps.");

  // Neither the code nor the step it failed at ever appears.
  expect(msg.html).not.toContain("VIDEO_FRAME_RATE_TOO_LOW");
  expect(msg.text).not.toContain("VIDEO_FRAME_RATE_TOO_LOW");
  expect(msg.html).not.toContain("trimming_video");
  expect(msg.text).not.toContain("trimming_video");
  expect(msg.html).not.toContain("failed ·");
  expect(msg.text).not.toContain("failed ·");
});

test("DERIVATION_* codes never show the reconciler's own note", () => {
  const msg = analysisFailedEmail(
    input({
      failureClass: "stats_unavailable",
      errorCode: "DERIVATION_REFUSED",
      errorMessage: "5 point(s) resolved no winner",
    }),
  );

  expect(msg.html).not.toContain("5 point(s) resolved no winner");
  expect(msg.html).not.toContain("DERIVATION_REFUSED");
});

/* -------------------------------------------------------------------------
 * notifyAnalysisOutcome — stats_unavailable sends nothing to the athlete
 * ---------------------------------------------------------------------- */

function fakeSupabase(job: Record<string, unknown>, chainRows: unknown[]) {
  return {
    from(table: string) {
      if (table === "processing_jobs") {
        return {
          select(cols: string) {
            if (cols.includes("resubmitted_from_job_id")) {
              return {
                eq: async () => ({ data: chainRows, error: null }),
              };
            }
            return {
              eq: () => ({
                maybeSingle: async () => ({ data: job, error: null }),
              }),
            };
          },
        };
      }
      if (table === "matches") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  player1_name: "Alex Rivera",
                  player2_name: "Jordan Chen",
                  score: null,
                  date: null,
                  program_id: null,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  email: "alex@example.test",
                  first_name: "Alex",
                  last_name: "Rivera",
                },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function loadNotifyAnalysisOutcome() {
  const failedEmailInputs: unknown[] = [];
  const sentTags: unknown[] = [];

  const loader = createLoader({
    globals: { Error },
    stubs: {
      "@/lib/services/email": {
        sendEmail: async (msg: { tags?: unknown }) => {
          sentTags.push(msg.tags);
          return { ok: true, id: "sent-1" };
        },
        analysisFailedEmail: (msg: unknown) => {
          failedEmailInputs.push(msg);
          return {
            to: "x@example.test",
            subject: "stub",
            html: "",
            text: "",
            tags: { type: "analysis_failed" },
          };
        },
        analysisReadyEmail: () => ({
          to: "x@example.test",
          subject: "stub",
          html: "",
          text: "",
          tags: { type: "analysis_ready" },
        }),
        analysisFailedInternalEmail: () => ({
          to: "alerts@example.test",
          subject: "stub",
          html: "",
          text: "",
          tags: { type: "analysis_failed_internal" },
        }),
        INTERNAL_ALERTS_ADDRESS: "alerts@example.test",
      },
      "@/lib/data/programs-server": {
        programDisplayName: () => "Stanford Men's Tennis",
      },
      "@/lib/ui/score-format": {
        formatScoreText: () => "6-4",
        playedSets: (sets: unknown) => sets,
        scoreSetsFrom: () => [],
      },
      "./should-notify": {
        claimSend: async () => true,
        getNotificationPrefs: async () =>
          new Map([
            [
              "uploader-1",
              { notifyAnalysisFailed: true, notifyAnalysisReady: true },
            ],
          ]),
      },
    },
  });

  const mod = loader.load("src/lib/services/notifications/analysis-mail.ts");
  return {
    notifyAnalysisOutcome: mod.notifyAnalysisOutcome as (params: {
      supabase: unknown;
      jobId: string;
      outcome: "ready" | "failed";
    }) => Promise<void>,
    failedEmailInputs,
    sentTags,
  };
}

/** The function logs every skip; keep the run readable, then restore. */
function quietConsole() {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  test.beforeEach(() => {
    console.log = console.warn = console.error = () => undefined;
  });
  test.afterEach(() => Object.assign(console, saved));
}

test.describe("notifyAnalysisOutcome — stats_unavailable", () => {
  quietConsole();

  test("a derivation refusal is not sent to the athlete", async () => {
    const { notifyAnalysisOutcome, failedEmailInputs, sentTags } =
      loadNotifyAnalysisOutcome();

    const job = {
      created_by: "uploader-1",
      match_id: MATCH_ID,
      status: "derivation_failed",
      error_code: "DERIVATION_REFUSED",
      error_category: null,
      error_step: null,
      error_message: "5 point(s) resolved no winner",
      video_object_key: "videos/x.mp4",
      results_object_key: "results/x.json",
    };
    const supabase = fakeSupabase(job, [
      { id: "job-1", resubmitted_from_job_id: null },
    ]);

    const result = await notifyAnalysisOutcome({
      supabase,
      jobId: "job-1",
      outcome: "failed",
    });

    // "not sent": no throw, no value, and — the part that matters — the
    // athlete-facing template was never even built.
    expect(result).toBeUndefined();
    expect(failedEmailInputs).toHaveLength(0);
    expect(
      sentTags.some(
        (tags) =>
          (tags as { type?: string } | undefined)?.type === "analysis_failed",
      ),
    ).toBe(false);
  });

  test("a real DERIVATION_ERROR crash still classifies as rederive, not stats_unavailable, and does email", async () => {
    const { notifyAnalysisOutcome, failedEmailInputs } =
      loadNotifyAnalysisOutcome();

    const job = {
      created_by: "uploader-1",
      match_id: MATCH_ID,
      status: "derivation_failed",
      error_code: "DERIVATION_ERROR",
      error_category: null,
      error_step: null,
      error_message: "Unexpected error while deriving stats",
      video_object_key: "videos/x.mp4",
      results_object_key: "results/x.json",
    };
    const supabase = fakeSupabase(job, [
      { id: "job-1", resubmitted_from_job_id: null },
    ]);

    await notifyAnalysisOutcome({
      supabase,
      jobId: "job-1",
      outcome: "failed",
    });

    expect(failedEmailInputs).toHaveLength(1);
    expect(
      (failedEmailInputs[0] as { failureClass?: string }).failureClass,
    ).toBe("rederive");
  });
});
