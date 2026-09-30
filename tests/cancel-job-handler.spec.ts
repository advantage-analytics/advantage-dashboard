import { expect, test } from "@playwright/test";

import {
  ALREADY_STARTED_MESSAGE,
  handleCancelJob,
  readVendorDelete,
  VENDOR_UNAVAILABLE_MESSAGE,
  type CancelJobDeps,
  type CancelJobRow,
  type VendorDeleteOutcome,
} from "@/app/api/splitstep/jobs/[jobId]/cancel/handler";

/**
 * `/api/splitstep/jobs/[jobId]/cancel`'s ladder, run against fakes: no
 * Supabase, no vendor. Every refusal asserts which seams were reached, and
 * above all that `markCancelled` — the row flip and allowance release — never
 * runs unless the vendor answered 2xx.
 */

const VIEWER = "u-player";
const OTHER_USER = "u-someone-else";
const JOB = "11111111-1111-4111-8111-111111111111";
const EXTERNAL = "vendor-job-1";

function jobRow(overrides: Partial<CancelJobRow> = {}): CancelJobRow {
  return {
    id: JOB,
    created_by: VIEWER,
    status: "queued",
    external_job_id: EXTERNAL,
    ...overrides,
  };
}

interface Harness {
  deps: CancelJobDeps;
  calls: string[];
  vendorIds: string[];
  markArgs: [string, string][];
}

function harness({
  userId = VIEWER as string | null,
  job = jobRow() as CancelJobRow | null,
  vendor = { kind: "removed" } as VendorDeleteOutcome,
  marked = "cancelled" as string | null,
} = {}): Harness {
  const calls: string[] = [];
  const vendorIds: string[] = [];
  const markArgs: [string, string][] = [];
  return {
    calls,
    vendorIds,
    markArgs,
    deps: {
      async currentUserId() {
        calls.push("currentUserId");
        return userId;
      },
      async loadJob() {
        calls.push("loadJob");
        return { job, error: null };
      },
      async deleteAtVendor(externalJobId) {
        calls.push("deleteAtVendor");
        vendorIds.push(externalJobId);
        return vendor;
      },
      async markCancelled(jobId, user) {
        calls.push("markCancelled");
        markArgs.push([jobId, user]);
        return { status: marked, error: null };
      },
    },
  };
}

async function run(h: Harness, jobId = JOB) {
  const response = await handleCancelJob(jobId, h.deps);
  return {
    status: response.status,
    body: await response.json(),
    cacheControl: response.headers.get("cache-control"),
  };
}

test.describe("cancel job handler", () => {
  test("401 when signed out, before the job is loaded", async () => {
    const h = harness({ userId: null });
    const { status, body } = await run(h);
    expect(status).toBe(401);
    expect(body.code).toBe("unauthenticated");
    expect(h.calls).toEqual(["currentUserId"]);
  });

  test("404 for a jobId that is not a UUID, before the job is loaded", async () => {
    const h = harness();
    const { status, body } = await run(h, "job-1");
    expect(status).toBe(404);
    expect(body.code).toBe("job_not_found");
    expect(h.calls).toEqual(["currentUserId"]);
  });

  test("404 for another user's job — the same 404 as a missing one", async () => {
    const foreign = harness({ job: jobRow({ created_by: OTHER_USER }) });
    const missing = harness({ job: null });
    const a = await run(foreign);
    const b = await run(missing);
    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
    expect(a.body.error).toBe(b.body.error);
    expect(a.body.code).toBe(b.body.code);
    for (const h of [foreign, missing]) {
      expect(h.calls).toEqual(["currentUserId", "loadJob"]);
    }
  });

  for (const status of ["processing", "completed", "failed", "cancelled"]) {
    test(`409 already_started for a ${status} job, without calling the vendor`, async () => {
      const h = harness({ job: jobRow({ status }) });
      const { status: http, body } = await run(h);
      expect(http).toBe(409);
      expect(body.code).toBe("already_started");
      expect(h.calls).not.toContain("deleteAtVendor");
      expect(h.calls).not.toContain("markCancelled");
    });
  }

  test("409 already_started for a queued job with no vendor id yet", async () => {
    const h = harness({ job: jobRow({ external_job_id: null }) });
    const { status, body } = await run(h);
    expect(status).toBe(409);
    expect(body.code).toBe("already_started");
    expect(h.calls).not.toContain("deleteAtVendor");
  });

  test("vendor 2xx → markCancelled, then 200 { status: cancelled }", async () => {
    const h = harness({ job: jobRow({ status: "submitting" }) });
    const { status, body, cacheControl } = await run(h);
    expect(status).toBe(200);
    expect(body).toEqual({ status: "cancelled" });
    expect(cacheControl).toBe("private, no-store");
    expect(h.calls).toEqual([
      "currentUserId",
      "loadJob",
      "deleteAtVendor",
      "markCancelled",
    ]);
    expect(h.vendorIds).toEqual([EXTERNAL]);
    expect(h.markArgs).toEqual([[JOB, VIEWER]]);
  });

  test("vendor 409 JOB_NOT_REMOVABLE → 409 already_started", async () => {
    const h = harness({
      vendor: { kind: "refused", status: 409, code: "JOB_NOT_REMOVABLE" },
    });
    const { status, body } = await run(h);
    expect(status).toBe(409);
    expect(body.code).toBe("already_started");
    expect(body.error).toBe(ALREADY_STARTED_MESSAGE);
    expect(h.calls).not.toContain("markCancelled");
  });

  test("vendor 404 JOB_NOT_FOUND → 409 not_cancellable", async () => {
    const h = harness({
      vendor: { kind: "refused", status: 404, code: "JOB_NOT_FOUND" },
    });
    const { status, body } = await run(h);
    expect(status).toBe(409);
    expect(body.code).toBe("not_cancellable");
    expect(h.calls).not.toContain("markCancelled");
  });

  const unavailable: [string, VendorDeleteOutcome][] = [
    ["a network error", { kind: "unreachable", reason: "network_TypeError" }],
    ["a timeout", { kind: "unreachable", reason: "timeout" }],
    ["a 5xx", { kind: "refused", status: 502, code: null }],
    [
      "503 STATUS_UNAVAILABLE",
      { kind: "refused", status: 503, code: "STATUS_UNAVAILABLE" },
    ],
    [
      "401 UNAUTHORIZED",
      { kind: "refused", status: 401, code: "UNAUTHORIZED" },
    ],
  ];
  for (const [label, vendor] of unavailable) {
    test(`vendor ${label} → 503 vendor_unavailable`, async () => {
      const h = harness({ vendor });
      const { status, body } = await run(h);
      expect(status).toBe(503);
      expect(body.code).toBe("vendor_unavailable");
      expect(body.error).toBe(VENDOR_UNAVAILABLE_MESSAGE);
      expect(h.calls).toContain("deleteAtVendor");
      expect(h.calls).not.toContain("markCancelled");
    });
  }

  test("vendor 2xx but the row moved on → 409 not_cancellable", async () => {
    const h = harness({ marked: null });
    const { status, body } = await run(h);
    expect(status).toBe(409);
    expect(body.code).toBe("not_cancellable");
    expect(h.calls).toContain("markCancelled");
  });
});

test.describe("readVendorDelete", () => {
  test("any 2xx is removed, whatever the body", () => {
    expect(readVendorDelete(200, "Removed job abc from queue.")).toEqual({
      kind: "removed",
    });
    expect(readVendorDelete(204, "")).toEqual({ kind: "removed" });
  });

  test("reads error.code at the top level", () => {
    const body = JSON.stringify({
      job_id: "abc",
      error: { code: "JOB_NOT_REMOVABLE", category: "state", message: "m" },
    });
    expect(readVendorDelete(409, body)).toEqual({
      kind: "refused",
      status: 409,
      code: "JOB_NOT_REMOVABLE",
    });
  });

  test("reads error.code nested under detail", () => {
    const body = JSON.stringify({
      detail: { job_id: "abc", error: { code: "JOB_NOT_FOUND" } },
    });
    expect(readVendorDelete(404, body)).toEqual({
      kind: "refused",
      status: 404,
      code: "JOB_NOT_FOUND",
    });
  });

  test("a non-JSON error body has no code", () => {
    expect(readVendorDelete(502, "<html>Bad Gateway</html>")).toEqual({
      kind: "refused",
      status: 502,
      code: null,
    });
  });
});
