import { expect, test } from "@playwright/test";

import {
  backupObjectKey,
  labelFold,
  publishPlanned,
  type ApplyContext,
  type LabelApplyBackup,
  type planApply,
} from "@/lib/services/labels/apply-session";

/** "Mark complete" publishes; these are the refusals that come before any write. */

/** A client that fails the test on any use: refusals touch nothing. */
const UNTOUCHED = new Proxy(
  {},
  {
    get() {
      throw new Error("the database was touched before a refusal");
    },
  },
) as Parameters<typeof publishPlanned>[0]["db"];

const CONTEXT = {
  session: { id: "s1", matchId: "m1", jobId: "j1" },
  beside: { vendor: [], startTimeSeconds: 0, bestOf: 3 },
} as unknown as ApplyContext;

function plan(
  fields: Partial<{
    problems: string[];
    points: number;
    mismatch: boolean;
  }>,
): ReturnType<typeof planApply> {
  return {
    built: {
      problems: fields.problems ?? [],
      warnings: [],
      letsLeftOut: 0,
      points: Array.from({ length: fields.points ?? 1 }, (_, i) => ({
        point_number: i + 1,
        shots: [],
      })),
    },
    sets: [],
    entered: null,
    mismatch: fields.mismatch
      ? { setNumber: 1, labelled: "4–5", entered: "3–6", reasons: [] }
      : null,
    stats: {},
  } as unknown as ReturnType<typeof planApply>;
}

test("a score mismatch not accepted, or no points: refused, nothing touched", async () => {
  const refuse = async (p: ReturnType<typeof planApply>, acceptScore = false) =>
    publishPlanned({ db: UNTOUCHED, context: CONTEXT, plan: p, acceptScore });

  const mismatch = await refuse(plan({ mismatch: true }));
  expect(mismatch).toEqual({
    ok: false,
    error:
      "Not published: Set 1: labelled 4–5, entered 3–6. Fix the set, mark the video as ending early, or correct the match record.",
  });

  expect(await refuse(plan({ points: 0 }))).toEqual({
    ok: false,
    error: "Not published: there are no points to write.",
  });
});

test("a build problem no longer refuses: the publish goes on past it", async () => {
  // With no job the publish stops at the backup — after the problems, which
  // it reaches and passes; a problem used to stop it first.
  const jobless = {
    ...CONTEXT,
    session: { ...CONTEXT.session, jobId: null },
  } as ApplyContext;
  const result = await publishPlanned({
    db: UNTOUCHED,
    context: jobless,
    plan: plan({ problems: ["Point 4 has no winner"] }),
    acceptScore: true,
  });
  expect(result).toEqual({
    ok: false,
    error:
      "Not published: the match's video job is gone, so the backup would have nowhere to be recorded.",
  });
});

test("a session whose job is gone is refused before anything is stored", async () => {
  const jobless = {
    ...CONTEXT,
    session: { ...CONTEXT.session, jobId: null },
  } as ApplyContext;
  const result = await publishPlanned({
    db: UNTOUCHED,
    context: jobless,
    plan: plan({}),
    acceptScore: false,
  });
  expect(result).toEqual({
    ok: false,
    error:
      "Not published: the match's video job is gone, so the backup would have nowhere to be recorded.",
  });
});

test("backups are keyed match first, so the match purge accepts them as its own", () => {
  const backup = {
    createdAt: "2026-10-10T19:00:00.000Z",
    sessionId: "s1",
    matchId: "m1",
  } as LabelApplyBackup;
  expect(backupObjectKey(backup)).toBe(
    "label-backups/m1/s1/2026-10-10T19-00-00-000Z.json",
  );
  expect(backupObjectKey(backup).startsWith("label-backups/m1/")).toBe(true);
});

test("a publish answers the report's fold note from the labelled score", () => {
  // Matching score, or a video marked as ending early: the note goes away.
  expect(labelFold(plan({}))).toEqual({ reconciled: true, source: "labels" });
  // A mismatch published anyway (Mark complete accepts it): the note stays.
  expect(labelFold(plan({ mismatch: true }))).toEqual({
    reconciled: false,
    source: "labels",
  });
});
