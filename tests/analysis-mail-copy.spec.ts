import { expect, test } from "@playwright/test";

import { emailOrigin } from "@/lib/site-url";
import {
  analysisFailedEmail,
  analysisReadyEmail,
  analysisVerifiedEmail,
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

  const url = `${emailOrigin()}/dashboard/matches/${MATCH_ID}`;
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

/* -------------------------------------------------------------------------
 * analysisReadyEmail — Ask's first answer rides on the mail
 * ---------------------------------------------------------------------- */

test.describe("analysisReadyEmail with a first answer", () => {
  const CONVERSATION = "dddddddd-0000-4000-8000-000000000004";
  const ready = (
    overrides: Partial<Parameters<typeof analysisReadyEmail>[0]> = {},
  ) =>
    analysisReadyEmail({
      to: "alex@example.test",
      matchId: MATCH_ID,
      matchTitle: "Alex Rivera vs. Jordan Chen",
      matchContext: "Oct 1, 2026",
      score: "6-4, 6-3",
      ...overrides,
    });

  test("carries the headline and a second button into the conversation", () => {
    const msg = ready({
      ask: {
        headline: "You held serve all the way through.",
        conversationId: CONVERSATION,
      },
    });
    expect(msg.html).toContain("You held serve all the way through.");
    expect(msg.html).toContain(`${SITE}/dashboard/ask?c=${CONVERSATION}`);
    expect(msg.html).toContain("Open in Ask");
    expect(msg.text).toContain("Open in Ask");
    expect(msg.text).toContain(`${SITE}/dashboard/ask?c=${CONVERSATION}`);
    // The report's own button stays first.
    expect(msg.html.indexOf("Open the report")).toBeLessThan(
      msg.html.indexOf("Open in Ask"),
    );
    expect(msg.tags).toMatchObject({ type: "analysis_ready", ask: "yes" });
  });

  test("reads as before without one, and while stats are pending", () => {
    const plain = ready();
    expect(plain.html).not.toContain("/dashboard/ask");
    expect(plain.html).not.toContain("Open in Ask");
    expect(plain.tags).toMatchObject({ ask: "no" });

    const pending = ready({
      statsPending: true,
      ask: { headline: "h", conversationId: CONVERSATION },
    });
    expect(pending.html).not.toContain("/dashboard/ask");
    expect(pending.tags).toMatchObject({ pending: "yes", ask: "no" });
  });
});

/* -------------------------------------------------------------------------
 * analysisReadyEmail — the automatic analysis, said plainly (2026-11-17)
 *
 * A player got "Every serve, return, hold and break from this match is now on
 * the report" on raw vendor output, opened it three times, and was never told
 * when the label console rewrote every point 51 minutes later. The ready mail
 * now claims only what the automatic analysis is; "every point checked" is
 * Verified by Advantage's, and has its own mail.
 * ---------------------------------------------------------------------- */

test.describe("analysisReadyEmail copy", () => {
  const ready = (
    overrides: Partial<Parameters<typeof analysisReadyEmail>[0]> = {},
  ) =>
    analysisReadyEmail({
      to: "alex@example.test",
      matchId: MATCH_ID,
      matchTitle: "Alex Rivera vs. Jordan Chen",
      matchContext: "Stanford Men's Tennis · 17 Nov 2026",
      score: "6-4 3-6 7-5",
      ...overrides,
    });

  test("verification pending: says the check is coming, and that the numbers may change", () => {
    const msg = ready({ verificationPending: true });
    expect(msg.subject).toBe("Alex Rivera vs. Jordan Chen has been analyzed");
    expect(msg.text).toContain(
      "Advantage Intelligence has finished with your video, and your report is open.",
    );
    expect(msg.text).toContain(
      "We are checking every point against the video: who won and how it ended. Until then, your statistics come from the automatic analysis and may change. We'll email you when it's done.",
    );
    expect(msg.text).toContain("Verification pending");
    expect(msg.text).toContain(
      'You\'re getting this because "Email me when analysis is ready" is on',
    );
    expect(msg.tags).toMatchObject({
      type: "analysis_ready",
      verification: "pending",
    });
  });

  test("no check coming: promises no check and no second mail", () => {
    const msg = ready();
    expect(msg.subject).toBe("Alex Rivera vs. Jordan Chen has been analyzed");
    expect(msg.text).toContain(
      "Advantage Intelligence has finished with your video. Your report has your match statistics and the points it found, each with its clip.",
    );
    expect(msg.text).not.toContain("Verification pending");
    expect(msg.text).not.toContain("checking every point");
    expect(msg.text).not.toContain("We'll email you");
    expect(msg.tags).toMatchObject({ verification: "none" });
  });

  test("the overclaim is gone, and no internal or vendor name reaches the player", () => {
    for (const msg of [ready(), ready({ verificationPending: true })]) {
      // "is ready" survives only in the switch's own name, in the note.
      expect(msg.subject).not.toContain("is ready");
      for (const part of [msg.subject, msg.html, msg.text]) {
        expect(part).not.toContain("Every serve, return, hold and break");
        expect(part.toLowerCase()).not.toContain("splitstep");
        expect(part.toLowerCase()).not.toContain("analyst");
      }
    }
  });

  test("stats still being worked out: no verification line either way", () => {
    const msg = ready({ statsPending: true, verificationPending: true });
    expect(msg.text).not.toContain("Verification pending");
    expect(msg.tags).toMatchObject({ pending: "yes", verification: "none" });
  });
});

test.describe("analysisVerifiedEmail copy", () => {
  test("one paragraph, the badge's words, and the report's button", () => {
    const msg = analysisVerifiedEmail({
      to: "alex@example.test",
      matchId: MATCH_ID,
      matchTitle: "Alex Rivera vs. Jordan Chen",
    });
    expect(msg.subject).toBe(
      "Alex Rivera vs. Jordan Chen is now Verified by Advantage",
    );
    expect(msg.text).toContain("Your match is Verified by Advantage");
    expect(msg.text).toContain(
      "We've checked every point of this match against the video: who won and how it ended. Your report has been updated to match, so some statistics may differ from what you saw before.",
    );
    expect(msg.html).toContain("Open the report");
    expect(msg.html).toContain(
      `<a href="${emailOrigin()}/dashboard/matches/${MATCH_ID}"`,
    );
    expect(msg.text).toContain(
      'You\'re getting this because "Email me when analysis is ready" is on',
    );
    // One paragraph and a button: no facts panel.
    expect(msg.text).not.toContain("Where");
    for (const part of [msg.subject, msg.html, msg.text]) {
      expect(part.toLowerCase()).not.toContain("splitstep");
      expect(part.toLowerCase()).not.toContain("analyst");
    }
    expect(msg.tags).toEqual({ type: "analysis_verified" });
  });
});

/* -------------------------------------------------------------------------
 * readyVerificationPending — the report's rule, fed from the finished job
 * ---------------------------------------------------------------------- */

test("readyVerificationPending: a job with video after the queue's start is pending; one with no video is not", () => {
  const { readyVerificationPending } = loadNotifyAnalysisVerified();
  const after = "2026-11-17T06:46:00Z";
  expect(
    readyVerificationPending({
      completed_at: after,
      start_time_seconds: 0,
      end_time_seconds: 5400,
      billable_seconds: 5400,
    }),
  ).toBe(true);
  expect(
    readyVerificationPending({
      completed_at: after,
      start_time_seconds: null,
      end_time_seconds: null,
      billable_seconds: null,
    }),
  ).toBe(false);
  // Before the queue's start: never promised a check the queue will not do.
  expect(
    readyVerificationPending({
      completed_at: "2026-10-01T00:00:00Z",
      start_time_seconds: 0,
      end_time_seconds: 5400,
      billable_seconds: 5400,
    }),
  ).toBe(false);
});

/* -------------------------------------------------------------------------
 * notifyAnalysisVerified — only after a ready mail for the same job
 * ---------------------------------------------------------------------- */

function loadNotifyAnalysisVerified(
  options: {
    /** `notification_sends` keys already present. */
    sent?: string[];
    readyPref?: boolean;
    /** `claimSend` answers false: another caller got there first. */
    claimLost?: boolean;
  } = {},
) {
  const { sent = [], readyPref = true, claimLost = false } = options;
  const reads: string[] = [];
  const claims: string[] = [];
  const verifiedInputs: unknown[] = [];
  const sentTags: unknown[] = [];

  const loader = createLoader({
    globals: { Error },
    stubs: {
      "@/lib/services/email": {
        sendEmail: async (msg: { tags?: unknown }) => {
          sentTags.push(msg.tags);
          return { ok: true, id: "sent-1" };
        },
        analysisVerifiedEmail: (input: unknown) => {
          verifiedInputs.push(input);
          return {
            to: "x@example.test",
            subject: "stub",
            html: "",
            text: "",
            tags: { type: "analysis_verified" },
          };
        },
        analysisReadyEmail: () => ({}),
        analysisFailedEmail: () => ({}),
        analysisFailedInternalEmail: () => ({}),
        INTERNAL_ALERTS_ADDRESS: "alerts@example.test",
      },
      "@/lib/data/programs-server": {
        programDisplayName: () => "Stanford Men's Tennis",
      },
      "./should-notify": {
        alreadySent: async (key: string) => {
          reads.push(key);
          return sent.includes(key);
        },
        claimSend: async (key: string) => {
          claims.push(key);
          return !claimLost;
        },
        getNotificationPrefs: async () =>
          new Map([["uploader-1", { notifyAnalysisReady: readyPref }]]),
      },
    },
  });

  const mod = loader.load("src/lib/services/notifications/analysis-mail.ts");
  return {
    notifyAnalysisVerified: mod.notifyAnalysisVerified as (params: {
      supabase: unknown;
      jobId: string;
    }) => Promise<void>,
    readyVerificationPending: mod.readyVerificationPending as (
      job: Record<string, unknown>,
    ) => boolean,
    reads,
    claims,
    verifiedInputs,
    sentTags,
  };
}

const VERIFIED_JOB = {
  created_by: "uploader-1",
  match_id: MATCH_ID,
  status: "completed",
  error_code: null,
  error_category: null,
  error_step: null,
  error_message: null,
  video_object_key: "videos/x.mp4",
  results_object_key: "results/x.json",
};

test.describe("notifyAnalysisVerified", () => {
  quietConsole();

  test("no ready mail went out for the job: nothing is claimed or sent", async () => {
    const run = loadNotifyAnalysisVerified({ sent: [] });
    await run.notifyAnalysisVerified({
      supabase: fakeSupabase(VERIFIED_JOB, []),
      jobId: "job-1",
    });
    expect(run.reads).toEqual(["analysis_ready:job-1"]);
    expect(run.claims).toEqual([]);
    expect(run.verifiedInputs).toHaveLength(0);
    expect(run.sentTags).toHaveLength(0);
  });

  test("a ready mail for ANOTHER job does not count", async () => {
    const run = loadNotifyAnalysisVerified({
      sent: ["analysis_ready:job-0"],
    });
    await run.notifyAnalysisVerified({
      supabase: fakeSupabase(VERIFIED_JOB, []),
      jobId: "job-1",
    });
    expect(run.claims).toEqual([]);
    expect(run.sentTags).toHaveLength(0);
  });

  test("after the ready mail: one send, claimed per job, to the uploader, with the match's title", async () => {
    const run = loadNotifyAnalysisVerified({
      sent: ["analysis_ready:job-1"],
    });
    await run.notifyAnalysisVerified({
      supabase: fakeSupabase(VERIFIED_JOB, []),
      jobId: "job-1",
    });
    expect(run.claims).toEqual(["analysis_verified:job-1"]);
    expect(run.verifiedInputs).toEqual([
      {
        to: "alex@example.test",
        matchId: MATCH_ID,
        matchTitle: "Alex Rivera vs. Jordan Chen",
      },
    ]);
    expect(run.sentTags).toEqual([{ type: "analysis_verified" }]);
  });

  test("'Email me when analysis is ready' turned off since: nothing", async () => {
    const run = loadNotifyAnalysisVerified({
      sent: ["analysis_ready:job-1"],
      readyPref: false,
    });
    await run.notifyAnalysisVerified({
      supabase: fakeSupabase(VERIFIED_JOB, []),
      jobId: "job-1",
    });
    expect(run.claims).toEqual([]);
    expect(run.sentTags).toHaveLength(0);
  });

  test("already sent for this job (claim lost): no second copy", async () => {
    const run = loadNotifyAnalysisVerified({
      sent: ["analysis_ready:job-1"],
      claimLost: true,
    });
    await run.notifyAnalysisVerified({
      supabase: fakeSupabase(VERIFIED_JOB, []),
      jobId: "job-1",
    });
    expect(run.claims).toEqual(["analysis_verified:job-1"]);
    expect(run.verifiedInputs).toHaveLength(0);
    expect(run.sentTags).toHaveLength(0);
  });

  test("never throws, even when the job read blows up", async () => {
    const run = loadNotifyAnalysisVerified({
      sent: ["analysis_ready:job-1"],
    });
    const exploding = {
      from() {
        throw new Error("db down");
      },
    };
    await expect(
      run.notifyAnalysisVerified({ supabase: exploding, jobId: "job-1" }),
    ).resolves.toBeUndefined();
    expect(run.sentTags).toHaveLength(0);
  });
});
