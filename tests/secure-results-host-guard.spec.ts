import { expect, test } from "@playwright/test";

import { createLoader } from "./fixtures/vm-modules";
import { withEnv } from "./fixtures/with-env";

/**
 * `secureResults()` in front of the result-host allowlist. What this pins:
 *
 *  - a strokes url on a host outside the list never reaches the injected
 *    `fetch`, the outcome is `resultsSecured: false` with the refusal as its
 *    error, `finalize_splitstep_results` still records that reason, and no
 *    log line carries the url — the host only;
 *  - an allowed url is fetched exactly once with `redirect: "error"`, so a
 *    hop off the allowlisted host is refused rather than followed.
 *
 * Same harness as `tests/secure-results.spec.ts`: the vm loader with the
 * pipeline logger stubbed and a fake Supabase client. `result-url-policy.ts`
 * is loaded for real — it is pure and reads `process.env` at call time,
 * which is what lets `withEnv` pin the host list per test.
 */

const ENV_KEYS = ["SPLITSTEP_RESULT_HOSTS", "AZURE_STORAGE_ACCOUNT"] as const;

const JOB = "job-1";
const DELIVERY = "del-1";
const KEY = "results/user-1/match-1/job-1.json";
const LOG = "[splitstep-webhook]";

const VENDOR_URL =
  "https://splitstepclientvideos.blob.core.windows.net/out/job-1/strokes.json?sv=1&sig=SECRET";
const EVIL_URL = "https://evil.example/strokes.json?sv=1&sig=SECRET";

type Rpc = { fn: string; args: Record<string, unknown> };
type Log = { level: string; message: string; detail: unknown };
type FetchCall = { url: string; init: RequestInit | undefined };

function fakeSupabase() {
  const uploads: string[] = [];
  const rpcs: Rpc[] = [];
  const client = {
    storage: {
      from() {
        return {
          async upload(key: string) {
            uploads.push(key);
            return { error: null };
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

function recordingFetch(body = '{"points":[]}') {
  const calls: FetchCall[] = [];
  const impl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(body, { status: 200 });
  };
  return { impl, calls };
}

test.describe("secureResults — result-host guard", () => {
  test("a disallowed host is never fetched and the outcome is resultsSecured: false", async () => {
    await withEnv(ENV_KEYS, {}, async () => {
      const { secureResults, logs } = load();
      const fake = fakeSupabase();
      const f = recordingFetch();

      const out = await secureResults({
        supabase: fake.client,
        deliveryId: DELIVERY,
        jobId: JOB,
        strokesUrl: EVIL_URL,
        objectKey: KEY,
        logPrefix: LOG,
        io: { fetch: f.impl },
      });

      expect(f.calls).toEqual([]);
      expect(fake.uploads).toEqual([]);
      expect(out).toEqual({
        resultsSecured: false,
        error: "result url host not allowed: evil.example",
      });

      // The refusal still reaches processing_error, like any download failure.
      expect(fake.rpcs).toEqual([
        {
          fn: "finalize_splitstep_results",
          args: {
            p_delivery_id: DELIVERY,
            p_job_id: JOB,
            p_results_object_key: null,
            p_error: "result url host not allowed: evil.example",
          },
        },
      ]);

      // The guard's own line names the host; nothing logged carries the url.
      const refusal = logs.find((l) =>
        l.message.includes("result url host not allowed"),
      );
      expect(refusal?.level).toBe("error");
      expect(refusal?.detail).toEqual({
        objectKey: KEY,
        hostname: "evil.example",
      });
      for (const line of logs) {
        expect(JSON.stringify(line)).not.toContain("evil.example/strokes");
        expect(JSON.stringify(line)).not.toContain("sig=SECRET");
      }
    });
  });

  test("a suffix-spoofed vendor host is refused the same way", async () => {
    await withEnv(ENV_KEYS, {}, async () => {
      const { secureResults } = load();
      const fake = fakeSupabase();
      const f = recordingFetch();

      const out = await secureResults({
        supabase: fake.client,
        jobId: JOB,
        strokesUrl:
          "https://splitstepclientvideos.blob.core.windows.net.evil.example/strokes.json?sig=x",
        objectKey: KEY,
        io: { fetch: f.impl },
      });

      expect(f.calls).toEqual([]);
      expect(out).toEqual({
        resultsSecured: false,
        error:
          "result url host not allowed: splitstepclientvideos.blob.core.windows.net.evil.example",
      });
    });
  });

  test("an allowed host is fetched once, with redirect: 'error'", async () => {
    await withEnv(ENV_KEYS, {}, async () => {
      const { secureResults, logs } = load();
      const fake = fakeSupabase();
      const json = '{"points":[]}';
      const f = recordingFetch(json);

      const out = await secureResults({
        supabase: fake.client,
        deliveryId: DELIVERY,
        jobId: JOB,
        strokesUrl: VENDOR_URL,
        objectKey: KEY,
        logPrefix: LOG,
        io: { fetch: f.impl },
      });

      expect(f.calls).toHaveLength(1);
      expect(f.calls[0].url).toBe(VENDOR_URL);
      expect(f.calls[0].init?.redirect).toBe("error");
      expect(out).toEqual({
        resultsSecured: true,
        objectKey: KEY,
        bytes: json.length,
        body: json,
      });
      expect(fake.uploads).toEqual([KEY]);
      expect(logs.some((l) => l.level === "error")).toBe(false);
    });
  });

  test("SPLITSTEP_RESULT_HOSTS admits an extra host at the fetch", async () => {
    await withEnv(
      ENV_KEYS,
      { SPLITSTEP_RESULT_HOSTS: "evil.example" },
      async () => {
        const { secureResults } = load();
        const fake = fakeSupabase();
        const f = recordingFetch();

        const out = await secureResults({
          supabase: fake.client,
          jobId: JOB,
          strokesUrl: EVIL_URL,
          objectKey: KEY,
          io: { fetch: f.impl },
        });

        expect(f.calls).toHaveLength(1);
        expect(out.resultsSecured).toBe(true);
      },
    );
  });
});
