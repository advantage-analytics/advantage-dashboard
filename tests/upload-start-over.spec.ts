import { expect, test } from "@playwright/test";

import { DEFAULT_FORM_DATA } from "@/components/dashboard/matches/new-match-wizard/types";
import { uploadWizardHarness } from "./fixtures/upload-wizard-hook";

/**
 * T5 — "Start over with a different player?" (`startOver()` in the hook).
 *
 * The subject decides `matches.player1_id`, and the video check (window + both
 * camera answers) and the score are all read relative to that player
 * (`docs/ui-revamp-guardrails.md` §3.1, §4). Starting over clears exactly the
 * per-player fields, writes the subject as null, returns to step 1 — and keeps
 * the video file, the source and the match's own facts.
 *
 * Driven through `uploadWizardHarness` — the real hook in a VM, no DOM.
 */

/** Every `formData` field `startOver()` resets, per the task. */
const RESET_FIELDS = [
  "playerName",
  "playerHand",
  "playerBackhand",
  "playerStyleSource",
  "opponentName",
  "opponentSource",
  "opponentPlayerId",
  "opponentHand",
  "opponentBackhand",
  "opponentStyleSource",
  "opponentProgramKey",
  "opponentSchool",
  "playerScores",
  "opponentScores",
  "playerTiebreaks",
  "opponentTiebreaks",
  "numberOfSets",
  "result",
  "retiredSide",
  "videoStartSeconds",
  "videoEndSeconds",
  "fixedCamera",
  "initialTopPlayerIsPlayer1",
] as const;

function videoFile(name = "court-one.mp4") {
  return new File(["video-bytes"], name, {
    type: "video/mp4",
    lastModified: 1_700_000_000_000,
  });
}

/**
 * A team video upload for a roster athlete, walked to the details step with
 * every per-player field filled in and a few match facts set beside them.
 */
async function filledIn(probeSeconds?: number) {
  const h = uploadWizardHarness({
    team: true,
    props: { initialProvider: "splitstep" },
  });
  await h.flush();

  h.current.whoPlayed.choose({
    kind: "roster",
    playerId: "athlete",
    name: "Player athlete",
  });
  h.render();
  expect(h.current.whoPlayed.subject).toMatchObject({ playerId: "athlete" });
  expect(h.current.formData.playerName).toBe("Player athlete");

  h.current.handleProviderContinue();
  h.render();
  expect(h.current.step).toBe("file");

  const file = videoFile();
  if (probeSeconds !== undefined) {
    h.checks.set(file.name, {
      promise: Promise.resolve({
        success: true,
        details: { video: { durationSeconds: probeSeconds } },
      }),
      resolve: () => {},
    });
  }
  await h.current.onVideoPick(file);
  await h.flush();
  expect(h.current.uploadedFile?.file).toBe(file);

  h.current.handleFileContinue();
  h.render();
  expect(h.current.step).toBe("trim");

  // The video check.
  h.current.handleTrimChange(120, 3000);
  h.render();
  h.current.handleInputChange("fixedCamera", true);
  h.current.handleInputChange("initialTopPlayerIsPlayer1", false);
  h.render();
  h.current.handleTrimContinue();
  h.render();
  expect(h.current.step).toBe("match");

  // The score and the opponent, typed.
  h.current.handleScoreChange("player", 0, "6");
  h.current.handleScoreChange("opponent", 0, "4");
  h.current.handleScoreChange("player", 1, "7");
  h.current.handleScoreChange("opponent", 1, "6");
  h.current.handleTiebreakChange("opponent", 1, "5");
  h.current.handleInputChange("opponentName", "Casey Opponent");
  h.current.handleInputChange("opponentHand", "left");
  h.current.handleInputChange("opponentBackhand", "one-handed");
  h.current.handleInputChange("playerHand", "right");
  h.current.handleInputChange("result", "Retired");
  h.current.handleInputChange("retiredSide", "opponent");
  h.current.handleInputChange("numberOfSets", 3);
  // Match facts — these describe the match whoever played it, and stay.
  h.current.handleInputChange("eventName", "Spring Invitational");
  h.current.handleInputChange("round", "R16");
  h.current.handleInputChange("courtType", "Clay Court");
  h.current.handleInputChange("adScoring", false);
  h.current.handleInputChange("date", "2026-09-20");
  h.current.handleInputChange("time", "14:30");
  h.render();

  expect(h.current.formData.playerScores[0]).toBe(6);
  expect(h.current.formData.opponentName).toBe("Casey Opponent");
  expect(h.current.formData.fixedCamera).toBe(true);
  expect(h.current.formData.initialTopPlayerIsPlayer1).toBe(false);
  return { h, file };
}

test("startOver returns to step 1 with no subject and every per-player field at its default", async () => {
  const { h, file } = await filledIn();
  const provider = h.current.selectedProvider;
  const uploaded = h.current.uploadedFile;
  const bestOf = h.current.formData.bestOf;

  h.current.startOver();
  h.render();

  expect(h.current.step).toBe("provider");
  expect(h.current.step).toBe(h.current.firstStep);
  expect(h.current.whoPlayed.subject).toBeNull();
  expect(h.current.error).toBeNull();
  expect(h.current.topPlayerAnswerStale).toBe(false);

  for (const field of RESET_FIELDS) {
    expect(h.current.formData[field], field).toEqual(DEFAULT_FORM_DATA[field]);
  }
  // Unanswered — never coerced to a boolean (guardrails §3.1).
  expect(h.current.formData.fixedCamera).toBeUndefined();
  expect(h.current.formData.initialTopPlayerIsPlayer1).toBeUndefined();

  // Kept: the file, the source, and the match's own facts.
  expect(h.current.uploadedFile).toBe(uploaded);
  expect(h.current.uploadedFile?.file).toBe(file);
  expect(h.current.selectedProvider).toBe(provider);
  expect(h.current.formData.eventName).toBe("Spring Invitational");
  expect(h.current.formData.round).toBe("R16");
  expect(h.current.formData.courtType).toBe("Clay Court");
  expect(h.current.formData.adScoring).toBe(false);
  expect(h.current.formData.bestOf).toBe(bestOf);
  expect(h.current.formData.date).toBe("2026-09-20");
  expect(h.current.formData.time).toBe("14:30");
  // The progress bar keeps the video flow's length.
  expect(h.current.progressTotalSteps).toBe(4);
});

test("startOver clears a stale top-player hint", async () => {
  const { h } = await filledIn();

  // Moving the start past the threshold drops the answer and raises the hint.
  h.current.handleTrimChange(400, 3000);
  h.render();
  expect(h.current.topPlayerAnswerStale).toBe(true);

  h.current.startOver();
  h.render();
  expect(h.current.topPlayerAnswerStale).toBe(false);
});

test("the drift rule starts fresh after a start-over", async () => {
  const { h } = await filledIn();
  h.current.startOver();
  h.render();

  // New window and a new answer: the old baseline (120 s) is gone, so a 20 s
  // adjustment from the NEW answer keeps it.
  h.current.handleTrimChange(600, 3000);
  h.render();
  h.current.handleInputChange("initialTopPlayerIsPlayer1", true);
  h.render();
  h.current.handleTrimChange(620, 3000);
  h.render();
  expect(h.current.formData.initialTopPlayerIsPlayer1).toBe(true);
  expect(h.current.topPlayerAnswerStale).toBe(false);
});

test("the next player goes through step 1 again, and the kept video gets its whole window back", async () => {
  const { h, file } = await filledIn(5400);
  h.current.startOver();
  h.render();

  // Continue is refused until someone is chosen again.
  h.current.handleProviderContinue();
  h.render();
  expect(h.current.step).toBe("provider");

  h.current.whoPlayed.choose({
    kind: "roster",
    playerId: "second",
    name: "Player second",
  });
  h.render();
  expect(h.current.formData.playerName).toBe("Player second");

  h.current.handleProviderContinue();
  h.render();
  expect(h.current.step).toBe("file");
  expect(h.current.uploadedFile?.file).toBe(file);

  h.current.handleFileContinue();
  h.render();
  expect(h.current.step).toBe("trim");
  expect(h.current.formData.videoStartSeconds).toBe(0);
  expect(h.current.formData.videoEndSeconds).toBe(5400);
  // Both camera questions are asked again.
  expect(h.current.formData.fixedCamera).toBeUndefined();
  expect(h.current.formData.initialTopPlayerIsPlayer1).toBeUndefined();
});

test("an attached lineup slot belongs to the old player and is dropped", async () => {
  const { h } = await filledIn();
  h.current.attachLine({
    entryId: "entry-1",
    matchId: "existing-match",
    eventId: "event-1",
    eventName: "Dual vs State",
    eventKind: "dual",
    slot: "S1",
    playerName: "Player athlete",
    opponentName: "Slot Opponent",
    opponentProgramKey: null,
    opponentSchool: null,
    date: "2026-09-21",
    site: "home" as never,
    surface: null,
    bestOf: 3,
    adScoring: true,
  });
  h.render();
  expect(h.current.attachedLine?.entryId).toBe("entry-1");

  h.current.startOver();
  h.render();
  expect(h.current.attachedLine).toBeNull();
  expect(h.current.formData.opponentName).toBe("");
});
