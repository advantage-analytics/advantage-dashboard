import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { markJobUploaded } from "@/lib/services/splitstep/mark-job-uploaded";

/**
 * `markJobUploaded` against a hand-rolled fake of the one call it makes:
 * `from("processing_jobs").update(payload).eq("id", jobId)`. The fake answers
 * each call from a scripted list of outcomes, so the spec pins the retry
 * contract — one retry, never more — and that every attempt is keyed on the
 * job id, never on `match_id`.
 */

type Update = {
  table: string;
  payload: Record<string, unknown>;
  filters: Array<[string, unknown]>;
};

function fakeClient(outcomes: Array<"ok" | "error">) {
  const updates: Update[] = [];
  let call = 0;

  const supabase = {
    from(table: string) {
      return {
        update(payload: Record<string, unknown>) {
          const entry: Update = { table, payload, filters: [] };
          updates.push(entry);
          const outcome = outcomes[call++] ?? "error";
          return {
            eq: async (column: string, value: unknown) => {
              entry.filters.push([column, value]);
              return outcome === "ok"
                ? { error: null }
                : { error: { message: `write ${call} refused` } };
            },
          };
        },
      };
    },
  } as unknown as Pick<SupabaseClient, "from">;

  return { supabase, updates };
}

const input = { jobId: "job-1", videoObjectKey: "videos/match-1/clip.mp4" };

function expectUploadedWrite(update: Update) {
  expect(update.table).toBe("processing_jobs");
  expect(update.filters).toEqual([["id", "job-1"]]);
  expect(update.payload).toMatchObject({
    video_object_key: "videos/match-1/clip.mp4",
    status: "uploaded",
    upload_progress_percent: 100,
  });
  expect(typeof update.payload.updated_at).toBe("string");
}

test.describe("markJobUploaded", () => {
  test("succeeds on the first write with one call", async () => {
    const { supabase, updates } = fakeClient(["ok"]);
    await expect(markJobUploaded(supabase, input)).resolves.toEqual({
      ok: true,
    });
    expect(updates).toHaveLength(1);
    expectUploadedWrite(updates[0]);
  });

  test("retries once after a failed write and succeeds", async () => {
    const { supabase, updates } = fakeClient(["error", "ok"]);
    await expect(markJobUploaded(supabase, input)).resolves.toEqual({
      ok: true,
    });
    expect(updates).toHaveLength(2);
    for (const update of updates) expectUploadedWrite(update);
  });

  test("gives up after two failed writes", async () => {
    const { supabase, updates } = fakeClient(["error", "error", "ok"]);
    const result = await markJobUploaded(supabase, input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("write 2 refused");
    expect(updates).toHaveLength(2);
    for (const update of updates) expectUploadedWrite(update);
  });
});
