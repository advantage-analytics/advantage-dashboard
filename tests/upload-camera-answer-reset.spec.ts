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
