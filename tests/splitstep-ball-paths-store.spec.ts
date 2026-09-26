import { expect, test } from "@playwright/test";

import { deriveAndStoreBallPaths } from "@/lib/services/splitstep/ball-paths-store";

/**
 * `deriveAndStoreBallPaths` against a hand-rolled fake of the three client
 * calls it makes: one job-row read, two downloads, one upload. The derivation
 * itself is covered in splitstep-ball-paths.spec.ts — this file is about the
 * I/O contract: which keys are read, which key is written, and that every
 * failure comes back as a value instead of a rejection.
 */

type JobRow = {
  created_by: string | null;
  match_id: string | null;
  results_object_key: string | null;
  trajectories_object_key: string | null;
  start_time_seconds: number | null;
};

type Upload = {
  bucket: string;
  key: string;
  body: string;
  options: Record<string, unknown>;
};

function fakeClient(opts: {
  job: JobRow | null;
  objects?: Record<string, string>;
  rejectDownloads?: boolean;
}) {
  const uploads: Upload[] = [];
  const downloads: string[] = [];
  const selects: string[] = [];

  const supabase = {
    from(table: string) {
      expect(table).toBe("processing_jobs");
      return {
        select(columns: string) {
          selects.push(columns);
          return {
            eq(column: string, value: string) {
              expect(column).toBe("id");
              expect(value).toBe("job-1");
              return {
                single: async () =>
                  opts.job
                    ? { data: opts.job, error: null }
                    : { data: null, error: { message: "no rows" } },
              };
            },
          };
        },
      };
    },
    storage: {
      from(bucket: string) {
        return {
          download: async (key: string) => {
            downloads.push(key);
            if (opts.rejectDownloads) throw new Error("network down");
            const text = opts.objects?.[key];
            if (text === undefined) {
              return { data: null, error: { message: "Object not found" } };
            }
            return { data: new Blob([text]), error: null };
          },
          upload: async (
            key: string,
            body: string,
            options: Record<string, unknown>,
          ) => {
            uploads.push({ bucket, key, body, options });
            return { data: { path: key }, error: null };
          },
        };
      },
    },
  };

  return {
    supabase: supabase as unknown as Parameters<
      typeof deriveAndStoreBallPaths
    >[0]["supabase"],
    uploads,
    downloads,
    selects,
  };
}

const stroke = (frame: number, time: number, n: number) => ({
  event_id: n,
  frame,
  time,
  pred_rally_id: 1,
  pred_rally_stroke_number: n,
  pred_player_id: "player_a",
});

const trajectoryRow = (strokeFrame: number, frame: number, y: number) => ({
  stroke_frame: strokeFrame,
  bounce_frame: -9999,
  frame,
  ball_x_px: 640,
  ball_y_px: 360,
  ball_x_m: 0,
  ball_y_m: y,
  ball_z_m: 1,
});

// Read from the RECORDED keys — deliberately not the shape the output key has,
// the way an adopted delivery's `orphaned/…` key is not.
const RESULTS_KEY = "orphaned/ext-1/del-1.json";
const TRAJECTORIES_KEY = "orphaned/ext-1/del-1.trajectories.json";

const JOB: JobRow = {
  created_by: "user-1",
  match_id: "match-1",
  results_object_key: RESULTS_KEY,
  trajectories_object_key: TRAJECTORIES_KEY,
  start_time_seconds: 100,
};

const OBJECTS = {
  [RESULTS_KEY]: JSON.stringify([
    stroke(0, 0, 1),
    stroke(30, 1, 2),
    stroke(60, 2, 3),
  ]),
  [TRAJECTORIES_KEY]: JSON.stringify([
    trajectoryRow(30, 30, -5),
    trajectoryRow(30, 45, 0),
    trajectoryRow(30, 58, 5),
  ]),
};

test.describe("deriveAndStoreBallPaths", () => {
  test("a job with no trajectories file is skipped and nothing is uploaded", async () => {
    const fake = fakeClient({
      job: { ...JOB, trajectories_object_key: null },
      objects: OBJECTS,
    });

    const outcome = await deriveAndStoreBallPaths({
      supabase: fake.supabase,
      jobId: "job-1",
    });

    expect(outcome).toEqual({ status: "skipped", reason: "no_trajectories" });
    expect(fake.uploads).toHaveLength(0);
    expect(fake.downloads).toHaveLength(0);
  });

  test("a job with no stored results is skipped and nothing is uploaded", async () => {
    const fake = fakeClient({
      job: { ...JOB, results_object_key: null },
      objects: OBJECTS,
    });

    const outcome = await deriveAndStoreBallPaths({
      supabase: fake.supabase,
      jobId: "job-1",
    });

    expect(outcome).toEqual({ status: "skipped", reason: "no_results" });
    expect(fake.uploads).toHaveLength(0);
  });

  test("the happy path uploads once, to the derived key, a version 1 body", async () => {
    const fake = fakeClient({ job: JOB, objects: OBJECTS });

    const outcome = await deriveAndStoreBallPaths({
      supabase: fake.supabase,
      jobId: "job-1",
    });

    expect(fake.selects).toEqual([
      "created_by, match_id, results_object_key, trajectories_object_key, start_time_seconds",
    ]);
    expect([...fake.downloads].sort()).toEqual(
      [RESULTS_KEY, TRAJECTORIES_KEY].sort(),
    );

    expect(fake.uploads).toHaveLength(1);
    const [upload] = fake.uploads;
    expect(upload.bucket).toBe("match-results");
    expect(upload.key).toBe("results/user-1/match-1/job-1.ball-paths.json");
    expect(upload.options).toEqual({
      upsert: true,
      contentType: "application/json",
    });

    const parsed = JSON.parse(upload.body);
    expect(parsed.version).toBe(1);
    expect(parsed.strokes).toHaveLength(1);
    // start_time_seconds reached parseStrokes: contact is 1 s + the 100 s trim.
    expect(parsed.strokes[0].contactTime).toBe(101);

    expect(outcome).toEqual({
      status: "stored",
      objectKey: "results/user-1/match-1/job-1.ball-paths.json",
      bytes: Buffer.byteLength(upload.body),
      strokes: 1,
    });
  });

  test("a download that rejects comes back as failed, never as a throw", async () => {
    const fake = fakeClient({ job: JOB, rejectDownloads: true });

    const outcome = await deriveAndStoreBallPaths({
      supabase: fake.supabase,
      jobId: "job-1",
    });

    expect(outcome).toEqual({ status: "failed", error: "network down" });
    expect(fake.uploads).toHaveLength(0);
  });

  test("a missing object and a missing job row are both failed", async () => {
    const missingObject = fakeClient({ job: JOB, objects: {} });
    const a = await deriveAndStoreBallPaths({
      supabase: missingObject.supabase,
      jobId: "job-1",
    });
    expect(a.status).toBe("failed");
    expect(missingObject.uploads).toHaveLength(0);

    const missingJob = fakeClient({ job: null });
    const b = await deriveAndStoreBallPaths({
      supabase: missingJob.supabase,
      jobId: "job-1",
    });
    expect(b.status).toBe("failed");
  });
});
