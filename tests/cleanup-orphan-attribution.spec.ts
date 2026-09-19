import { expect, test } from "@playwright/test";

import {
  attributeKey,
  MATCH_DATA_LAYOUTS,
  RESULTS_LAYOUTS,
  VIDEO_LAYOUTS,
} from "../scripts/orphan-attribution";

/**
 * `cleanup-orphan-storage.ts --apply` deletes what it cannot attribute to a
 * live match. These tests pin the one property that keeps that safe: a key is
 * attributed only when a layout the store actually writes explains it, and
 * anything else comes back null — reported, never deleted.
 *
 * The case that made this necessary is the last describe block.
 */

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MATCH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const JOB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ATTACHMENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

test.describe("layouts each store writes are attributed to their match", () => {
  test("the Azure container: source video and the vendor's trimmed copy", () => {
    expect(
      attributeKey(`videos/${USER}/${MATCH}/original.mp4`, VIDEO_LAYOUTS),
    ).toBe(MATCH);
    expect(
      attributeKey(`videos/${USER}/${MATCH}/original.mov`, VIDEO_LAYOUTS),
    ).toBe(MATCH);
    expect(
      attributeKey(`trimmed/${USER}/${MATCH}/${JOB}.mp4`, VIDEO_LAYOUTS),
    ).toBe(MATCH);
  });

  test("the results bucket, including the per-frame siblings", () => {
    expect(
      attributeKey(`results/${USER}/${MATCH}/${JOB}.json`, RESULTS_LAYOUTS),
    ).toBe(MATCH);
    expect(
      attributeKey(
        `results/${USER}/${MATCH}/${JOB}.players.json`,
        RESULTS_LAYOUTS,
      ),
    ).toBe(MATCH);
    expect(
      attributeKey(
        `results/${USER}/${MATCH}/${JOB}.trajectories.json`,
        RESULTS_LAYOUTS,
      ),
    ).toBe(MATCH);
  });

  test("the match-data bucket, which leads with the user rather than a prefix", () => {
    expect(
      attributeKey(
        `${USER}/swing-vision/${MATCH}/match.xlsx`,
        MATCH_DATA_LAYOUTS,
      ),
    ).toBe(MATCH);
  });
});

test.describe("a store is only offered the layouts it writes", () => {
  // The match-data layout has no literal prefix, so it matches on shape alone.
  // That is safe only because it is never handed to another store — this is the
  // assertion that keeps it that way.
  test("the match-data shape does not attribute inside the video container", () => {
    expect(
      attributeKey(`${USER}/swing-vision/${MATCH}/match.xlsx`, VIDEO_LAYOUTS),
    ).toBeNull();
  });

  test("a video key does not attribute inside the results bucket", () => {
    expect(
      attributeKey(`videos/${USER}/${MATCH}/original.mp4`, RESULTS_LAYOUTS),
    ).toBeNull();
  });
});

test.describe("anything unexplained is left alone", () => {
  test("a wrong-length, prefix-less or non-uuid key is not attributed", () => {
    for (const key of [
      `videos/${USER}/${MATCH}`, // too few segments
      `videos/${USER}/${MATCH}/nested/original.mp4`, // too many
      `videos/${USER}/not-a-uuid/original.mp4`, // match slot is not an id
      `archive/${USER}/${MATCH}/original.mp4`, // unknown prefix
      "", // empty
    ]) {
      expect(attributeKey(key, VIDEO_LAYOUTS), key).toBeNull();
    }
  });

  test("the match-data layout still needs a uuid where the user goes", () => {
    expect(
      attributeKey(
        `exports/swing-vision/${MATCH}/match.xlsx`,
        MATCH_DATA_LAYOUTS,
      ),
    ).toBeNull();
  });
});

test.describe("the attachment layout that made this necessary", () => {
  /**
   * The SwingVision "attach video to an existing match" feature writes
   * `match-video/{match_id}/{attachment_id}/…` into the same Azure container as
   * `videos/…`. It puts the match id SECOND, so the sweeper's old
   * third-segment rule read the ATTACHMENT id as a match id, found no such
   * match, and called every attachment blob an orphan. `--apply` would have
   * deleted live, playable athlete video.
   *
   * These blobs are not this sweeper's to collect even when they are genuinely
   * dead: the attachment lifecycle has its own worker with leases, a SAS-expiry
   * margin and copy-abort-before-delete ordering. Null here is the whole fix.
   */
  test("staged and final attachment blobs are never attributed", () => {
    expect(
      attributeKey(
        `match-video/${MATCH}/${ATTACHMENT}/staged.mp4`,
        VIDEO_LAYOUTS,
      ),
    ).toBeNull();
    expect(
      attributeKey(
        `match-video/${MATCH}/${ATTACHMENT}/final.mp4`,
        VIDEO_LAYOUTS,
      ),
    ).toBeNull();
  });

  test("the attachment id is not mistaken for the match id", () => {
    // The old rule returned ATTACHMENT here, which is what made a live blob
    // look orphaned. Nothing may return it now.
    expect(
      attributeKey(
        `match-video/${MATCH}/${ATTACHMENT}/final.mp4`,
        VIDEO_LAYOUTS,
      ),
    ).not.toBe(ATTACHMENT);
  });
});
