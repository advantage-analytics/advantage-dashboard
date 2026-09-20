import { expect, test } from "@playwright/test";

import { uploadWizardHarness } from "./fixtures/upload-wizard-hook";

/**
 * When a moved window start drops the top-player answer (T11).
 *
 * `initialTopPlayerIsPlayer1` is camera-relative and describes the FIRST FRAME
 * OF THE SELECTED WINDOW (`docs/ui-revamp-guardrails.md` §4). Move the start
 * across a changeover and the answer silently inverts — every statistic then
 * belongs to the other player with nothing looking broken on screen. So the
 * hook clears it past `TOP_PLAYER_ANSWER_RESET_SECONDS` (30 s): longer than
 * every fine-positioning step the trim step offers, shorter than a change of
 * ends, and measured from the start AT ANSWER TIME so repeated small jumps add
 * up instead of resetting the yardstick.
 *
 * Driven through `uploadWizardHarness` — the real hook in a VM, no DOM. All
 * four UI paths that move the start (the drag release, the arrow nudge, `I`,
 * and the start CutField's Set button) reach `handleTrimChange`, so it is the
 * one seam under test.
 */

/** Establish a window and an answer, with `fixedCamera` already given. */
async function answeredAt(startSeconds: number) {
  const h = uploadWizardHarness({ props: { initialProvider: "splitstep" } });
  await h.flush();

  h.current.handleTrimChange(startSeconds, 3600);
  h.render();
  h.current.handleInputChange("fixedCamera", true);
  h.current.handleInputChange("initialTopPlayerIsPlayer1", true);
  h.render();

  expect(h.current.formData.initialTopPlayerIsPlayer1).toBe(true);
  expect(h.current.topPlayerAnswerStale).toBe(false);
  return h;
}

test("a start move inside the threshold keeps the answer", async () => {
  const h = await answeredAt(100);

  // 29 s — a couple of 10 s jumps while hunting for the first serve.
  h.current.handleTrimChange(129, 3600);
  h.render();

  expect(h.current.formData.initialTopPlayerIsPlayer1).toBe(true);
  expect(h.current.topPlayerAnswerStale).toBe(false);
  expect(h.current.formData.fixedCamera).toBe(true);
});

test("a start move past the threshold clears the answer, and only that answer", async () => {
  const h = await answeredAt(100);

  // 31 s — past the fine-positioning range, so the frame it described is gone.
  h.current.handleTrimChange(131, 3600);
  h.render();

  expect(h.current.formData.initialTopPlayerIsPlayer1).toBeUndefined();
  expect(h.current.topPlayerAnswerStale).toBe(true);
  // The camera question is about the whole recording and is never touched.
  expect(h.current.formData.fixedCamera).toBe(true);
  // The window itself still moved, and the duration still follows it.
  expect(h.current.formData.videoStartSeconds).toBe(131);
  expect(h.current.formData.videoEndSeconds).toBe(3600);
});

test("creep is cumulative from the answer, not from the previous window", async () => {
  const h = await answeredAt(100);

  // Three 15 s steps: 15 and 30 are inside the threshold, 45 is not. Measured
  // step by step none of them would ever clear it.
  h.current.handleTrimChange(115, 3600);
  h.render();
  expect(h.current.formData.initialTopPlayerIsPlayer1).toBe(true);

  h.current.handleTrimChange(130, 3600);
  h.render();
  expect(h.current.formData.initialTopPlayerIsPlayer1).toBe(true);
  expect(h.current.topPlayerAnswerStale).toBe(false);

  h.current.handleTrimChange(145, 3600);
  h.render();
  expect(h.current.formData.initialTopPlayerIsPlayer1).toBeUndefined();
  expect(h.current.topPlayerAnswerStale).toBe(true);
  expect(h.current.formData.fixedCamera).toBe(true);
});

test("moving only the end never clears the answer, however far it goes", async () => {
  const h = await answeredAt(100);

  // Ten minutes off the end: the first frame is exactly where it was.
  h.current.handleTrimChange(100, 3000);
  h.render();

  expect(h.current.formData.initialTopPlayerIsPlayer1).toBe(true);
  expect(h.current.topPlayerAnswerStale).toBe(false);
  expect(h.current.formData.fixedCamera).toBe(true);
  expect(h.current.formData.videoEndSeconds).toBe(3000);
});

test("re-answering re-anchors the baseline", async () => {
  const h = await answeredAt(100);

  h.current.handleTrimChange(400, 3600);
  h.render();
  expect(h.current.formData.initialTopPlayerIsPlayer1).toBeUndefined();
  expect(h.current.topPlayerAnswerStale).toBe(true);

  // Answered again for the new first frame: the distance is now measured from
  // 400, so a 20 s adjustment is an adjustment and not a third answer.
  h.current.handleInputChange("initialTopPlayerIsPlayer1", false);
  h.render();
  expect(h.current.topPlayerAnswerStale).toBe(false);

  h.current.handleTrimChange(420, 3600);
  h.render();
  expect(h.current.formData.initialTopPlayerIsPlayer1).toBe(false);
  expect(h.current.topPlayerAnswerStale).toBe(false);
  expect(h.current.formData.fixedCamera).toBe(true);
});

/**
 * The other way an answer stops describing the video: the video itself changes.
 *
 * `handleTrimChange`'s drift rule only fires when a handle moves. Swapping the
 * recording rewrites the window from `onVideoPick` instead, so the rule never
 * runs — and both answers would render as already given, for frames from a
 * file that is no longer loaded. `fixedCamera` goes too: it describes the
 * WHOLE recording, so a different recording invalidates it outright.
 */

/** A picked video, distinguishable from another by name/size/mtime. */
function videoFile(name: string, lastModified = 1_700_000_000_000) {
  return new File(["video-bytes"], name, {
    type: "video/mp4",
    lastModified,
  });
}

/** Both camera questions answered, against `file`. */
async function answeredFor(file: File) {
  const h = uploadWizardHarness({ props: { initialProvider: "splitstep" } });
  await h.flush();

  await h.current.onVideoPick(file);
  await h.flush();

  h.current.handleTrimChange(0, 3600);
  h.render();
  h.current.handleInputChange("fixedCamera", true);
  h.current.handleInputChange("initialTopPlayerIsPlayer1", true);
  h.render();

  expect(h.current.formData.fixedCamera).toBe(true);
  expect(h.current.formData.initialTopPlayerIsPlayer1).toBe(true);
  return h;
}

test("picking a different video clears both camera answers", async () => {
  const h = await answeredFor(videoFile("court-one.mp4"));

  // A different recording — possibly shot from the other side of the court.
  await h.current.onVideoPick(videoFile("court-two.mp4", 1_700_009_999_000));
  await h.flush();

  expect(h.current.formData.initialTopPlayerIsPlayer1).toBeUndefined();
  expect(h.current.formData.fixedCamera).toBeUndefined();
  // Not "stale": that hint says the window start moved, which is not what
  // happened. Both questions are asked again with their usual hints.
  expect(h.current.topPlayerAnswerStale).toBe(false);
});

test("a swap re-anchors the drift rule instead of keeping the old baseline", async () => {
  const h = await answeredFor(videoFile("court-one.mp4"));

  // Answered at start 0 on the first file; the second file starts at 0 too.
  await h.current.onVideoPick(videoFile("court-two.mp4", 1_700_009_999_000));
  await h.flush();
  h.current.handleInputChange("initialTopPlayerIsPlayer1", false);
  h.render();

  // Well inside the threshold, measured from the NEW answer's own start.
  h.current.handleTrimChange(20, 3600);
  h.render();
  expect(h.current.formData.initialTopPlayerIsPlayer1).toBe(false);

  h.current.handleTrimChange(80, 3600);
  h.render();
  expect(h.current.formData.initialTopPlayerIsPlayer1).toBeUndefined();
  expect(h.current.topPlayerAnswerStale).toBe(true);
});

test("re-picking the same file without removing it keeps the answers", async () => {
  const h = await answeredFor(videoFile("court-one.mp4"));

  // Picking the same recording again — through the file input, no Remove in
  // between — changes nothing either answer describes. (Remove IS a clear, and
  // it nulls the signature, so that route is the test above, not this one.)
  await h.current.onVideoPick(videoFile("court-one.mp4"));
  await h.flush();

  expect(h.current.formData.initialTopPlayerIsPlayer1).toBe(true);
  expect(h.current.formData.fixedCamera).toBe(true);
});

test("removing the video clears both camera answers", async () => {
  const h = await answeredFor(videoFile("court-one.mp4"));

  h.current.handleRemoveVideo();
  h.render();

  expect(h.current.formData.initialTopPlayerIsPlayer1).toBeUndefined();
  expect(h.current.formData.fixedCamera).toBeUndefined();
  expect(h.current.topPlayerAnswerStale).toBe(false);
});
