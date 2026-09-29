import { expect, test } from "@playwright/test";

import { createLoader } from "./fixtures/vm-modules";

/**
 * `secureResults()` — the webhook's results-securing step, extracted so the
 * reconciler can run it too — against an injected `fetch` and a fake Supabase
 * client that records every Storage upload and RPC call. The pipeline logger
 * is stubbed so the log lines (unchanged from the route) can be asserted.
 *
 *  - success uploads the body to `match-results` and finalizes with the key,
 *    which is what sets `results_object_key`;
 *  - a non-2xx or a thrown fetch finalizes with a null key and the error,
 *    which is the `processing_error` write, and returns false;
 *  - with no delivery id the RPC still runs, with `p_delivery_id: null`.
 */

const JOB = "job-1";
const DELIVERY = "del-1";
// On the vendor's account: the fetch is host-allowlisted (result-url-policy.ts)
// and that guard has its own spec, secure-results-host-guard.spec.ts.
const URL_ =
  "https://splitstepclientvideos.blob.core.windows.net/out/job/strokes.json?sig=abc";
const KEY = "results/user-1/match-1/job-1.json";
const LOG = "[splitstep-webhook]";

type Upload = { bucket: string; key: string; body: string; opts: unknown };
type Rpc = { fn: string; args: Record<string, unknown> };
type Log = { level: string; message: string; detail: unknown };

function fakeSupabase(uploadError?: string) {
  const uploads: Upload[] = [];
  const rpcs: Rpc[] = [];
  const client = {
    storage: {
      from(bucket: string) {
        return {
          async upload(key: string, body: Blob, opts: unknown) {
            uploads.push({ bucket, key, body: await body.text(), opts });
            return { error: uploadError ? { message: uploadError } : null };
          },
        };
      },
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcs.push({ fn, args });
      return { error: null };
    },
  };
  return { client, uploads, rpcs };
}

function load() {
  const logs: Log[] = [];
  const record =
    (level: string) =>
    (message: string, detail?: unknown): void => {
      logs.push({ level, message, detail });
    };
  const loader = createLoader({
    globals: { Error, Blob, AbortSignal, URL },
    stubs: {
      "./pipeline-log": {
        pipelineLog: {
          info: record("info"),
          warn: record("warn"),
          error: record("error"),
        },
      },
    },
  });
  const mod = loader.load("src/lib/services/splitstep/secure-results.ts");
  return {
    secureResults: mod.secureResults as (p: Record<string, unknown>) => Promise<
      | {
          resultsSecured: true;
          objectKey: string;
          bytes: number;
          body?: string;
        }
      | { resultsSecured: false; error: string }
    >,
    logs,
  };
}

function fetchReturning(status: number, body: string, statusText = "") {
  const calls: string[] = [];
  const impl = async (url: string) => {
    calls.push(url);
    return new Response(body, { status, statusText });
  };
  return { impl, calls };
}

test.describe("secureResults", () => {
  test("success stores the file and finalizes with the results key", async () => {
    const { secureResults, logs } = load();
    const fake = fakeSupabase();
    const json = '{"points":[]}';
    const f = fetchReturning(200, json);

    const out = await secureResults({
      supabase: fake.client,
      deliveryId: DELIVERY,
      jobId: JOB,
      strokesUrl: URL_,
      objectKey: KEY,
      logPrefix: LOG,
      io: { fetch: f.impl },
    });

    expect(out).toEqual({
      resultsSecured: true,
      objectKey: KEY,
      bytes: json.length,
      body: json,
    });
    expect(f.calls).toEqual([URL_]);
    expect(fake.uploads).toEqual([
      {
        bucket: "match-results",
        key: KEY,
        body: json,
        opts: { contentType: "application/json", upsert: true },
      },
    ]);
    // This call is what sets results_object_key on the delivery and the job.
    expect(fake.rpcs).toEqual([
      {
        fn: "finalize_splitstep_results",
        args: {
          p_delivery_id: DELIVERY,
          p_job_id: JOB,
          p_results_object_key: KEY,
          p_error: null,
        },
      },
    ]);
    expect(logs).toEqual([
      {
        level: "info",
        message: `${LOG} results stored`,
        detail: { jobId: JOB, objectKey: KEY, bytes: json.length },
      },
    ]);
  });

  test("a non-2xx download writes processing_error and returns false", async () => {
    const { secureResults, logs } = load();
    const fake = fakeSupabase();
    const f = fetchReturning(403, "denied", "Forbidden");

    const out = await secureResults({
      supabase: fake.client,
      deliveryId: DELIVERY,
      jobId: JOB,
      strokesUrl: URL_,
      objectKey: KEY,
      io: { fetch: f.impl },
    });

    const error = "Vendor returned 403 Forbidden";
    expect(out).toEqual({ resultsSecured: false, error });
    expect(fake.uploads).toEqual([]);
    expect(fake.rpcs).toEqual([
      {
        fn: "finalize_splitstep_results",
        args: {
          p_delivery_id: DELIVERY,
          p_job_id: JOB,
          p_results_object_key: null,
          p_error: error,
        },
      },
    ]);
    expect(logs).toEqual([
      {
        level: "error",
        message: `${LOG} results download FAILED — recover from the stored strokes url (processing_jobs.sas_url)`,
        detail: { deliveryId: DELIVERY, jobId: JOB, error },
      },
    ]);
  });

  test("a thrown fetch writes processing_error and returns false", async () => {
    const { secureResults } = load();
    const fake = fakeSupabase();

    const out = await secureResults({
      supabase: fake.client,
      deliveryId: DELIVERY,
      jobId: JOB,
      strokesUrl: URL_,
      objectKey: KEY,
      io: {
        fetch: async () => {
          throw new Error("connect ETIMEDOUT");
        },
      },
    });

    expect(out).toEqual({ resultsSecured: false, error: "connect ETIMEDOUT" });
    expect(fake.uploads).toEqual([]);
    expect(fake.rpcs).toHaveLength(1);
    expect(fake.rpcs[0].args).toEqual({
      p_delivery_id: DELIVERY,
      p_job_id: JOB,
      p_results_object_key: null,
      p_error: "connect ETIMEDOUT",
    });
  });

  test("an empty body and a failed upload are failures too", async () => {
    const { secureResults } = load();

    const empty = fakeSupabase();
    const emptyOut = await secureResults({
      supabase: empty.client,
      deliveryId: DELIVERY,
      jobId: JOB,
      strokesUrl: URL_,
      objectKey: KEY,
      io: { fetch: fetchReturning(200, "   ").impl },
    });
    expect(emptyOut).toEqual({
      resultsSecured: false,
      error: "Vendor returned an empty body",
    });
    expect(empty.uploads).toEqual([]);
    expect(empty.rpcs[0].args.p_results_object_key).toBeNull();

    const refused = fakeSupabase("bucket not found");
    const refusedOut = await secureResults({
      supabase: refused.client,
      deliveryId: DELIVERY,
      jobId: JOB,
      strokesUrl: URL_,
      objectKey: KEY,
      io: { fetch: fetchReturning(200, "{}").impl },
    });
    expect(refusedOut).toEqual({
      resultsSecured: false,
      error: "Storage upload failed: bucket not found",
    });
    expect(refused.rpcs[0].args).toMatchObject({
      p_results_object_key: null,
      p_error: "Storage upload failed: bucket not found",
    });
  });

  test("without a delivery the RPC runs with a null delivery id", async () => {
    const { secureResults, logs } = load();
    const fake = fakeSupabase();

    const out = await secureResults({
      supabase: fake.client,
      jobId: JOB,
      strokesUrl: URL_,
      objectKey: KEY,
      io: { fetch: fetchReturning(200, "{}").impl },
    });

    expect(out.resultsSecured).toBe(true);
    expect(fake.rpcs[0].args).toEqual({
      p_delivery_id: null,
      p_job_id: JOB,
      p_results_object_key: KEY,
      p_error: null,
    });
    // The default prefix is the webhook's own.
    expect(logs[0].message).toBe("[splitstep-webhook] results stored");
  });
});
