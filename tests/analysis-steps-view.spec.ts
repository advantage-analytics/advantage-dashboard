import { expect, test } from "@playwright/test";

import type { MatchAnalysis } from "@/lib/data/match-analysis";
import {
  byClass,
  DRAWER_NO_ACTION_BODY,
  WAIT_OR_ASK_VARIANTS,
} from "@/components/dashboard/matches/analysis-failure-copy";
import { UPLOADING_COPY } from "@/components/dashboard/matches/upload-progress-copy";
import {
  DRAWER_NO_ACTION_TITLE,
  DRAWER_PROCESSING_NOTE,
  STAGE_NOTE,
  STALLED_RETRY_COPY,
  analysisStepsView,
  drawerAnalysisStepsView,
  type AnalysisStepsView,
  type DrawerAnalysisStepsView,
} from "@/components/dashboard/matches/match-detail/analysis-steps";

/**
 * `analysisStepsView()`: the match page's analysis card as the wizard's
 * vertical stepper. One case per card state, pinning which steps are done,
 * running, waiting or failed, and what the failing step carries.
 */

const NOW = Date.parse("2026-09-28T16:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

const BASE: MatchAnalysis = {
  status: "uploading",
  providerId: "splitstep",
  jobId: "job-1",
};

function shape(view: AnalysisStepsView): string[] {
  return view.steps.map((s) => `${s.key}:${s.state}`);
}

function failing(view: AnalysisStepsView) {
  const fails = view.steps.filter((s) => s.state === "fail");
  expect(fails).toHaveLength(1);
  const [step] = fails;
  if (step.body?.kind !== "failure")
    throw new Error("fail step has no failure body");
  expect(view.failure?.step).toBe(step.key);
  return { step, body: step.body };
}

test("uploading: video step runs with the measured, floored percent", () => {
  const view = analysisStepsView(
    {
      ...BASE,
      status: "uploading",
      uploadPercent: 42.9,
      startedAt: minutesAgo(12),
    },
    NOW,
  );
  expect(view.title).toBe(UPLOADING_COPY.title);
  expect(shape(view)).toEqual([
    "saved:done",
    "video:now",
    "analysis:later",
    "stats:later",
  ]);
  const video = view.steps[1];
  expect(video.label).toBe(UPLOADING_COPY.steps.video);
  expect(video.value).toBe("42%");
  expect(video.body).toMatchObject({ kind: "upload", percent: 42.9 });
  expect(video.body?.kind === "upload" && video.body.eta).toBeTruthy();
  expect(view.failure).toBeUndefined();
});

test("uploading with no measured percent shows no value and no estimate", () => {
  const view = analysisStepsView({ ...BASE, status: "uploading" }, NOW);
  expect(view.steps[1].value).toBeUndefined();
  expect(view.steps[1].body).toEqual({
    kind: "upload",
    percent: 0,
    eta: undefined,
  });
});

test("uploaded, not yet stalled: hand-off running with the stored note", () => {
  const view = analysisStepsView(
    { ...BASE, status: "uploaded", updatedAt: minutesAgo(1) },
    NOW,
  );
  expect(shape(view)).toEqual([
    "saved:done",
    "video:done",
    "analysis:now",
    "stats:later",
  ]);
  expect(view.steps[2].body).toEqual({
    kind: "note",
    text: STAGE_NOTE.uploaded,
  });
  expect(view.failure).toBeUndefined();
});

test("stalled submit, retry: analysis step fails with the retry-free stalled copy", () => {
  const view = analysisStepsView(
    {
      ...BASE,
      status: "uploaded",
      updatedAt: minutesAgo(20),
      recovery: "retry",
    },
    NOW,
  );
  expect(shape(view)).toEqual([
    "saved:done",
    "video:done",
    "analysis:fail",
    "stats:later",
  ]);
  const { body } = failing(view);
  expect(body).toEqual({
    kind: "failure",
    headline: STALLED_RETRY_COPY.title,
    body: STALLED_RETRY_COPY.cardBody,
    recovery: "retry",
    stalled: true,
  });
});

test("stalled submit with no class yet defaults to retry", () => {
  const view = analysisStepsView(
    { ...BASE, status: "uploaded", updatedAt: minutesAgo(20) },
    NOW,
  );
  expect(failing(view).body.recovery).toBe("retry");
});

test("stalled submit, wait_or_ask allowance: stored note is the headline", () => {
  const note = "You have used this month's analysis allowance.";
  const view = analysisStepsView(
    {
      ...BASE,
      status: "uploaded",
      updatedAt: minutesAgo(20),
      recovery: "wait_or_ask",
      errorCode: "QUOTA_EXCEEDED",
      note,
    },
    NOW,
  );
  const { step, body } = failing(view);
  expect(step.key).toBe("analysis");
  expect(body.headline).toBe(note);
  expect(body.body).toBe(WAIT_OR_ASK_VARIANTS.allowance.cardBody);
  expect(body.stalled).toBe(true);
});

test("wait_or_ask picks its variant from the error code", () => {
  const permission = analysisStepsView(
    {
      ...BASE,
      status: "uploaded",
      updatedAt: minutesAgo(20),
      recovery: "wait_or_ask",
      errorCode: "NOT_ELIGIBLE",
    },
    NOW,
  );
  expect(failing(permission).body).toMatchObject({
    headline: WAIT_OR_ASK_VARIANTS.permission.title,
    body: WAIT_OR_ASK_VARIANTS.permission.cardBody,
  });

  const ceiling = analysisStepsView(
    {
      ...BASE,
      status: "failed",
      recovery: "wait_or_ask",
      errorCode: "INTERNAL_ERROR",
      attemptsUsed: 3,
    },
    NOW,
  );
  const c = failing(ceiling);
  expect(c.step.key).toBe("analysis");
  expect(c.body).toMatchObject({
    headline: WAIT_OR_ASK_VARIANTS.ceiling.title,
    body: WAIT_OR_ASK_VARIANTS.ceiling.cardBody,
    stalled: false,
  });
});

test("queued: analysis in line — the current step, waiting, not spinning", () => {
  const view = analysisStepsView({ ...BASE, status: "queued" }, NOW);
  expect(shape(view)).toEqual([
    "saved:done",
    "video:done",
    "analysis:wait",
    "stats:later",
  ]);
  expect(view.steps[2].body).toEqual({ kind: "note", text: STAGE_NOTE.queued });
});

test("processing: analysis running, no invented percentage", () => {
  const view = analysisStepsView(
    { ...BASE, status: "processing", progressPercent: 40 },
    NOW,
  );
  expect(shape(view)).toEqual([
    "saved:done",
    "video:done",
    "analysis:now",
    "stats:later",
  ]);
  expect(view.steps.every((s) => s.value === undefined)).toBe(true);
  expect(view.steps[2].body).toEqual({
    kind: "note",
    text: STAGE_NOTE.processing,
  });
});

test("deriving: analysis done, stats being built", () => {
  const view = analysisStepsView({ ...BASE, status: "deriving" }, NOW);
  expect(shape(view)).toEqual([
    "saved:done",
    "video:done",
    "analysis:done",
    "stats:now",
  ]);
  expect(view.steps[3].body).toEqual({
    kind: "note",
    text: STAGE_NOTE.deriving,
  });
});

test("processed: stats wait (not running) under 'Stats pending'", () => {
  const view = analysisStepsView({ ...BASE, status: "processed" }, NOW);
  expect(view.title).toBe("Stats pending");
  expect(shape(view)).toEqual([
    "saved:done",
    "video:done",
    "analysis:done",
    "stats:later",
  ]);
  expect(view.steps[3].label).toBe("Stats pending");
  expect(view.steps[3].body).toEqual({
    kind: "note",
    text: STAGE_NOTE.processed,
  });
});

test("failed, retry: analysis step fails with the stored note and retry class", () => {
  const view = analysisStepsView(
    {
      ...BASE,
      status: "failed",
      recovery: "retry",
      errorCode: "INTERNAL_ERROR",
      note: "The video could not be downloaded.",
      attemptsUsed: 1,
    },
    NOW,
  );
  expect(shape(view)).toEqual([
    "saved:done",
    "video:done",
    "analysis:fail",
    "stats:later",
  ]);
  expect(failing(view).body).toEqual({
    kind: "failure",
    headline: "The video could not be downloaded.",
    body: byClass.retry.cardBody,
    recovery: "retry",
    stalled: false,
  });
});

test("failed, upload_again: the video step is the one that stopped", () => {
  const view = analysisStepsView(
    {
      ...BASE,
      status: "failed",
      recovery: "upload_again",
      failNote: "Failed to fetch",
    },
    NOW,
  );
  expect(shape(view)).toEqual([
    "saved:done",
    "video:fail",
    "analysis:later",
    "stats:later",
  ]);
  expect(failing(view).body).toMatchObject({
    headline: byClass.upload_again.title,
    body: byClass.upload_again.cardBody,
    recovery: "upload_again",
  });
});

test("failed, fix_recording: frame-rate note headlines, no retry class", () => {
  const view = analysisStepsView(
    {
      ...BASE,
      status: "failed",
      recovery: "fix_recording",
      errorCode: "VIDEO_FRAME_RATE_TOO_LOW",
      note: "The video must be at least 29.9 fps.",
    },
    NOW,
  );
  const { step, body } = failing(view);
  expect(step.key).toBe("analysis");
  expect(body).toMatchObject({
    headline: "The video must be at least 29.9 fps.",
    body: byClass.fix_recording.cardBody,
    recovery: "fix_recording",
  });
});

test("failed with no class falls back to retry", () => {
  const view = analysisStepsView({ ...BASE, status: "failed" }, NOW);
  expect(failing(view).body.recovery).toBe("retry");
});

test("derivation_failed, rederive: the stats step fails", () => {
  const view = analysisStepsView(
    {
      ...BASE,
      status: "derivation_failed",
      recovery: "rederive",
      errorCode: "DERIVATION_ERROR",
      failNote: "Derivation crashed (eyes-on seed).",
    },
    NOW,
  );
  expect(shape(view)).toEqual([
    "saved:done",
    "video:done",
    "analysis:done",
    "stats:fail",
  ]);
  expect(failing(view).body).toMatchObject({
    headline: byClass.rederive.title,
    body: byClass.rederive.cardBody,
    recovery: "rederive",
  });
});

test("stats_unavailable is handled defensively as the stats step failing", () => {
  for (const analysis of [
    { ...BASE, status: "derivation_failed", recovery: "stats_unavailable" },
    // No class at all: the same fallback the live card uses.
    { ...BASE, status: "derivation_failed" },
  ] satisfies MatchAnalysis[]) {
    const view = analysisStepsView(analysis, NOW);
    const { step, body } = failing(view);
    expect(step.key).toBe("stats");
    expect(body).toMatchObject({
      headline: byClass.stats_unavailable.title,
      recovery: "stats_unavailable",
    });
  }
});

test("a raw failNote never reaches any label or body", () => {
  const raw =
    "Failed to fetch <Error><Code>AuthenticationFailed</Code></Error>";
  const statuses: MatchAnalysis["status"][] = [
    "uploading",
    "uploaded",
    "queued",
    "processing",
    "deriving",
    "processed",
    "failed",
    "derivation_failed",
  ];
  for (const status of statuses) {
    for (const updatedAt of [minutesAgo(1), minutesAgo(30)]) {
      const view = analysisStepsView(
        { ...BASE, status, failNote: raw, updatedAt },
        NOW,
      );
      expect(JSON.stringify(view)).not.toContain("Failed to fetch");
      expect(JSON.stringify(view)).not.toContain("AuthenticationFailed");
    }
  }
});

test("every state draws the same four steps in the same order", () => {
  const statuses: MatchAnalysis["status"][] = [
    "uploading",
    "uploaded",
    "queued",
    "processing",
    "deriving",
    "processed",
    "failed",
    "derivation_failed",
  ];
  for (const status of statuses) {
    const view = analysisStepsView({ ...BASE, status }, NOW);
    expect(view.steps.map((s) => s.key)).toEqual([
      "saved",
      "video",
      "analysis",
      "stats",
    ]);
  }
});

// ── drawerAnalysisStepsView(): the peek drawers' compact projection ─────────

const IN_FLIGHT_OR_FAILED: MatchAnalysis["status"][] = [
  "uploading",
  "uploaded",
  "queued",
  "processing",
  "deriving",
  "processed",
  "failed",
  "derivation_failed",
];

function drawerStopped(view: DrawerAnalysisStepsView | null) {
  if (!view) throw new Error("no drawer view");
  const stopped = view.steps.filter((s) => s.body?.kind === "failure");
  expect(stopped).toHaveLength(1);
  const [step] = stopped;
  if (step.body?.kind !== "failure") throw new Error("unreachable");
  expect(step.state).toBe("fail");
  expect(view.failure).toEqual({
    step: step.key,
    recovery: step.body.recovery,
    stalled: step.body.stalled,
  });
  return { step, body: step.body };
}

test("drawer: the same keys, labels and states as the page view, for every in-flight or failed status", () => {
  for (const status of IN_FLIGHT_OR_FAILED) {
    for (const updatedAt of [minutesAgo(1), minutesAgo(30)]) {
      for (const canAct of [true, false]) {
        const analysis: MatchAnalysis = { ...BASE, status, updatedAt };
        const page = analysisStepsView(analysis, NOW);
        const drawer = drawerAnalysisStepsView(analysis, NOW, canAct);
        expect(drawer, status).not.toBeNull();
        expect(
          drawer!.steps.map(({ key, label, state }) => ({ key, label, state })),
          status,
        ).toEqual(
          page.steps.map(({ key, label, state }) => ({ key, label, state })),
        );
      }
    }
  }
});

test("drawer: null for a status that is neither in flight nor failed", () => {
  for (const status of [
    "completed",
    "imported",
    "timeline",
    "cancelled",
  ] as const) {
    expect(drawerAnalysisStepsView({ ...BASE, status }, NOW, true)).toBeNull();
  }
});

test("the three timing fields ride on the analysis without changing the view", () => {
  // T4 carries them; the stepper's meta line (T6) is what reads them. Until
  // then a queued card must draw exactly as it did without them.
  const queued: MatchAnalysis = { ...BASE, status: "queued" };
  const timed: MatchAnalysis = {
    ...queued,
    queuedAt: minutesAgo(12),
    vendorStartedAt: undefined,
    reservedSeconds: 5340,
  };
  expect(timed.queuedAt).toBe(minutesAgo(12));
  expect(timed.reservedSeconds).toBe(5340);
  expect(shape(analysisStepsView(timed, NOW))).toEqual(
    shape(analysisStepsView(queued, NOW)),
  );
});

test("drawer: uploading carries the floored percent as its value and no body", () => {
  const view = drawerAnalysisStepsView(
    {
      ...BASE,
      status: "uploading",
      uploadPercent: 62.8,
      startedAt: minutesAgo(5),
    },
    NOW,
    true,
  )!;
  const video = view.steps[1];
  expect(video).toEqual({
    key: "video",
    label: UPLOADING_COPY.steps.video,
    state: "now",
    value: "62%",
  });
  expect(view.steps.every((s) => s.body === undefined)).toBe(true);
  expect(view.failure).toBeUndefined();
});

test("drawer: running steps read STAGE_NOTE, except processing's drawer line", () => {
  const noteOf = (status: MatchAnalysis["status"]) =>
    drawerAnalysisStepsView(
      { ...BASE, status, updatedAt: minutesAgo(1) },
      NOW,
      true,
    )!.steps.find((s) => s.body)?.body;

  expect(noteOf("uploaded")).toEqual({
    kind: "note",
    text: STAGE_NOTE.uploaded,
  });
  expect(noteOf("queued")).toEqual({ kind: "note", text: STAGE_NOTE.queued });
  expect(noteOf("deriving")).toEqual({
    kind: "note",
    text: STAGE_NOTE.deriving,
  });
  expect(noteOf("processing")).toEqual({
    kind: "note",
    text: "This fills in as soon as the analysis lands.",
  });
  expect(DRAWER_PROCESSING_NOTE).toBe(
    "This fills in as soon as the analysis lands.",
  );
});

test("drawer: a failed retry, can act — the note heads, then the class's drawer body", () => {
  const note = "The video could not be downloaded.";
  const withNote = drawerStopped(
    drawerAnalysisStepsView(
      { ...BASE, status: "failed", recovery: "retry", note },
      NOW,
      true,
    ),
  );
  expect(withNote.step.key).toBe("analysis");
  expect(withNote.body).toEqual({
    kind: "failure",
    headline: note,
    body: byClass.retry.drawerBody,
    recovery: "retry",
    stalled: false,
  });

  const noNote = drawerStopped(
    drawerAnalysisStepsView(
      { ...BASE, status: "failed", recovery: "retry" },
      NOW,
      true,
    ),
  );
  expect(noNote.body.headline).toBe(byClass.retry.title);
  expect(noNote.body.body).toBe(byClass.retry.drawerBody);
});

test("drawer: every class, can act — note ?? title, and the drawer body", () => {
  const cases = [
    ["failed", "fix_recording", byClass.fix_recording, "analysis"],
    ["failed", "upload_again", byClass.upload_again, "video"],
    ["derivation_failed", "rederive", byClass.rederive, "stats"],
    [
      "derivation_failed",
      "stats_unavailable",
      byClass.stats_unavailable,
      "stats",
    ],
  ] as const;
  for (const [status, recovery, copy, key] of cases) {
    const { step, body } = drawerStopped(
      drawerAnalysisStepsView({ ...BASE, status, recovery }, NOW, true),
    );
    expect(step.key, recovery).toBe(key);
    expect(body.headline, recovery).toBe(copy.title);
    expect(body.body, recovery).toBe(copy.drawerBody);
  }
});

test("drawer: wait_or_ask picks its variant from the error code", () => {
  const { body } = drawerStopped(
    drawerAnalysisStepsView(
      {
        ...BASE,
        status: "failed",
        recovery: "wait_or_ask",
        errorCode: "NOT_ELIGIBLE",
        attemptsUsed: 1,
      },
      NOW,
      true,
    ),
  );
  expect(body.headline).toBe(WAIT_OR_ASK_VARIANTS.permission.title);
  expect(body.body).toBe(WAIT_OR_ASK_VARIANTS.permission.drawerBody);
});

test("drawer: a stalled retry reads the stalled title and the new drawer line", () => {
  expect(STALLED_RETRY_COPY.drawerBody).toBe(
    "Trying again costs nothing; nothing needs uploading again.",
  );
  const view = drawerAnalysisStepsView(
    {
      ...BASE,
      status: "uploaded",
      updatedAt: minutesAgo(20),
      recovery: "retry",
    },
    NOW,
    true,
  );
  const { step, body } = drawerStopped(view);
  expect(step.key).toBe("analysis");
  expect(body).toEqual({
    kind: "failure",
    headline: STALLED_RETRY_COPY.title,
    body: STALLED_RETRY_COPY.drawerBody,
    recovery: "retry",
    stalled: true,
  });
  // No clock yet, but the server already classified it: still stalled.
  const early = drawerAnalysisStepsView(
    {
      ...BASE,
      status: "uploaded",
      updatedAt: minutesAgo(20),
      recovery: "retry",
    },
    null,
    true,
  )!;
  expect(early.failure).toEqual(view?.failure);
  // No clock and no classification: not stalled, the hand-off still running.
  const unclassified = drawerAnalysisStepsView(
    { ...BASE, status: "uploaded", updatedAt: minutesAgo(20) },
    null,
    true,
  )!;
  expect(unclassified.failure).toBeUndefined();
  expect(unclassified.steps[2].state).toBe("now");
});

test("drawer: a stalled wait_or_ask reads its variant's drawer body", () => {
  const note = "You have used this month's analysis allowance.";
  const { body } = drawerStopped(
    drawerAnalysisStepsView(
      {
        ...BASE,
        status: "uploaded",
        updatedAt: minutesAgo(20),
        recovery: "wait_or_ask",
        errorCode: "QUOTA_EXCEEDED",
        note,
      },
      NOW,
      true,
    ),
  );
  expect(body.headline).toBe(note);
  expect(body.body).toBe(WAIT_OR_ASK_VARIANTS.allowance.drawerBody);
  expect(body.stalled).toBe(true);
});

test("drawer: a viewer who cannot act reads 'Analysis stopped' and the details line, never the note", () => {
  const note = "5 point(s) resolved no winner";
  const cases: MatchAnalysis[] = [
    { ...BASE, status: "failed", recovery: "retry", note },
    { ...BASE, status: "failed", recovery: "fix_recording", note },
    { ...BASE, status: "failed", recovery: "upload_again", note },
    {
      ...BASE,
      status: "failed",
      recovery: "wait_or_ask",
      errorCode: "NOT_ELIGIBLE",
      note,
    },
    { ...BASE, status: "derivation_failed", recovery: "rederive", note },
    {
      ...BASE,
      status: "derivation_failed",
      recovery: "stats_unavailable",
      note,
    },
    {
      ...BASE,
      status: "uploaded",
      updatedAt: minutesAgo(20),
      recovery: "retry",
      note,
    },
  ];
  for (const analysis of cases) {
    const view = drawerAnalysisStepsView(analysis, NOW, false);
    const { body } = drawerStopped(view);
    expect(DRAWER_NO_ACTION_TITLE).toBe("Analysis stopped");
    expect(body.headline, analysis.recovery).toBe("Analysis stopped");
    expect(body.body, analysis.recovery).toBe(DRAWER_NO_ACTION_BODY);
    expect(JSON.stringify(view), analysis.recovery).not.toContain(note);
  }
});

test("drawer: a raw failNote never reaches any label or body", () => {
  const raw =
    "Failed to fetch <Error><Code>AuthenticationFailed</Code></Error>";
  for (const status of IN_FLIGHT_OR_FAILED) {
    for (const updatedAt of [minutesAgo(1), minutesAgo(30)]) {
      for (const canAct of [true, false]) {
        const view = drawerAnalysisStepsView(
          { ...BASE, status, failNote: raw, updatedAt },
          NOW,
          canAct,
        );
        expect(JSON.stringify(view)).not.toContain("Failed to fetch");
        expect(JSON.stringify(view)).not.toContain("AuthenticationFailed");
      }
    }
  }
});
