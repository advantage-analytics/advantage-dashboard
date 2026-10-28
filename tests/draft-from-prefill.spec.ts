import { expect, test } from "@playwright/test";

import {
  DEFAULT_FORM_DATA,
  STEP_ORDER_BY_KIND,
} from "@/components/dashboard/matches/new-match-wizard/types";
import { draftTargetMatchId } from "@/lib/wizard/draft-target";
import {
  draftRowSummary,
  matchDraftFromPrefill,
  parseScoreHint,
} from "@/lib/wizard/draft-from-prefill";

/**
 * The MCP connector's draft (`prepare_video_upload`): a `MatchDraft` the
 * wizard resumes like one of its own "Save draft" rows. What is pinned: the
 * form is `DEFAULT_FORM_DATA` plus what was said and nothing else — no
 * video-check answer, no score decided — the step is the file step of the
 * provider's own order, the draft targets no existing match, and the score
 * hint is parsed strictly.
 */

const ID = "dddddddd-0000-4000-8000-000000000004";

test.describe("parseScoreHint", () => {
  test("sets separated by spaces or commas, tiebreak points dropped, the player's games first", () => {
    expect(parseScoreHint("6-4 3-6 7-6(5)")).toEqual({
      ok: true,
      player: [6, 3, 7],
      opponent: [4, 6, 6],
    });
    expect(parseScoreHint(" 6–4, 6–3 ")).toEqual({
      ok: true,
      player: [6, 6],
      opponent: [4, 3],
    });
  });

  test("refuses an empty hint, a non-set, and more than five sets", () => {
    expect(parseScoreHint("   ").ok).toBe(false);
    const bad = parseScoreHint("6-4 won");
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.reason).toContain('"won"');
    expect(parseScoreHint("6-4 6-4 6-4 6-4 6-4 6-4").ok).toBe(false);
  });
});

test.describe("matchDraftFromPrefill", () => {
  test("a video draft: the processing provider's file step, the form from the defaults plus the facts, the score cells pre-filled but no decision", () => {
    const draft = matchDraftFromPrefill(
      {
        id: ID,
        provider: "advantage_intelligence",
        opponentName: "  Anna Lee ",
        date: "2026-10-18",
        tournamentName: "Fall Open",
        round: "QF",
        matchType: "Tournament",
        courtType: "Hard",
      },
      { player: [6, 3, 7], opponent: [4, 6, 5] },
    );
    expect(draft.provider).toBe("splitstep");
    expect(draft.step).toBe("file");
    expect(draft.stepIndex).toBe(STEP_ORDER_BY_KIND.processing.indexOf("file"));
    expect(draft.stepCount).toBe(STEP_ORDER_BY_KIND.processing.length);
    expect(draft.fileName).toBeNull();
    expect(draft.preset).toBeNull();
    expect(draft.attachedLine).toBeNull();
    expect(draftTargetMatchId(draft)).toBeNull();

    expect(draft.formData).toEqual({
      ...DEFAULT_FORM_DATA,
      date: "2026-10-18",
      time: "",
      opponentName: "Anna Lee",
      opponentSource: "new",
      playerName: "",
      eventName: "Fall Open",
      round: "QF",
      matchType: "Tournament",
      // The bare "Hard" opens on the Court field's Hard.
      courtType: "Outdoor Hard Court",
      playerScores: [6, 3, 7],
      opponentScores: [4, 6, 5],
      playerTiebreaks: [null, null, null],
      opponentTiebreaks: [null, null, null],
      numberOfSets: 3,
      dateSource: "new",
    });
    // The three answers the vendor needs are the wizard's to ask.
    expect(draft.formData.initialTopPlayerIsPlayer1).toBeUndefined();
    expect(draft.formData.fixedCamera).toBeUndefined();
    expect(draft.formData.adScoring).toBeUndefined();
    expect(draft.formData.result).toBe("");
  });

  test("an import draft follows the import order; no score leaves the default empty cells", () => {
    const draft = matchDraftFromPrefill(
      {
        id: ID,
        provider: "swingvision",
        opponentName: "Bea Ortiz",
        date: "2026-10-18",
        playerName: "Cal Reyes",
      },
      null,
    );
    expect(draft.provider).toBe("swing-vision");
    expect(draft.stepCount).toBe(STEP_ORDER_BY_KIND.import.length);
    expect(draft.formData.playerScores).toEqual([null, null, null]);
    expect(draft.formData.numberOfSets).toBe(3);
    expect(draft.formData.playerName).toBe("Cal Reyes");
    expect(draftRowSummary(draft)).toEqual({
      playerName: "Cal Reyes",
      eventLabel: null,
    });
  });

  test("a court type maps only its bare legacy spellings; other text stays as given", () => {
    const court = (courtType: string | null) =>
      matchDraftFromPrefill(
        {
          id: ID,
          provider: "advantage_intelligence",
          opponentName: "A",
          date: "2026-10-18",
          courtType,
        },
        null,
      ).formData.courtType;
    expect(court("hard")).toBe("Outdoor Hard Court");
    expect(court(" Clay ")).toBe("Clay Court");
    expect(court("grass")).toBe("Grass Court");
    expect(court("Indoor Hard Court")).toBe("Indoor Hard Court");
    expect(court("Indoor Clay Court")).toBe("Indoor Clay Court");
    expect(court("carpet")).toBe("carpet");
    expect(court(null)).toBe("");
  });

  test("a five-set score widens the cells to five", () => {
    const draft = matchDraftFromPrefill(
      {
        id: ID,
        provider: "advantage_intelligence",
        opponentName: "A",
        date: "2026-10-18",
      },
      { player: [6, 4, 6, 4, 6], opponent: [4, 6, 4, 6, 4] },
    );
    expect(draft.formData.numberOfSets).toBe(5);
    expect(draft.formData.playerTiebreaks).toHaveLength(5);
  });
});
