import { expect, test } from "@playwright/test";

import { DEFAULT_FORM_DATA } from "@/components/dashboard/matches/new-match-wizard/types";
import {
  parsedNames,
  uploadWizardHarness,
} from "./fixtures/upload-wizard-hook";

/**
 * T7 — "Not <name>?" on an IMPORT (SwingVision) flow:
 * `resetImportPlayerAnswer()` in the hook.
 *
 * No dialog, straight back to step 1. It clears only the player's own style
 * and the "is this player 1 in the export?" answer — never the subject (only
 * step 1's For field writes that, `docs/ui-revamp-guardrails.md`) and never
 * the opponent or score read from the kept file.
 *
 * Driven through `uploadWizardHarness` — the real hook in a VM, no DOM.
 */

/** A team import for a roster athlete, parsed, confirmed, on the details step. */
async function importedAndConfirmed() {
  const h = uploadWizardHarness({ team: true });
  await h.flush();

  h.current.whoPlayed.choose({
    kind: "roster",
    playerId: "athlete",
    name: "Riley Player",
  });
  h.render();
  expect(h.current.whoPlayed.subject).toMatchObject({ playerId: "athlete" });

  h.current.handleProviderContinue();
  h.render();
  expect(h.current.step).toBe("file");

  // The parse fills the opponent and the score.
  const pending = await h.pick("match.csv");
  pending.resolve(parsedNames("R. Player", "File Opponent"));
  await h.flush();
  expect(h.current.parsingState.parseSuccess).toBe(true);
  expect(h.current.formData.opponentName).toBe("File Opponent");
  expect(h.current.formData.playerScores).toEqual([6]);
  expect(h.current.formData.opponentScores).toEqual([4]);

  // "R. Player" vs "Riley Player" needs the player-1 confirmation.
  expect(h.current.importIdentity.comparison?.requiresConfirmation).toBe(true);
  h.current.importIdentity.confirm();
  h.render();
  expect(h.current.importIdentity.confirmed).toBe(true);

  h.current.handleInputChange("playerHand", "left");
  h.current.handleInputChange("playerBackhand", "one-handed");
  h.current.handleInputChange("playerStyleSource", "roster");
  h.render();
  expect(h.current.formData.playerHand).toBe("left");
  expect(h.current.formData.playerBackhand).toBe("one-handed");
  expect(h.current.formData.playerStyleSource).toBe("roster");

  h.current.handleFileContinue();
  h.render();
  expect(h.current.step).toBe("match");
  return h;
}

test("resetImportPlayerAnswer goes to step 1 clearing only the player's style and the identity answer", async () => {
  const h = await importedAndConfirmed();
  const subject = h.current.whoPlayed.subject;
  const provider = h.current.selectedProvider;
  const uploaded = h.current.uploadedFile;
  const before = { ...h.current.formData };

  h.current.resetImportPlayerAnswer();
  h.render();

  expect(h.current.step).toBe(h.current.firstStep);
  expect(h.current.step).toBe("provider");

  expect(h.current.formData.playerHand).toBeUndefined();
  expect(h.current.formData.playerBackhand).toBeUndefined();
  expect(h.current.formData.playerStyleSource).toBeUndefined();
  expect(h.current.formData.playerHand).toBe(DEFAULT_FORM_DATA.playerHand);

  // The answer is gone: the player-1 check asks again.
  expect(h.current.importIdentity.confirmed).toBe(false);
  expect(h.current.importIdentity.rejected).toBe(false);
  expect(h.current.importIdentity.blocked).toBe(true);

  // Nothing else: not the subject, not the file or source…
  expect(h.current.whoPlayed.subject).toEqual(subject);
  expect(h.current.selectedProvider).toBe(provider);
  expect(h.current.uploadedFile).toBe(uploaded);
  expect(h.current.importIdentity.parsedNames).toEqual({
    playerName: "R. Player",
    opponentName: "File Opponent",
  });

  // …and no other form field.
  expect({
    ...h.current.formData,
    playerHand: before.playerHand,
    playerBackhand: before.playerBackhand,
    playerStyleSource: before.playerStyleSource,
  }).toEqual(before);
  expect(h.current.formData.opponentName).toBe("File Opponent");
  expect(h.current.formData.playerScores).toEqual([6]);
  expect(h.current.formData.opponentScores).toEqual([4]);
});

test("hand-edited opponent and score survive resetImportPlayerAnswer", async () => {
  const h = await importedAndConfirmed();
  h.current.handleInputChange("opponentName", "Typed Opponent");
  h.current.handleScoreChange("player", 0, "7");
  h.current.handleScoreChange("opponent", 0, "5");
  h.render();

  h.current.resetImportPlayerAnswer();
  h.render();

  expect(h.current.formData.opponentName).toBe("Typed Opponent");
  expect(h.current.formData.playerScores[0]).toBe(7);
  expect(h.current.formData.opponentScores[0]).toBe(5);
});
