import { expect, test } from "@playwright/test";

import {
  DEFAULT_FORM_DATA,
  type EventPreset,
  type MatchDraft,
} from "@/components/dashboard/matches/new-match-wizard/types";
import {
  parsedNames,
  uploadWizardHarness,
} from "./fixtures/upload-wizard-hook";

/**
 * T6 — what survives a PinnedLineBar line swap.
 *
 * The pinned bar's Change menu swaps the preset for another line of the same
 * event (`UploadMatchFlow`'s `onSwitchPreset` is `setPreset`), which re-runs
 * the hook's preset seeding effect with `seededRef.current` already true.
 * Modelled here exactly that way: mutate `h.props.preset`, re-render.
 *
 * The line names the PLAYER, so every answer given about "you" or about the
 * opponent was given about line A's people. The camera-relative top-player
 * answer is the dangerous one (`docs/ui-revamp-guardrails.md` §4): carried
 * over, it maps the vendor's per-player predictions onto the wrong person with
 * nothing on screen looking wrong. The trim window and `fixedCamera` describe
 * the recording, not the players, and stay — and so does the picked file (T8):
 * a swap is a wrong-line fix, not a new video. A score carried from line A's
 * record is wrong for line B and is cleared; a score typed in the wizard
 * describes the recording and stays.
 *
 * Findings: `docs/investigations/2026-09-23-pinned-line-swap-carries-answers.md`.
 * Driven through `uploadWizardHarness` — the real hook in a VM, no DOM.
 */

const DOC =
  "docs/investigations/2026-09-23-pinned-line-swap-carries-answers.md";

function line(overrides: Partial<EventPreset> = {}): EventPreset {
  return {
    entryId: "entry-a",
    eventId: "event-1",
    eventName: "Westfield vs Meridian",
    matchId: null,
    round: "S1",
    playerName: "Marcus Reid",
    playerUserId: "athlete",
    opponentName: "Jordan Alvarez",
    date: "2026-09-10",
    surface: "hard",
    bestOf: 3,
    adScoring: false,
    score: null,
    supportsVideo: true,
    eventHref: "/dashboard/team/schedule/event-1",
    site: "home",
    eventKind: "dual",
    opponentProgramKey: "meridian",
    opponentSchool: "Meridian",
    ...overrides,
  };
}

/** Line B of the same event: a different entry, player and opponent. */
const LINE_B = line({
  entryId: "entry-b",
  round: "S2",
  playerName: "Sam Ortiz",
  playerUserId: "first",
  opponentName: "Chris Lee",
});

function videoFile(name = "court-one.mp4") {
  return new File(["video-bytes"], name, {
    type: "video/mp4",
    lastModified: 1_700_000_000_000,
  });
}

/**
 * Line A seeded, a video picked and trimmed, both camera questions answered,
 * and both players' styles, the tiebreaks and a roster opponent filled in —
 * everything a coach might have done before noticing the wrong line.
 */
async function answeredOnLineA(
  options: { lineA?: EventPreset; draft?: MatchDraft } = {},
) {
  const lineA = options.lineA ?? line();
  const h = uploadWizardHarness({
    team: true,
    props: {
      preset: lineA,
      initialProvider: "splitstep",
      ...(options.draft ? { draft: options.draft } : {}),
    },
  });
  await h.flush();
  expect(h.current.step).toBe("file");
  expect(h.current.formData.playerName).toBe(lineA.playerName);

  await h.current.onVideoPick(videoFile());
  await h.flush();
  h.current.handleTrimChange(120, 3600);
  h.render();

  h.current.handleInputChange("fixedCamera", true);
  h.current.handleInputChange("initialTopPlayerIsPlayer1", true);
  h.current.handleInputChange("playerHand", "left");
  h.current.handleInputChange("playerBackhand", "one-handed");
  h.current.handleInputChange("playerStyleSource", "roster");
  h.current.handleInputChange("opponentHand", "right");
  h.current.handleInputChange("opponentBackhand", "two-handed");
  h.current.handleInputChange("opponentStyleSource", "roster");
  h.current.handleInputChange("opponentPlayerId", "opp-jordan");
  h.render();
  h.current.handleTiebreakChange("player", 0, "7");
  h.render();
  h.current.handleTiebreakChange("opponent", 0, "5");
  h.render();
  await h.flush();

  expect(h.current.formData.initialTopPlayerIsPlayer1).toBe(true);
  expect(h.current.formData.fixedCamera).toBe(true);
  expect(h.current.formData.videoStartSeconds).toBe(120);
  return h;
}

/** A score array without the empty trailing sets the form pads with. */
function recorded(games: readonly (number | null)[]) {
  const out = [...games];
  while (out.length > 0 && out[out.length - 1] == null) out.pop();
  return out;
}

/** What `onSwitchPreset` does: hand the hook a different line. */
async function swapTo(
  h: Awaited<ReturnType<typeof answeredOnLineA>>,
  next: EventPreset,
) {
  h.props.preset = next;
  h.render();
  await h.flush();
}

test.describe("a PinnedLineBar line swap", () => {
  test("rewrites the line's own facts from line B", async () => {
    const h = await answeredOnLineA();
    const stepBefore = h.current.step;

    await swapTo(h, LINE_B);

    const f = h.current.formData;
    expect(f.playerName).toBe("Sam Ortiz");
    expect(f.opponentName).toBe("Chris Lee");
    expect(f.opponentSource).toBe("event");
    expect(f.round).toBe("S2");
    expect(f.date).toBe("2026-09-10");
    expect(f.dateSource).toBe("event");
    expect(f.bestOf).toBe("3");
    expect(f.adScoring).toBe(false);
    expect(f.eventName).toBe("Westfield vs Meridian");
    // Not a start-over: the step stays where the coach was.
    expect(h.current.step).toBe(stepBefore);
  });

  test("attribution follows line B — it is read live from the preset", async () => {
    const h = await answeredOnLineA();
    expect(h.current.eligibility).toEqual({ ok: true, attribution: "athlete" });

    await swapTo(h, LINE_B);

    // `wizardUploadEligibility` / `identityAthleteFor` take the preset every
    // render; nothing about line A's player is cached for `player1_id`.
    expect(h.current.eligibility).toEqual({ ok: true, attribution: "first" });
  });

  test("the top-player answer does not carry over to line B's player", async () => {
    const h = await answeredOnLineA();
    await swapTo(h, LINE_B);

    // "Were YOU at the top" — and "you" just changed. Unanswered, never false.
    expect(h.current.formData.initialTopPlayerIsPlayer1).toBeUndefined();
    expect(h.current.topPlayerAnswerStale).toBe(false);
  });

  test("line A's players' styles do not carry over", async () => {
    const h = await answeredOnLineA();
    await swapTo(h, LINE_B);

    const f = h.current.formData;
    expect(f.playerHand).toBeUndefined();
    expect(f.playerBackhand).toBeUndefined();
    expect(f.playerStyleSource).toBeUndefined();
    expect(f.opponentHand).toBeUndefined();
    expect(f.opponentBackhand).toBeUndefined();
    expect(f.opponentStyleSource).toBeUndefined();
    // Line A's opponent's roster id would be written as opponent_player_id
    // beside line B's opponent's name.
    expect(f.opponentPlayerId).toBeUndefined();
  });

  test("line A's tiebreaks do not carry over", async () => {
    const h = await answeredOnLineA();
    await swapTo(h, LINE_B);

    expect(h.current.formData.playerTiebreaks).toEqual(
      DEFAULT_FORM_DATA.playerTiebreaks,
    );
    expect(h.current.formData.opponentTiebreaks).toEqual(
      DEFAULT_FORM_DATA.opponentTiebreaks,
    );
  });

  test("what describes the recording stays: fixedCamera and the trim window", async () => {
    const h = await answeredOnLineA();
    await swapTo(h, LINE_B);

    const f = h.current.formData;
    expect(f.fixedCamera).toBe(true);
    expect(f.videoStartSeconds).toBe(120);
    expect(f.videoEndSeconds).toBe(3600);
    expect(f.duration).toBe((3600 - 120) * 1000);
  });

  test("the picked file, its probe and the trim window stay across a swap", async () => {
    const h = await answeredOnLineA();
    expect(h.current.uploadedFile?.name).toBe("court-one.mp4");
    const probeBefore = h.current.videoProbe;

    await swapTo(h, LINE_B);

    // The file-generation reset is keyed on the event, not the line: a swap
    // inside one event keeps what was picked (T8).
    expect(h.current.uploadedFile?.name).toBe("court-one.mp4");
    expect(h.current.videoProbe).toEqual(probeBefore);
    const f = h.current.formData;
    expect(f.videoStartSeconds).toBe(120);
    expect(f.videoEndSeconds).toBe(3600);
    expect(f.duration).toBe((3600 - 120) * 1000);
  });

  test("the top-player baseline is re-armed: a new answer is measured from where it was given", async () => {
    const h = await answeredOnLineA();
    // Drift line A's answer past the threshold so the stale hint is up.
    h.current.handleTrimChange(200, 3600);
    h.render();
    expect(h.current.topPlayerAnswerStale).toBe(true);
    h.current.handleInputChange("initialTopPlayerIsPlayer1", true);
    h.current.handleTrimChange(120, 3600);
    h.render();
    // 80 s back from the re-answer at 200: cleared again, stale again.
    expect(h.current.formData.initialTopPlayerIsPlayer1).toBeUndefined();
    expect(h.current.topPlayerAnswerStale).toBe(true);

    await swapTo(h, LINE_B);
    // The hint described line A's answer; there is no answer to be stale now.
    expect(h.current.topPlayerAnswerStale).toBe(false);

    // Answered for line B's player at 120: 20 s is fine-positioning, 40 s is not.
    h.current.handleInputChange("initialTopPlayerIsPlayer1", false);
    h.render();
    h.current.handleTrimChange(140, 3600);
    h.render();
    expect(h.current.formData.initialTopPlayerIsPlayer1).toBe(false);
    h.current.handleTrimChange(160, 3600);
    h.render();
    expect(h.current.formData.initialTopPlayerIsPlayer1).toBeUndefined();
    expect(h.current.topPlayerAnswerStale).toBe(true);
  });

  test("re-running the seed for the SAME line clears nothing", async () => {
    const h = await answeredOnLineA();

    // A fresh object for the same entry — what the effect sees if it re-runs
    // for any other dependency. Not a swap.
    await swapTo(h, line());

    const f = h.current.formData;
    expect(f.initialTopPlayerIsPlayer1).toBe(true);
    expect(f.playerHand).toBe("left");
    expect(f.opponentHand).toBe("right");
    expect(f.playerTiebreaks).toEqual([7, null, null]);
    expect(f.opponentPlayerId).toBe("opp-jordan");
  });

  test("line A's courtside score does not survive onto an unscored line B", async () => {
    const h = await answeredOnLineA({
      lineA: line({ score: { player1: [6, 6], player2: [3, 4] } }),
    });
    expect(h.current.formData.playerScores).toEqual([6, 6]);
    h.current.handleInputChange("result", "Retired");
    h.current.handleInputChange("retiredSide", "opponent");
    h.render();

    await swapTo(h, LINE_B);

    // The score came from line A's record, so it — and the result beside
    // it — would otherwise be filed as line B's match.
    const f = h.current.formData;
    expect(f.playerScores).toEqual(DEFAULT_FORM_DATA.playerScores);
    expect(f.opponentScores).toEqual(DEFAULT_FORM_DATA.opponentScores);
    expect(f.numberOfSets).toEqual(DEFAULT_FORM_DATA.numberOfSets);
    expect(f.result).toEqual(DEFAULT_FORM_DATA.result);
    expect(f.retiredSide).toEqual(DEFAULT_FORM_DATA.retiredSide);
  });

  test("a score typed in the wizard stays across a swap", async () => {
    // Line A unscored: whatever score is on the form was typed from the video,
    // which describes the recording — the right match — not line A.
    const h = await answeredOnLineA();
    h.current.handleScoreChange("player", 0, "6");
    h.render();
    h.current.handleScoreChange("player", 1, "7");
    h.render();
    h.current.handleScoreChange("opponent", 0, "4");
    h.render();
    h.current.handleScoreChange("opponent", 1, "5");
    h.render();
    h.current.handleInputChange("result", "Final Score");
    h.render();
    const typed = {
      playerScores: [...h.current.formData.playerScores],
      opponentScores: [...h.current.formData.opponentScores],
    };
    expect(recorded(typed.playerScores)).toEqual([6, 7]);
    expect(recorded(typed.opponentScores)).toEqual([4, 5]);

    await swapTo(h, LINE_B);

    const f = h.current.formData;
    expect(f.playerScores).toEqual(typed.playerScores);
    expect(f.opponentScores).toEqual(typed.opponentScores);
    expect(f.result).toBe("Final Score");
  });

  test("a score typed over line A's recorded one stays across a swap", async () => {
    const h = await answeredOnLineA({
      lineA: line({ score: { player1: [6, 6], player2: [3, 4] } }),
    });
    // The coach corrected the courtside record from the video.
    h.current.handleScoreChange("opponent", 1, "7");
    h.render();
    h.current.handleScoreChange("player", 1, "5");
    h.render();

    await swapTo(h, LINE_B);

    expect(recorded(h.current.formData.playerScores)).toEqual([6, 5]);
    expect(recorded(h.current.formData.opponentScores)).toEqual([3, 7]);
  });

  test("a scored line B's own score replaces line A's recorded one", async () => {
    const h = await answeredOnLineA({
      lineA: line({ score: { player1: [6, 6], player2: [3, 4] } }),
    });

    await swapTo(h, {
      ...LINE_B,
      score: { player1: [4, 6, 6], player2: [6, 3, 2] },
    });

    expect(h.current.formData.playerScores).toEqual([4, 6, 6]);
    expect(h.current.formData.opponentScores).toEqual([6, 3, 2]);
    expect(h.current.formData.numberOfSets).toBe(3);
  });

  test("an import-line swap keeps the parsed file and re-asks the player-1 check", async () => {
    const importLine = (overrides: Partial<EventPreset> = {}) =>
      line({ supportsVideo: false, ...overrides });
    const h = uploadWizardHarness({
      team: true,
      props: { preset: importLine() },
    });
    await h.flush();
    expect(h.current.step).toBe("file");

    const pending = await h.pick("match.csv");
    pending.resolve(parsedNames("M. Reid", "File Opponent"));
    await h.flush();
    expect(h.current.parsingState.parseSuccess).toBe(true);
    expect(h.current.importIdentity.comparison?.requiresConfirmation).toBe(
      true,
    );
    h.current.importIdentity.confirm();
    h.render();
    expect(h.current.importIdentity.confirmed).toBe(true);
    const uploaded = h.current.uploadedFile;

    await swapTo(
      h,
      importLine({
        entryId: "entry-b",
        round: "S2",
        playerName: "Sam Ortiz",
        playerUserId: "first",
        opponentName: "Chris Lee",
      }),
    );

    // The file and its parse stay…
    expect(h.current.uploadedFile).toBe(uploaded);
    expect(h.current.parsingState.parseSuccess).toBe(true);
    expect(h.current.importIdentity.parsedNames).toEqual({
      playerName: "M. Reid",
      opponentName: "File Opponent",
    });
    // …but "player 1 is Marcus Reid" is no answer about Sam Ortiz: the
    // athlete-keyed reset drops it, and the check asks again.
    expect(h.current.importIdentity.confirmed).toBe(false);
    expect(h.current.importIdentity.blocked).toBe(true);
  });

  test("a swap across source kinds still drops the file", async () => {
    const h = await answeredOnLineA();
    expect(h.current.uploadedFile?.name).toBe("court-one.mp4");

    // A doubles line cannot take video; the picked recording cannot ride on.
    await swapTo(h, { ...LINE_B, supportsVideo: false });

    expect(h.current.uploadedFile).toBeNull();
  });

  test("a draft-resumed line flow keeps the window the coach set after resuming", async () => {
    test.fail(
      true,
      `Known regression, not fixed in T6 — see "Not fixed" in ${DOC}`,
    );
    const draft: MatchDraft = {
      id: "draft-1",
      step: "trim",
      stepCount: 4,
      stepIndex: 2,
      provider: "splitstep",
      formData: {
        ...DEFAULT_FORM_DATA,
        videoStartSeconds: 30,
        videoEndSeconds: 3000,
      },
      fileName: "court-one.mp4",
      preset: line(),
      attachedLine: null,
      updatedAt: "2026-09-20T00:00:00.000Z",
    };
    const h = await answeredOnLineA({ draft });
    expect(h.current.formData.videoStartSeconds).toBe(120);

    await swapTo(h, LINE_B);

    // The seed re-spreads `draft.formData` on every run, so a swap puts the
    // draft's 30 s window back over the 120 s one set since.
    expect(h.current.formData.videoStartSeconds).toBe(120);
  });
});
