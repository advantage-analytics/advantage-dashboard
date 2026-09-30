import { expect, test } from "@playwright/test";

import {
  handleRederive,
  REDERIVE_DEADLINE_HEADROOM_MS,
  type RederiveDeps,
  type RederiveJobRow,
  type RederiveOutcome,
} from "@/app/api/splitstep/jobs/[jobId]/rederive/handler";

/**
 * `/api/splitstep/jobs/[jobId]/rederive`'s ladder, run against fakes: no
 * Supabase, no `deriveAndPublish()`. Every refusal asserts that neither the
 * claim nor the derive was reached; the accepted path asserts the claim ran
 * before the derive, and the derive ran exactly once with a deadline.
 */

const VIEWER = "u-player";
const OTHER_USER = "u-someone-else";
const JOB = "11111111-1111-4111-8111-111111111111";
const NOW = 1_700_000_000_000;
const MAX_DURATION = 60;

function jobRow(overrides: Partial<RederiveJobRow> = {}): RederiveJobRow {
  return {
    id: JOB,
    created_by: VIEWER,
    status: "derivation_failed",
    derivation_version: null,
    error_code: "DERIVATION_ERROR",
    error_category: null,
    error_step: null,
    external_job_id: "ext-1",
    updated_at: "2026-09-27T12:00:00Z",
    video_object_key: "videos/job-1.mp4",
    results_object_key: "results/job-1.json",
    ...overrides,
  };
}

interface Harness {
  deps: RederiveDeps;
  calls: string[];
  deriveDeadlines: number[];
}

function harness({
  userId = VIEWER as string | null,
  job = jobRow() as RederiveJobRow | null,
  claimed = true,
  outcome = { ok: true } as RederiveOutcome,
} = {}): Harness {
  const calls: string[] = [];
  const deriveDeadlines: number[] = [];
  return {
    calls,
    deriveDeadlines,
    deps: {
      async currentUserId() {
        calls.push("currentUserId");
        return userId;
      },
      async loadJob() {
        calls.push("loadJob");
        return { job, error: null };
      },
      async claimJob() {
        calls.push("claimJob");
        return { claimed, error: null };
      },
      async derive(_jobId, deadline) {
        calls.push("derive");
        deriveDeadlines.push(deadline);
        return outcome;
      },
      now: () => NOW,
    },
  };
}

async function run(h: Harness) {
  const response = await handleRederive(JOB, h.deps, {
    maxDurationSeconds: MAX_DURATION,
  });
  return { status: response.status, body: await response.json() };
}

test.describe("rederive handler", () => {
  test("401 when signed out, before the job is loaded", async () => {
    const h = harness({ userId: null });
    const { status, body } = await run(h);
    expect(status).toBe(401);
    expect(body.error).toBe("Not signed in");
    expect(h.calls).toEqual(["currentUserId"]);
  });

  test("404 for another user's job", async () => {
    const h = harness({ job: jobRow({ created_by: OTHER_USER }) });
    const { status, body } = await run(h);
    expect(status).toBe(404);
    expect(body.error).toBe("Job not found");
    expect(h.calls).not.toContain("claimJob");
    expect(h.calls).not.toContain("derive");
  });

  test("404 for a jobId that is not a UUID, before the job is loaded", async () => {
    const h = harness({});
    const response = await handleRederive("job-1", h.deps, {
      maxDurationSeconds: MAX_DURATION,
    });
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Job not found");
    expect(h.calls).toEqual(["currentUserId"]);
  });

  test("404 for a missing job", async () => {
    const h = harness({ job: null });
    const { status, body } = await run(h);
    expect(status).toBe(404);
    expect(body.error).toBe("Job not found");
    expect(h.calls).not.toContain("claimJob");
  });

  test("409 for a DERIVATION_REFUSED job", async () => {
    const h = harness({ job: jobRow({ error_code: "DERIVATION_REFUSED" }) });
    const { status, body } = await run(h);
    expect(status).toBe(409);
    expect(body.error).toBe("The statistics can't be rebuilt for this match.");
    expect(h.calls).not.toContain("claimJob");
    expect(h.calls).not.toContain("derive");
  });

  test("409 for a job not in derivation_failed", async () => {
    const h = harness({ job: jobRow({ status: "completed" }) });
    const { status } = await run(h);
    expect(status).toBe(409);
    expect(h.calls).not.toContain("claimJob");
    expect(h.calls).not.toContain("derive");
  });

  test("409 when the results are gone", async () => {
    const h = harness({ job: jobRow({ results_object_key: null }) });
    const { status } = await run(h);
    expect(status).toBe(409);
    expect(h.calls).not.toContain("claimJob");
  });

  test("409 on a lost claim, without deriving", async () => {
    const h = harness({ claimed: false });
    const { status, body } = await run(h);
    expect(status).toBe(409);
    expect(body.error).toBe("The statistics are already rebuilding.");
    expect(h.calls).toContain("claimJob");
    expect(h.calls).not.toContain("derive");
  });

  test("success claims, then derives exactly once with a deadline", async () => {
    const h = harness();
    const { status, body } = await run(h);
    expect(status).toBe(200);
    expect(body).toEqual({ jobId: JOB, status: "completed" });
    expect(h.calls).toEqual(["currentUserId", "loadJob", "claimJob", "derive"]);
    expect(h.deriveDeadlines).toEqual([
      NOW + MAX_DURATION * 1000 - REDERIVE_DEADLINE_HEADROOM_MS,
    ]);
  });

  test("a failed derive answers non-2xx with a plain message", async () => {
    const h = harness({
      outcome: { ok: false, reason: "calculate_match_stats failed: boom" },
    });
    const { status, body } = await run(h);
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body.error).toBe("The statistics could not be rebuilt.");
    expect(JSON.stringify(body)).not.toContain("boom");
    expect(h.calls.filter((c) => c === "derive")).toHaveLength(1);
  });
});
