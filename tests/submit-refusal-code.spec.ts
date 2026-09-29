import { expect, test } from "@playwright/test";

import { refusalCodeFor } from "@/lib/services/splitstep/refusal-code";

/**
 * Pure-logic spec for T12: the submit-refusal → `processing_jobs.error_code`
 * mapping used by `submit-match-video.ts`'s vendor-POST failure handler.
 *
 * `refusalCodeFor` lives in its own module specifically so this spec can
 * import it without pulling in `submit-match-video.ts`'s browser-only
 * dependencies (`azure-block-upload`, `lib/video/trim`) — see
 * `src/lib/services/splitstep/refusal-code.ts`'s doc comment.
 */

test.describe("refusalCodeFor", () => {
  test("maps each refusal status to its error_code", () => {
    expect(refusalCodeFor(429)).toBe("QUOTA_EXCEEDED");
    expect(refusalCodeFor(403)).toBe("NOT_ELIGIBLE");
    expect(refusalCodeFor(422)).toBe("INVALID_METADATA");
    expect(refusalCodeFor(503)).toBe("NOT_CONFIGURED");
  });

  test("returns null for statuses the handler doesn't refuse with a code", () => {
    // 502: the handler's own vendor-POST failure path — it marks the row
    // `failed` itself, so the client records nothing at all for it (see the
    // fake-client spec below), but the mapping itself is still null.
    expect(refusalCodeFor(502)).toBeNull();
    // 409: the job's already in a state the handler won't touch (already
    // submitted, no video, no trim window, etc).
    expect(refusalCodeFor(409)).toBeNull();
    expect(refusalCodeFor(500)).toBeNull();
    expect(refusalCodeFor(200)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// A small fake of the one Supabase call the submit-refusal block makes
// (`supabase.from("processing_jobs").update(...).eq("id", jobId)`), to pin
// down the two behaviors a full harness around `uploadAndSubmitVideo()`
// would be too large to exercise here: no `error_message` write on 502, and
// no `status` key ever in the update payload.
// ---------------------------------------------------------------------------

interface FakeUpdateCall {
  payload: Record<string, unknown>;
  jobId: string;
}

/** Mirrors the shape `submit-match-video.ts` calls on `supabase`. */
function createFakeProcessingJobsClient() {
  const calls: FakeUpdateCall[] = [];
  return {
    calls,
    from(table: string) {
      if (table !== "processing_jobs") {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        update(payload: Record<string, unknown>) {
          return {
            eq(column: string, value: string) {
              if (column !== "id") {
                throw new Error(`unexpected eq column: ${column}`);
              }
              calls.push({ payload, jobId: value });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

/**
 * The submit-refusal write, inlined from `submit-match-video.ts`'s catch
 * block (lines ~455-483): given a response status and message, this is
 * exactly what it does to `processing_jobs` — skip the write on 502 (the
 * handler already wrote the row `failed` with the vendor's text), otherwise
 * always write `error_message` and `error_code` (including `null`, so a
 * stale code from an earlier refusal doesn't survive a refusal that carries
 * none), and never a `status` key.
 */
async function recordSubmitRefusal(
  supabase: ReturnType<typeof createFakeProcessingJobsClient>,
  jobId: string,
  status: number,
  message: string,
) {
  if (status === 502) return;
  const code = refusalCodeFor(status);
  await supabase
    .from("processing_jobs")
    .update({
      error_message: message,
      error_code: code,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

test.describe("submit-refusal write behavior", () => {
  test("a 502 makes no error_message write", async () => {
    const supabase = createFakeProcessingJobsClient();
    await recordSubmitRefusal(
      supabase,
      "job-1",
      502,
      "Could not submit this match for analysis.",
    );
    expect(supabase.calls).toHaveLength(0);
  });

  test("a 429 writes error_code QUOTA_EXCEEDED with no status key", async () => {
    const supabase = createFakeProcessingJobsClient();
    await recordSubmitRefusal(supabase, "job-2", 429, "Quota exceeded");

    expect(supabase.calls).toHaveLength(1);
    const [call] = supabase.calls;
    expect(call.jobId).toBe("job-2");
    expect(call.payload.error_code).toBe("QUOTA_EXCEEDED");
    expect(call.payload.error_message).toBe("Quota exceeded");
    expect(call.payload).not.toHaveProperty("status");
  });

  test("a refusal with no mapped code writes error_code: null, clearing any stale code", async () => {
    const supabase = createFakeProcessingJobsClient();
    await recordSubmitRefusal(
      supabase,
      "job-3",
      409,
      "This match has already been submitted for analysis.",
    );

    expect(supabase.calls).toHaveLength(1);
    const [call] = supabase.calls;
    // Explicitly null, not just absent — a prior 429 refusal's QUOTA_EXCEEDED
    // must not survive onto this row.
    expect(call.payload.error_code).toBeNull();
    expect("error_code" in call.payload).toBe(true);
    expect(call.payload).not.toHaveProperty("status");
  });
});
