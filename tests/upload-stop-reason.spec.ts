import { expect, test } from "@playwright/test";

import {
  parsedNames,
  uploadWizardHarness,
} from "./fixtures/upload-wizard-hook";

/**
 * What `matches.stop_reason` the save writes, read off the row `handleCreateMatch`
 * hands to `insert` (`h.writes[0]`). Driven through the personal SwingVision
 * import path — the one save the harness runs end to end without video or
 * quota machinery — with the score and the early-end answer set by hand after
 * the parse, as the details step would. The import is never ASKED "did it end
 * early?", but a stopped result it already carries is honoured the same way,
 * so the write-time mapping is the same code a video upload runs.
 */

type Harness = ReturnType<typeof uploadWizardHarness>;

async function readyToSave(): Promise<Harness> {
  const h = uploadWizardHarness();
  await h.flush();
  h.current.handleProviderContinue();
  h.render();
  const file = await h.pick("match.csv");
  file.resolve(parsedNames("Riley Player"));
  await h.flush();
  h.current.handleInputChange("playerHand", "right");
  h.current.handleInputChange("playerBackhand", "two-handed");
  h.current.handleInputChange("opponentHand", "left");
  h.current.handleInputChange("opponentBackhand", "one-handed");
  h.current.handleInputChange("date", "2026-09-10");
  h.render();
  h.current.handleFileContinue();
  h.render();
  return h;
}

function score(h: Harness, player: number[], opponent: number[]) {
  // As the details step enters it: the format first, then each set cell.
  h.current.handleFormatChange("3");
  h.render();
  player.forEach((games, index) => {
    h.current.handleScoreChange("player", index, String(games));
    h.render();
  });
  opponent.forEach((games, index) => {
    h.current.handleScoreChange("opponent", index, String(games));
    h.render();
  });
}

async function saved(h: Harness) {
  await h.current.handleCreateMatch();
  h.render();
  expect(h.current.error).toBeNull();
  expect(h.writes).toHaveLength(1);
  return h.writes[0] as Record<string, unknown>;
}

test.describe("matches.stop_reason from the wizard", () => {
  test("Unfinished because the dual was clinched", async () => {
    const h = await readyToSave();
    score(h, [6, 3], [4, 2]);
    h.current.handleInputChange("result", "Unfinished");
    h.current.handleInputChange("stopReason", "clinched");
    h.render();
    expect(await saved(h)).toMatchObject({
      result: "Unfinished",
      stop_reason: "clinched",
    });
  });

  test("Unfinished for time or weather", async () => {
    const h = await readyToSave();
    score(h, [6, 3], [4, 2]);
    h.current.handleInputChange("result", "Unfinished");
    h.current.handleInputChange("stopReason", "time_weather");
    h.render();
    expect(await saved(h)).toMatchObject({
      result: "Unfinished",
      stop_reason: "time_weather",
    });
  });

  test("Retired writes 'retired' beside the winner the retirement decides", async () => {
    const h = await readyToSave();
    score(h, [6, 3], [4, 2]);
    h.current.handleInputChange("result", "Retired");
    h.current.handleInputChange("retiredSide", "opponent");
    h.current.handleInputChange("stopReason", "retired");
    h.render();
    const row = await saved(h);
    expect(row).toMatchObject({ result: "Retired", stop_reason: "retired" });
    expect(row.score).toMatchObject({ winner: "player1" });
  });

  test("a decided 6-4 6-3 writes neither, even with a stale early-end answer", async () => {
    const h = await readyToSave();
    score(h, [6, 6], [4, 3]);
    // Left over from before the score was finished: must not ride along.
    h.current.handleInputChange("result", "Unfinished");
    h.current.handleInputChange("stopReason", "clinched");
    h.render();
    const row = await saved(h);
    expect(row).toMatchObject({ result: null, stop_reason: null });
    expect(row.score).not.toHaveProperty("winner");
  });
});
