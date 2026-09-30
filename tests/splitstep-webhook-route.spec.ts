import { expect, test } from "@playwright/test";
import { NextRequest, NextResponse } from "next/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The webhook's failed branch keys on the JOB ROW, not the payload (T3).
 *
 * `record_splitstep_webhook` advances `processing_jobs.status` under a rank
 * guard — never backwards, never off a terminal state — and returns the
 * status it left behind as `job_status`. The route used to gate quota
 * release, the failure mail and the auto-resubmit on `payload.nextStatus`
 * instead, so a `job_failed` for a job the row already held as `completed`
 * refunded minutes for an analysis that shipped, mailed "analysis failed"
 * over a finished match and could resubmit it. It now reads `job_status`.
 *
 * The route's POST is driven through the vm loader. `@/lib/supabase/admin`
 * answers the RPC with a fixture record, `webhook-auth` accepts, and every
 * side effect on the failed path — quota, resubmit, analysis mail — is a
 * recording fake. The completed branch's download/derive modules are stubbed
 * too, so loading the route never pulls their import trees in; they record
 * each call, which is how the completed-branch cases below prove a cancelled
 * row reaches none of them. `after()` runs its callback at once and the spec
 * awaits it, so each assertion sees the whole post-response block. `isDownloadFailure` is the real classifier,
 * loaded from `match-analysis.ts`. Nothing here opens a database or a socket.
 */

const JOB = "0b7f8a8e-4a0c-4f55-9d38-1f0a3a7e2c11";
const EXTERNAL_JOB = "ss-job-42";

type Row = Record<string, unknown>;

interface Calls {
  rpc: { name: string; args: Row }[];
  releaseQuota: unknown[][];
  notifyAnalysisOutcome: Row[];
  resubmitJob: Row[];
  /** The completed branch's seams, in call order. */
  pipeline: string[];
  warn: string[];
}

function record(jobStatus: string): Row {
  return {
    delivery_id: "d-1",
    matched_job_id: JOB,
    match_id: "m-1",
    created_by: "u-1",
    job_status: jobStatus,
    results_object_key: null,
    already_stored: false,
    trimmed_object_key: null,
    players_object_key: null,
    trajectories_object_key: null,
  };
}

// Loaded once: the real classifier the route's retry decision depends on.
const { isDownloadFailure } = createLoader().load(
  "src/lib/data/match-analysis.ts",
) as {
  isDownloadFailure: (code: string | null, step: string | null) => boolean;
};

function loadRoute(rpcRecord: Row, opts: { completedPath?: boolean } = {}) {
  const calls: Calls = {
    rpc: [],
    releaseQuota: [],
    notifyAnalysisOutcome: [],
    resubmitJob: [],
    pipeline: [],
    warn: [],
  };
  const pending: Promise<unknown>[] = [];
  // The completed branch's seams. Every call is recorded; outside a
  // completed-path test a call also throws, so the failed-path specs still
  // prove none of them runs.
  const seam =
    <T>(name: string, answer: T) =>
    async () => {
      calls.pipeline.push(name);
      if (!opts.completedPath)
        throw new Error(`${name} must not run on the failed path`);
      return answer;
    };

  const supabase = {
    rpc(name: string, args: Row) {
      calls.rpc.push({ name, args });
      return { single: async () => ({ data: rpcRecord, error: null }) };
    },
  };

  const loader = createLoader({
    globals: { URL },
    stubs: {
      "next/server": {
        NextRequest,
        NextResponse,
        after: (fn: () => Promise<unknown>) => {
          pending.push(fn());
        },
      },
      "@/lib/supabase/admin": { createAdminClient: () => supabase },
      "@/lib/services/splitstep/pipeline-log": {
        pipelineLog: {
          info: () => {},
          warn: (message: string) => {
            calls.warn.push(message);
          },
          error: () => {},
        },
        redactSignedUrls: (text: string) => text,
      },
      "@/lib/services/splitstep/webhook-auth": {
        SIGNATURE_HEADERS: ["x-hmac-signature"],
        verifyWebhookAuth: () => ({ ok: true, verified: true, reason: "test" }),
      },
      "@/lib/services/splitstep/quota": {
        releaseQuota: async (...args: unknown[]) => {
          calls.releaseQuota.push(args);
        },
      },
      "@/lib/services/splitstep/resubmit-job": {
        isDownloadFailure,
        resubmitJob: async (params: Row) => {
          calls.resubmitJob.push(params);
          return { ok: true, jobId: "j-child", externalJobId: "ss-child" };
        },
      },
      "@/lib/services/notifications/analysis-mail": {
        notifyAnalysisOutcome: async (params: Row) => {
          calls.notifyAnalysisOutcome.push(params);
        },
      },
      "@/lib/services/splitstep/grade-results": {
        gradeResults: seam("gradeResults", undefined),
      },
      "@/lib/services/splitstep/secure-results": {
        secureResults: seam("secureResults", {
          resultsSecured: true,
          body: "{}",
          objectKey: "results/key.json",
        }),
      },
      "@/lib/services/splitstep/derive-and-publish": {
        deriveAndPublish: seam("deriveAndPublish", { ok: true }),
      },
      "@/lib/services/splitstep/ball-paths-store": {
        deriveAndStoreBallPaths: seam("deriveAndStoreBallPaths", {
          status: "skipped",
        }),
      },
    },
  });

  const POST = loader.load("src/app/api/webhooks/splitstep/route.ts").POST as (
    request: NextRequest,
  ) => Promise<Response>;

  return {
    calls,
    /** POST the body, then wait for everything after() scheduled. */
    async deliver(body: Row) {
      const res = await POST(
        new NextRequest("http://localhost/api/webhooks/splitstep", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      await Promise.all(pending);
      return res;
    },
  };
}

test.describe("splitstep webhook — failed branch gated on the job row", () => {
  test("job_failed for a job the row holds as completed → 200, no release, no mail, no resubmit", async () => {
    const { calls, deliver } = loadRoute(record("completed"));

    const res = await deliver({
      event: "job_failed",
      job_id: EXTERNAL_JOB,
      error: { code: "INTERNAL_ERROR", step: "downloading_video" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, deliveryId: "d-1" });
    // The delivery was still recorded, and as a failure notice.
    expect(calls.rpc).toHaveLength(1);
    expect(calls.rpc[0].name).toBe("record_splitstep_webhook");
    expect(calls.rpc[0].args.p_next_status).toBe("failed");
    expect(calls.releaseQuota).toEqual([]);
    expect(calls.notifyAnalysisOutcome).toEqual([]);
    expect(calls.resubmitJob).toEqual([]);
  });

  test("job_failed for a job the row holds as derivation_failed → nothing runs either", async () => {
    const { calls, deliver } = loadRoute(record("derivation_failed"));

    const res = await deliver({ event: "job_failed", job_id: EXTERNAL_JOB });

    expect(res.status).toBe(200);
    expect(calls.releaseQuota).toEqual([]);
    expect(calls.notifyAnalysisOutcome).toEqual([]);
    expect(calls.resubmitJob).toEqual([]);
  });

  test("row failed, non-retryable code → quota released once, failure mail once, no resubmit", async () => {
    const { calls, deliver } = loadRoute(record("failed"));

    const res = await deliver({
      event: "job_failed",
      job_id: EXTERNAL_JOB,
      error: { code: "INVALID_VIDEO", step: "analysing" },
    });

    expect(res.status).toBe(200);
    expect(calls.releaseQuota).toHaveLength(1);
    expect(calls.releaseQuota[0][1]).toBe(JOB);
    expect(calls.notifyAnalysisOutcome).toHaveLength(1);
    expect(calls.notifyAnalysisOutcome[0]).toMatchObject({
      jobId: JOB,
      outcome: "failed",
    });
    expect(calls.resubmitJob).toEqual([]);
  });

  test("row failed at downloading_video → quota released, auto-resubmitted once, no mail", async () => {
    const { calls, deliver } = loadRoute(record("failed"));

    const res = await deliver({
      event: "job_failed",
      job_id: EXTERNAL_JOB,
      error: { code: "INTERNAL_ERROR", step: "downloading_video" },
    });

    expect(res.status).toBe(200);
    expect(calls.releaseQuota).toHaveLength(1);
    expect(calls.releaseQuota[0][1]).toBe(JOB);
    expect(calls.resubmitJob).toHaveLength(1);
    expect(calls.resubmitJob[0]).toMatchObject({ jobId: JOB, auto: true });
    expect(calls.notifyAnalysisOutcome).toEqual([]);
  });

  test("late job_processing on a row already failed → no release, no mail, no resubmit", async () => {
    // The parent of an auto-resubmit: its download failure sent no mail. A
    // straggling status delivery for it must not send one now.
    const { calls, deliver } = loadRoute(record("failed"));

    const res = await deliver({
      event: "job_processing",
      job_id: EXTERNAL_JOB,
    });

    expect(res.status).toBe(200);
    expect(calls.rpc[0].args.p_next_status).toBe("processing");
    expect(calls.releaseQuota).toEqual([]);
    expect(calls.notifyAnalysisOutcome).toEqual([]);
    expect(calls.resubmitJob).toEqual([]);
  });
});

test.describe("splitstep webhook — completed branch gated on a cancelled row", () => {
  const completion = {
    event: "job_completed",
    job_id: EXTERNAL_JOB,
    status: "job_completed",
    strokes_url:
      "https://splitstepclientvideos.blob.core.windows.net/out/strokes.json?sig=x",
  };

  test("job_completed for a job the row holds as cancelled → 200, nothing secured, graded or derived", async () => {
    const { calls, deliver } = loadRoute(record("cancelled"), {
      completedPath: true,
    });

    const res = await deliver(completion);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, deliveryId: "d-1" });
    // The envelope is still recorded — the urls stay recoverable by hand.
    expect(calls.rpc).toHaveLength(1);
    expect(calls.rpc[0].args.p_next_status).toBe("completed");
    expect(calls.pipeline).toEqual([]);
    expect(calls.notifyAnalysisOutcome).toEqual([]);
    expect(calls.warn.some((m) => m.includes("SKIPPED"))).toBe(true);
  });

  test("control: the same delivery on a live row secures, grades and derives", async () => {
    const { calls, deliver } = loadRoute(record("completed"), {
      completedPath: true,
    });

    const res = await deliver(completion);

    expect(res.status).toBe(200);
    expect(calls.pipeline).toEqual([
      "secureResults",
      "gradeResults",
      "deriveAndPublish",
      "deriveAndStoreBallPaths",
    ]);
    expect(calls.warn.some((m) => m.includes("SKIPPED"))).toBe(false);
  });
});
