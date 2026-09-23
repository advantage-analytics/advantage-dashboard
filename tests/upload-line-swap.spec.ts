import { expect, test } from "@playwright/test";

import {
  DEFAULT_FORM_DATA,
  type EventPreset,
  type MatchDraft,
} from "@/components/dashboard/matches/new-match-wizard/types";
import { uploadWizardHarness } from "./fixtures/upload-wizard-hook";

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
 * the recording, not the players, and stay.
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

  test("the picked file itself is dropped by the file-generation reset (current behaviour)", async () => {
    const h = await answeredOnLineA();
    expect(h.current.uploadedFile?.name).toBe("court-one.mp4");

    await swapTo(h, LINE_B);

    // Not a wrong-person carry-over, but it contradicts the "the file you've
    // dropped stays" design claim: the `preset?.entryId`-keyed reset effect
    // runs `resetFileGeneration()`, which nulls `uploadedFile`. See the doc.
    expect(h.current.uploadedFile).toBeNull();
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
    test.fail(
      true,
      `Known carry-over, not fixed in T6 — see "Not fixed" in ${DOC}`,
    );
    const h = await answeredOnLineA({
      lineA: line({ score: { player1: [6, 6], player2: [3, 4] } }),
    });
    expect(h.current.formData.playerScores).toEqual([6, 6]);

    await swapTo(h, LINE_B);

    // The seed only writes a score when line B has one, so line A's recorded
    // result stays and would be filed as line B's match.
    expect(h.current.formData.playerScores).not.toEqual([6, 6]);
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
