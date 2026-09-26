import { expect, test } from "@playwright/test";

import { presetFor, lineupChoices } from "@/lib/schedule/line-choices";
import type {
  EntryMatch,
  EventEntry,
  ProgramEvent,
} from "@/lib/schedule/types";

/**
 * `presetFor` and `lineupChoices`, moved out of `team/upload/page.tsx`
 * (T4). Pure logic over the schedule's own shapes — no Supabase, no
 * rendering — so these fixtures build `ProgramEvent`/`EventEntry` by hand,
 * the same way `tests/weekend-dual-reads.spec.ts` does.
 */

const EVENT: ProgramEvent = {
  id: "e-1",
  programId: "p-1",
  kind: "dual",
  name: "Rival State",
  startsOn: "2026-03-21",
  endsOn: "2026-03-21",
  site: "home",
  surface: "hard",
  host: null,
  format: { bestOf: 3, adScoring: true },
};

const PROGRAMS = new Map<string, { key: string; school: string }>([
  ["rival-program", { key: "rival-state", school: "Rival State" }],
]);

function match(id: string, hasVideo = false): EntryMatch {
  return {
    id,
    round: null,
    status: "imported",
    score: { player1: [6, 6], player2: [3, 4] },
    opponentLabels: ["Rival Player"],
    hasVideo,
  };
}

function entry(
  overrides: Partial<EventEntry> & { position: number },
): EventEntry {
  return {
    id: `entry-${overrides.position}`,
    eventId: EVENT.id,
    discipline: "singles",
    slot: `S${overrides.position + 1}`,
    draw: null,
    seed: null,
    playerUserIds: ["player-user"],
    playerLabels: ["Ana Vasquez"],
    opponentLabels: ["Rival Player"],
    opponentSchool: null,
    opponentProgramId: null,
    forfeit: null,
    matches: [],
    ...overrides,
  };
}

test.describe("lineupChoices · one row per slot", () => {
  test("an entry with no player is unset", () => {
    const noPlayer = entry({ position: 0, playerLabels: [] });
    const [choice] = lineupChoices(EVENT, [noPlayer], PROGRAMS);
    expect(choice).toMatchObject({ state: "unset", preset: null });
  });

  test("a forfeited entry is unset even with a player", () => {
    const forfeited = entry({ position: 0, forfeit: "ours" });
    const [choice] = lineupChoices(EVENT, [forfeited], PROGRAMS);
    expect(choice).toMatchObject({ state: "unset", preset: null });
  });

  test("the score flow can opt into selecting a saved outcome", () => {
    const forfeited = entry({ position: 0, forfeit: "ours" });
    const [choice] = lineupChoices(EVENT, [forfeited], PROGRAMS, {
      includeNonPlayed: true,
    });
    expect(choice).toMatchObject({ state: "result" });
    expect(choice.preset?.entryId).toBe(forfeited.id);
  });

  test("a new outcome stays unavailable to upload but is selectable for scoring", () => {
    const defaulted = entry({
      position: 0,
      outcomes: [
        {
          id: "outcome-1",
          round: null,
          kind: "default",
          side: "theirs",
          actorUserId: "staff-1",
          recordedAt: "2026-09-10T12:00:00Z",
        },
      ],
    });
    expect(lineupChoices(EVENT, [defaulted], PROGRAMS)[0]).toMatchObject({
      state: "unset",
      preset: null,
    });
    expect(
      lineupChoices(EVENT, [defaulted], PROGRAMS, {
        includeNonPlayed: true,
      })[0],
    ).toMatchObject({ state: "result" });
  });

  test("a scored line without video is a result", () => {
    const scored = entry({ position: 0, matches: [match("m-1", false)] });
    const [choice] = lineupChoices(EVENT, [scored], PROGRAMS);
    expect(choice.state).toBe("result");
    expect(choice.preset).not.toBeNull();
  });

  test("a line with hasVideo is video", () => {
    const filmed = entry({ position: 0, matches: [match("m-1", true)] });
    const [choice] = lineupChoices(EVENT, [filmed], PROGRAMS);
    expect(choice.state).toBe("video");
  });

  test("a doubles entry presets a null playerUserId", () => {
    const doubles = entry({
      position: 0,
      slot: "D1",
      discipline: "doubles",
      playerUserIds: ["player-a", "player-b"],
      playerLabels: ["Ana Vasquez", "Bea Cruz"],
      matches: [match("m-1", false)],
    });
    const [choice] = lineupChoices(EVENT, [doubles], PROGRAMS);
    expect(choice.preset?.playerUserId).toBeNull();
  });

  test("slots are deduped and returned in position order", () => {
    const s3 = entry({
      position: 2,
      slot: "S3",
      matches: [match("m-3", false)],
    });
    const s1 = entry({
      position: 0,
      slot: "S1",
      matches: [match("m-1", false)],
    });
    const s1Duplicate = entry({
      position: 1,
      slot: "S1",
      matches: [match("m-1b", false)],
    });

    const choices = lineupChoices(EVENT, [s3, s1, s1Duplicate], PROGRAMS);

    expect(choices.map((c) => c.slot)).toEqual(["S1", "S3"]);
  });
});

test.describe("presetFor · the preset one entry builds", () => {
  test("carries the event format and resolves the opponent program", () => {
    const opponent = entry({
      position: 0,
      opponentProgramId: "rival-program",
      matches: [match("m-1", false)],
    });
    const preset = presetFor(EVENT, opponent, opponent.matches[0], PROGRAMS);

    expect(preset.bestOf).toBe(3);
    expect(preset.adScoring).toBe(true);
    expect(preset.opponentProgramKey).toBe("rival-state");
    expect(preset.opponentSchool).toBe("Rival State");
  });
});

test.describe("tournament entries · for the score flow", () => {
  const TOURNAMENT: ProgramEvent = {
    ...EVENT,
    id: "t-1",
    kind: "tournament",
    name: "Fall Invitational",
  };

  function run(
    position: number,
    rounds: string[],
    overrides: Partial<EventEntry> = {},
  ): EventEntry {
    return entry({
      position,
      id: `run-${position}`,
      eventId: TOURNAMENT.id,
      slot: null,
      matches: rounds.map((round, index) => ({
        ...match(`run-${position}-${index}`),
        round,
      })),
      ...overrides,
    });
  }

  test("two entries that opened in the same round are two rows, by position", () => {
    // Listed under a round, both of these read "R32" and de-duplicated to one.
    const choices = lineupChoices(
      TOURNAMENT,
      [run(0, ["R32"]), run(1, ["R32"], { playerLabels: ["Dana Brooks"] })],
      PROGRAMS,
    );
    expect(choices.map((choice) => choice.slot)).toEqual(["#1", "#2"]);
    expect(choices.map((choice) => choice.preset?.entryId)).toEqual([
      "run-0",
      "run-1",
    ]);
  });

  test("a row presets the NEXT round, never one already recorded", () => {
    const [choice] = lineupChoices(
      TOURNAMENT,
      [run(0, ["R32", "R16"])],
      PROGRAMS,
    );
    expect(choice.preset?.round).toBe("QF");
    expect(choice.preset?.score).toBeNull();
    expect(choice.state).toBe("open");
  });

  test("presetFor takes an asked round, and a dual's slot still wins", () => {
    const qualifier = run(0, ["Q1"]);
    const atQ1 = presetFor(
      TOURNAMENT,
      qualifier,
      qualifier.matches[0],
      PROGRAMS,
      "Q1",
    );
    expect(atQ1).toMatchObject({ round: "Q1", eventKind: "tournament" });
    expect(atQ1.score).toEqual(qualifier.matches[0].score);

    const dualLine = entry({ position: 2 });
    expect(presetFor(EVENT, dualLine, null, PROGRAMS, "QF").round).toBe("S3");
  });
});
