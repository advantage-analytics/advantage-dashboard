import { expect, test } from "@playwright/test";

import {
  ballPathsObjectKey,
  resultsKeyUserSegment,
  resultsObjectKey,
} from "@/lib/services/splitstep/object-keys";

/**
 * T25 — `resultsKeyUserSegment`, the ONE anchored shape check shared by the
 * purge (`purge-match-storage.ts`) and the ball-paths reader
 * (`ball-paths-access.ts`). Both feed its answer to a service-role storage
 * call, so every reject case here is a file of someone else's that stays
 * unreachable.
 */

const MATCH = "11111111-1111-4111-8111-111111111111";
const OTHER_MATCH = "22222222-2222-4222-8222-222222222222";
const JOB = "33333333-3333-4333-8333-333333333333";
const OTHER_JOB = "44444444-4444-4444-8444-444444444444";
const UPLOADER = "55555555-5555-4555-8555-555555555555";

const segment = (
  resultsKey: unknown,
  matchId: unknown = MATCH,
  jobId: unknown = JOB,
) => resultsKeyUserSegment({ resultsObjectKey: resultsKey, matchId, jobId });

test("accepts exactly results/{segment}/{match_id}/{job_id}.json and returns the segment", () => {
  expect(segment(`results/${UPLOADER}/${MATCH}/${JOB}.json`)).toBe(UPLOADER);
  // The writer's own key builder round-trips.
  expect(
    segment(resultsObjectKey({ userId: UPLOADER, matchId: MATCH, jobId: JOB })),
  ).toBe(UPLOADER);
  // The segment is opaque: the fallback one is as valid as a uuid.
  expect(segment(`results/former-member/${MATCH}/${JOB}.json`)).toBe(
    "former-member",
  );
});

test("returns a bare segment, never a finished key", () => {
  const found = segment(`results/${UPLOADER}/${MATCH}/${JOB}.json`);
  expect(found).not.toContain("/");
  expect(
    ballPathsObjectKey({ userId: found!, matchId: MATCH, jobId: JOB }),
  ).toBe(`results/${UPLOADER}/${MATCH}/${JOB}.ball-paths.json`);
});

const REJECTED_KEYS: Array<[string, unknown]> = [
  ["a null key", null],
  ["an undefined key", undefined],
  ["a non-string key", 42],
  ["an object key", { key: `results/${UPLOADER}/${MATCH}/${JOB}.json` }],
  ["an empty key", ""],
  ["a wrong prefix", `videos/${UPLOADER}/${MATCH}/${JOB}.json`],
  ["an orphaned key", `orphaned/${UPLOADER}/${MATCH}/${JOB}.json`],
  [
    "an orphaned key wrapping a results key",
    `orphaned/results/${UPLOADER}/${MATCH}/${JOB}.json`,
  ],
  ["too few segments", `results/${MATCH}/${JOB}.json`],
  ["too many segments", `results/${UPLOADER}/extra/${MATCH}/${JOB}.json`],
  ["a trailing slash", `results/${UPLOADER}/${MATCH}/${JOB}.json/`],
  ["a leading slash", `/results/${UPLOADER}/${MATCH}/${JOB}.json`],
  ["an empty segment", `results//${MATCH}/${JOB}.json`],
  ["another match's id", `results/${UPLOADER}/${OTHER_MATCH}/${JOB}.json`],
  ["another job's id", `results/${UPLOADER}/${MATCH}/${OTHER_JOB}.json`],
  ["a .players.json name", `results/${UPLOADER}/${MATCH}/${JOB}.players.json`],
  [
    "a .trajectories.json name",
    `results/${UPLOADER}/${MATCH}/${JOB}.trajectories.json`,
  ],
  [
    "a .ball-paths.json name",
    `results/${UPLOADER}/${MATCH}/${JOB}.ball-paths.json`,
  ],
  ["no extension", `results/${UPLOADER}/${MATCH}/${JOB}`],
  ["a job-id prefix match", `results/${UPLOADER}/${MATCH}/x${JOB}.json`],
];

for (const [name, key] of REJECTED_KEYS) {
  test(`rejects ${name}`, () => {
    expect(segment(key)).toBeNull();
  });
}

test("rejects empty, non-string or slash-bearing ids even when the key would line up", () => {
  const key = `results/${UPLOADER}/${MATCH}/${JOB}.json`;
  for (const bad of [undefined, null, "", 7]) {
    // Called directly: `segment`'s defaults would swallow an `undefined`.
    expect(
      resultsKeyUserSegment({
        resultsObjectKey: key,
        matchId: bad,
        jobId: JOB,
      }),
    ).toBeNull();
    expect(
      resultsKeyUserSegment({
        resultsObjectKey: key,
        matchId: MATCH,
        jobId: bad,
      }),
    ).toBeNull();
  }
  // A slash-bearing id could otherwise be made to "match" a shifted key.
  expect(segment(`results/${UPLOADER}/a/b/${JOB}.json`, "a/b", JOB)).toBeNull();
  expect(
    segment(`results/${UPLOADER}/${MATCH}/a/b.json`, MATCH, "a/b"),
  ).toBeNull();
  // An empty job id must not accept a bare ".json" name.
  expect(segment(`results/${UPLOADER}/${MATCH}/.json`, MATCH, "")).toBeNull();
});
