import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { applyVideoUploadEvent } from "@/components/dashboard/matches/new-match-wizard/upload-progress";
import { ensureJobLive } from "@/lib/services/splitstep/job-liveness";

/**
 * `ensureJobLive` — what an upload asks before it writes anything more: is
 * this job still mine to finish?
 *
 * A tab whose laptop slept is reaped after 15 minutes and would carry on when
 * it wakes. Beside a second upload of the same match that overwrites the newer
 * upload's blocks and can publish a mix of two files, because the blob is
 * named per match. So once its job is `failed` an upload is over: it stops
 * before the next block and never commits. There is no taking a reaped job
 * back — see the module's header for why.
 */

function fakeClient(options: {
  status?: string;
  readError?: boolean;
  missing?: boolean;
}) {
  let writes = 0;
  const supabase = {
    from(table: string) {
      expect(table).toBe("processing_jobs");
      return {
        select(columns: string) {
          expect(columns).toBe("status");
          return {
            eq(column: string, value: string) {
              expect([column, value]).toEqual(["id", "job-1"]);
              return {
                maybeSingle: async () =>
                  options.readError
                    ? { data: null, error: { message: "offline" } }
                    : {
                        data: options.missing
                          ? null
                          : { status: options.status },
                        error: null,
                      },
              };
            },
          };
        },
        update() {
          writes += 1;
          throw new Error("ensureJobLive must never write");
        },
      };
    },
  } as unknown as Pick<SupabaseClient, "from">;
  return { supabase, writes: () => writes };
}

test("a job still uploading, or already past it, is live", async () => {
  for (const status of [
    "uploading",
    "pending",
    "uploaded",
    "queued",
    "processing",
    "completed",
  ]) {
    const { supabase } = fakeClient({ status });
    await expect(ensureJobLive(supabase, "job-1")).resolves.toBe("live");
  }
});

test("a failed job is over, whoever failed it, and is never taken back", async () => {
  const { supabase, writes } = fakeClient({ status: "failed" });
  await expect(ensureJobLive(supabase, "job-1")).resolves.toBe("superseded");
  expect(writes()).toBe(0);
});

test("a read that fails is not evidence: a blip must not stop a healthy upload", async () => {
  const offline = fakeClient({ readError: true });
  await expect(ensureJobLive(offline.supabase, "job-1")).resolves.toBe(
    "unknown",
  );
});

test("a job that no longer exists is over too: the match was deleted", async () => {
  const missing = fakeClient({ missing: true });
  await expect(ensureJobLive(missing.supabase, "job-1")).resolves.toBe(
    "superseded",
  );
});

const read = (file: string) =>
  readFileSync(resolve(process.cwd(), file), "utf8");

test("every PUT attempt asks first: each block, each retry, and the commit", () => {
  const blocks = read("src/lib/services/upload/azure-block-upload.ts");
  // The hook runs inside the retry loop, ahead of the request.
  const retry = blocks.slice(blocks.indexOf("async function putWithRetry("));
  const ask = retry.indexOf("await beforeAttempt?.();");
  const send = retry.indexOf("await put(params);");
  expect(ask).toBeGreaterThan(
    retry.indexOf("for (let attempt = 1; ; attempt++)"),
  );
  expect(send).toBeGreaterThan(ask);
  expect(blocks).toContain('beforeRequest && (() => beforeRequest("block")),');
  expect(blocks).toContain('beforeRequest && (() => beforeRequest("commit")),');
});

test("the upload stops before the URL, after a pause, and always before the commit", () => {
  const submit = read("src/lib/services/splitstep/submit-match-video.ts");

  // Before asking for an upload URL — the route writes onto the LIVE job.
  const url = submit.indexOf('await fetch("/api/splitstep/upload-url"');
  expect(
    submit.lastIndexOf("await refuseIfSuperseded(true);", url),
  ).toBeGreaterThan(-1);

  // Unforced checks are throttled; the commit is always forced.
  expect(submit).toContain(
    "if (!force && Date.now() - livenessCheckedAt < LIVENESS_CHECK_MS) return;",
  );
  expect(submit).toContain(
    'beforeRequest: (kind) => refuseIfSuperseded(kind === "commit"),',
  );

  // Only an answer resets the clock. A woken laptop is often offline for its
  // first seconds; a read that failed must not buy thirty seconds of blind
  // writes, and the commit asks more than once before going on unanswered.
  const check = submit.slice(
    submit.indexOf("const stopIfSuperseded = async (force: boolean) => {"),
    submit.indexOf("const refuseIfSuperseded = async (force: boolean) => {"),
  );
  const reset = check.indexOf("livenessCheckedAt = Date.now();");
  expect(reset).toBeGreaterThan(check.indexOf('if (liveness === "live") {'));
  expect(check.indexOf("livenessCheckedAt = ")).toBe(reset);
  expect(check).toContain(
    "const attempts = force ? LIVENESS_COMMIT_ATTEMPTS : 1;",
  );

  // The heartbeat only lands on a job still uploading, and a miss asks.
  const heartbeat = submit.slice(
    submit.indexOf(".update({ upload_progress_percent: pct })"),
  );
  expect(heartbeat.slice(0, 200)).toContain(
    '.in("status", ["pending", "uploading"])',
  );
  expect(heartbeat.slice(0, 700)).toContain("void stopIfSuperseded(true);");

  // A superseded upload leaves its row alone: someone else settled it.
  const guard = submit.indexOf("if (!superseded) {");
  const failWrite = submit.indexOf('status: "failed"', guard);
  expect(guard).toBeGreaterThan(-1);
  expect(failWrite).toBeGreaterThan(guard);
  expect(submit.indexOf('status: "failed"')).toBe(failWrite);
  // And it never lands on a job that got past uploading.
  expect(submit.slice(failWrite, failWrite + 500)).toContain(
    '.in("status", ["pending", "uploading"]);',
  );
});

test("a replaced upload's ending does not land on its replacement in the same tab", () => {
  const started = applyVideoUploadEvent(new Map(), {
    matchId: "m1",
    kind: "started",
    fileName: "b.mp4",
    jobId: "job-b",
    cancel: () => {},
  });

  // The old upload of the same match stops, naming its own job.
  const ignored = applyVideoUploadEvent(started, {
    matchId: "m1",
    kind: "failed",
    error: "ended",
    jobId: "job-a",
  });
  expect(ignored).toBe(started);
  expect(ignored.get("m1")?.phase).toBe("uploading");
  expect(ignored.get("m1")?.cancel).toBeDefined();

  // Its own ending, and an unnamed one, still land.
  for (const jobId of ["job-b", undefined]) {
    const failed = applyVideoUploadEvent(started, {
      matchId: "m1",
      kind: "failed",
      error: "ended",
      jobId,
    });
    expect(failed.get("m1")?.phase).toBe("failed");
  }
});
