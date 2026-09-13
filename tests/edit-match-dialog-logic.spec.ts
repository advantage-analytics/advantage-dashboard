import { expect, test } from "@playwright/test";

import {
  decidedWinner,
  normalizeMatchPatch,
  type StoredMatchForPatch,
  scoreForSave,
} from "@/lib/matches/patch-match";
import {
  attachLineGroups,
  lineName,
  type AttachMatchFacts,
} from "@/lib/schedule/attach-line-state";
import {
  eventContextLine,
  formatLine,
  resultLine,
  droppedDetailsLine,
} from "@/lib/matches/edit-match-copy";
import type { EventEntry, ProgramEvent } from "@/lib/schedule/types";
import { normalizeRound } from "@/lib/matches/round-options";

const oneOff: StoredMatchForPatch = {
  score: { player1: [6, 6], player2: [4, 3], winner: "player1" },
  format: { best_of: 3, ad_scoring: false },
  linked: false,
  analyzed: false,
};

test.describe("normalizeMatchPatch", () => {
  test("never writes result, and stores the calendar day at noon", () => {
    const r = normalizeMatchPatch(
      { date: "2025-01-31", score: { player1: [6, 6], player2: [4, 3] } },
      oneOff,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.update).not.toHaveProperty("result");
    expect(r.update.date).toBe("2025-01-31T12:00:00");
  });

  test("keeps a retirement's winner when the new score decides nothing", () => {
    const retired: StoredMatchForPatch = {
      ...oneOff,
      score: { player1: [6, 2], player2: [4, 1], winner: "player2" },
    };
    const same = normalizeMatchPatch(
      { score: { player1: [6, 2], player2: [4, 1] } },
      retired,
    );
    expect(same.ok && (same.update.score as { winner: string }).winner).toBe(
      "player2",
    );
    const edited = normalizeMatchPatch(
      { score: { player1: [6, 3], player2: [4, 1] } },
      retired,
    );
    expect(
      edited.ok && (edited.update.score as { winner: string }).winner,
    ).toBe("player2");
    const decided = normalizeMatchPatch(
      { score: { player1: [6, 6], player2: [4, 1] } },
      retired,
    );
    expect(
      decided.ok && (decided.update.score as { winner: string }).winner,
    ).toBe("player1");
  });

  test("allowlists hands and backhands, null clears", () => {
    const ok = normalizeMatchPatch(
      {
        player_hand: "left",
        opponent_backhand: "one-handed",
        player_backhand: null,
      },
      oneOff,
    );
    expect(ok.ok && ok.update).toMatchObject({
      player_hand: "left",
      opponent_backhand: "one-handed",
      player_backhand: null,
    });
    const bad = normalizeMatchPatch({ player_hand: "ambidextrous" }, oneOff);
    expect(bad).toMatchObject({ ok: false, field: "player_hand" });
  });

  test("format edits only on a hand-scored one-off, merged into the stored object", () => {
    const merged = normalizeMatchPatch(
      { format: { best_of: 5, play_on_lets: true } },
      oneOff,
    );
    expect(merged.ok && merged.update.format).toEqual({
      best_of: 5,
      ad_scoring: false,
      play_on_lets: true,
    });
    expect(
      normalizeMatchPatch(
        { format: { best_of: 5 } },
        { ...oneOff, analyzed: true },
      ),
    ).toMatchObject({ ok: false, field: "format" });
    expect(
      normalizeMatchPatch({ format: { best_of: 4 } }, oneOff),
    ).toMatchObject({ ok: false, field: "format" });
  });

  test("refuses event-owned fields on a match on a line", () => {
    const linked = { ...oneOff, linked: true };
    expect(normalizeMatchPatch({ round: "S3" }, linked)).toMatchObject({
      ok: false,
      field: "round",
    });
    expect(
      normalizeMatchPatch({ player1_name: "  Giacomo Revelli " }, linked),
    ).toMatchObject({ ok: true, update: { player1_name: "Giacomo Revelli" } });
  });

  test("names are required and a date must exist", () => {
    expect(normalizeMatchPatch({ player2_name: " " }, oneOff)).toMatchObject({
      ok: false,
      field: "player2_name",
    });
    expect(normalizeMatchPatch({ date: "2025-02-30" }, oneOff)).toMatchObject({
      ok: false,
      field: "date",
    });
  });

  test("decidedWinner counts sets by tennis rules", () => {
    expect(decidedWinner([6, 5], [4, 7], 3)).toBeNull();
    expect(decidedWinner([4, 7, 3], [6, 6, 6], 3)).toBe("player2");
    expect(decidedWinner([6], [4], 1)).toBe("player1");
  });
});

function event(over: Partial<ProgramEvent> = {}): ProgramEvent {
  return {
    id: "ev1",
    programId: "p1",
    kind: "dual",
    name: "UCLA vs Berkeley",
    startsOn: "2025-01-31",
    endsOn: "2025-01-31",
    site: "home",
    surface: "indoor hard",
    host: null,
    format: { bestOf: 3, adScoring: false },
    ...over,
  };
}

function entry(over: Partial<EventEntry> = {}): EventEntry {
  return {
    id: "e1",
    eventId: "ev1",
    discipline: "singles",
    slot: "S2",
    position: 2,
    draw: null,
    seed: null,
    playerUserIds: ["u-revelli"],
    playerLabels: ["Giacomo Revelli"],
    opponentLabels: ["Timofey Stepanov"],
    opponentSchool: null,
    forfeit: null,
    matches: [],
    outcomes: [],
    ...over,
  };
}

const facts: AttachMatchFacts = {
  date: "2025-01-31",
  round: null,
  player1Id: "pp-revelli",
  player1Name: "Giacomo Revelli",
  bestOf: 3,
  adScoring: false,
};

test.describe("attachLineGroups", () => {
  const entries = [
    entry(),
    entry({
      id: "e4",
      slot: "S4",
      playerUserIds: ["u-brandt"],
      playerLabels: ["Luca Brandt"],
    }),
    entry({
      id: "e1r",
      slot: "S1",
      playerLabels: ["Théo Laurent"],
      playerUserIds: ["u-laurent"],
      matches: [
        {
          id: "m",
          round: "S1",
          status: "manual",
          score: null,
          opponentLabels: [],
          hasVideo: false,
        },
      ],
    }),
    entry({ id: "d1", slot: "D1", discipline: "doubles" }),
  ];

  test("suggests the same-day line with the player, canonicalising ids", () => {
    const groups = attachLineGroups({
      events: [event()],
      entriesByEvent: new Map([["ev1", entries]]),
      match: facts,
      canonical: new Map([
        ["u-revelli", "pp-revelli"],
        ["pp-revelli", "pp-revelli"],
      ]),
    });
    expect(groups.suggested.map((l) => l.slot)).toEqual(["S2"]);
    expect(groups.sameDay.map((l) => [l.slot, l.state])).toEqual([
      ["D1", "doubles"],
      ["S1", "hasResult"],
      ["S4", "available"],
    ]);
    const s4 = groups.sameDay.find((l) => l.slot === "S4")!;
    expect(s4.lineupMismatch).toBe("Luca Brandt");
    expect(groups.search).toEqual([]);
  });

  test("a line on another day only shows when searched for", () => {
    const later = event({
      id: "ev2",
      name: "UCLA vs California",
      startsOn: "2025-02-07",
      endsOn: "2025-02-07",
    });
    const map = new Map([["ev2", [entry({ id: "c2", eventId: "ev2" })]]]);
    expect(
      attachLineGroups({ events: [later], entriesByEvent: map, match: facts })
        .search,
    ).toEqual([]);
    const found = attachLineGroups({
      events: [later],
      entriesByEvent: map,
      match: facts,
      query: "cal",
    });
    expect(found.search.map((l) => l.eventName)).toEqual([
      "UCLA vs California",
    ]);
  });

  test("tournaments need the match's round and list only this player's entry", () => {
    const tour = event({
      id: "t",
      kind: "tournament",
      name: "Stanford Invitational",
      startsOn: "2025-01-30",
      endsOn: "2025-02-01",
      format: { bestOf: 3, adScoring: true },
    });
    const map = new Map([
      [
        "t",
        [
          entry({ id: "te", eventId: "t", slot: null }),
          entry({
            id: "other",
            eventId: "t",
            slot: null,
            playerLabels: ["Someone Else"],
            playerUserIds: ["x"],
          }),
        ],
      ],
    ]);
    const noRound = attachLineGroups({
      events: [tour],
      entriesByEvent: map,
      match: facts,
    });
    expect(noRound.sameDay.map((l) => [l.entryId, l.state])).toEqual([
      ["te", "needsRound"],
    ]);
    const withRound = attachLineGroups({
      events: [tour],
      entriesByEvent: map,
      match: { ...facts, round: "R16" },
    });
    expect(withRound.suggested[0]).toMatchObject({
      round: "R16",
      formatDiffers: true,
    });
    // The wizard's long label reads as its code, so a taken QF is caught.
    const takenMap = new Map([
      [
        "t",
        [
          entry({
            id: "te",
            eventId: "t",
            slot: null,
            matches: [
              {
                id: "qf",
                round: "QF",
                status: "manual",
                score: null,
                opponentLabels: [],
                hasVideo: false,
              },
            ],
          }),
        ],
      ],
    ]);
    const longLabel = attachLineGroups({
      events: [tour],
      entriesByEvent: takenMap,
      match: { ...facts, round: "Quarterfinal" },
    });
    expect(longLabel.sameDay[0]).toMatchObject({
      round: "QF",
      state: "roundTaken",
    });
  });

  test("lineName", () => {
    expect(lineName({ eventKind: "dual", slot: "S2", round: "S2" })).toBe(
      "Singles 2",
    );
    expect(
      lineName({ eventKind: "tournament", slot: null, round: "R16" }),
    ).toBe("R16");
  });
});

test.describe("edit match copy", () => {
  test("the E1 context line", () => {
    expect(
      eventContextLine({
        eventName: "UCLA vs Berkeley",
        eventKind: "dual",
        slot: "S2",
        round: "S2",
        date: "2025-01-31T12:00:00+00:00",
        surface: "indoor hard",
      }),
    ).toBe("Singles 2 · UCLA vs Berkeley · Jan 31, 2025 · Indoor hard");
  });

  test("format lines by provenance", () => {
    const format = { bestOf: 3, adScoring: false, playOnLets: true };
    expect(
      formatLine({
        format,
        analyzed: "video",
        linked: false,
        durationMs: 78_000,
      }),
    ).toBe("Analyzed as best of 3, no-ad, play on lets · 1:18 of video");
    expect(
      formatLine({ format, analyzed: null, linked: true, durationMs: null }),
    ).toBe("Played as best of 3, no-ad, play on lets");
    expect(
      formatLine({ format, analyzed: null, linked: false, durationMs: null }),
    ).toBeNull();
  });

  test("result line from the winner's side", () => {
    expect(
      resultLine({
        playerName: "Giacomo Revelli",
        opponentName: "Timofey Stepanov",
        player: [4, 7, 3],
        opponent: [6, 6, 6],
        bestOf: 3,
      }),
    ).toBe("Stepanov wins 6-4, 6-7, 6-3");
    expect(
      resultLine({
        playerName: "Maya Chen",
        opponentName: "Sofia Ruiz",
        player: [6, 3],
        opponent: [4, 6],
        bestOf: 3,
      }),
    ).toBe("One set each");
  });
});

test.describe("rounds", () => {
  test("normalizeRound maps the wizard's long labels to codes and keeps unknowns", () => {
    expect(normalizeRound("Round of 16")).toBe("R16");
    expect(normalizeRound("Quarterfinals")).toBe("QF");
    expect(normalizeRound("finals")).toBe("F");
    expect(normalizeRound("qf")).toBe("QF");
    expect(normalizeRound("s2")).toBe("S2");
    expect(normalizeRound("Week 4")).toBe("Week 4");
    expect(normalizeRound("  ")).toBeNull();
  });

  test("round is judged by match type; practice clears it; legacy survives", () => {
    const base = { ...oneOff, matchType: "Tournament", round: "Week 4" };
    expect(normalizeMatchPatch({ round: "Round of 16" }, base)).toMatchObject({
      ok: true,
      update: { round: "R16" },
    });
    expect(normalizeMatchPatch({ round: "S2" }, base)).toMatchObject({
      ok: false,
      field: "round",
    });
    expect(normalizeMatchPatch({ round: "Week 4" }, base)).toMatchObject({
      ok: true,
      update: { round: "Week 4" },
    });
    expect(
      normalizeMatchPatch({ match_type: "Dual Match", round: "S2" }, base),
    ).toMatchObject({ ok: true, update: { round: "S2" } });
    expect(
      normalizeMatchPatch({ match_type: "Practice", round: "R16" }, base),
    ).toMatchObject({ ok: true, update: { round: null } });
  });
});

test.describe("player1_id", () => {
  test("only a team one-off picks its player by id", () => {
    const team = { ...oneOff, teamMatch: true };
    expect(normalizeMatchPatch({ player1_id: "pp-2" }, team)).toMatchObject({
      ok: true,
      update: { player1_id: "pp-2" },
    });
    expect(
      normalizeMatchPatch({ player1_id: "pp-2" }, { ...team, linked: true }),
    ).toMatchObject({ ok: false, field: "player1_id" });
    expect(normalizeMatchPatch({ player1_id: "pp-2" }, oneOff)).toMatchObject({
      ok: false,
      field: "player1_id",
    });
  });

  test("an analyzed match keeps its player — its stats are keyed to the side", () => {
    const team = { ...oneOff, teamMatch: true };
    expect(
      normalizeMatchPatch({ player1_id: "pp-2" }, { ...team, analyzed: true }),
    ).toMatchObject({ ok: false, field: "player1_id" });
  });
});

test.describe("scoreForSave", () => {
  const cells = (player: (number | null)[], opponent: (number | null)[]) => ({
    player,
    opponent,
    playerTiebreaks: player.map(() => null),
    opponentTiebreaks: opponent.map(() => null),
  });

  test("an empty cell is never saved as a 0", () => {
    expect(scoreForSave(cells([6, 6], [4, null]), true)).toEqual({
      ok: false,
      error: "Set 2 needs both players' games.",
    });
  });

  test("trailing empty sets are dropped", () => {
    expect(scoreForSave(cells([6, null], [4, null]), true)).toMatchObject({
      ok: true,
      score: { player1: [6], player2: [4], player1_tiebreaks: [null] },
    });
  });

  test("an empty card leaves a scoreless match alone, and won't wipe a score", () => {
    expect(scoreForSave(cells([null], [null]), false)).toEqual({
      ok: true,
      score: null,
    });
    expect(scoreForSave(cells([null], [null]), true)).toMatchObject({
      ok: false,
    });
  });
});

test.describe("droppedDetailsLine", () => {
  test("names what a picked line will drop, or nothing", () => {
    expect(droppedDetailsLine([], "tournament")).toBeNull();
    expect(droppedDetailsLine(["date"], "dual")).toBe(
      "Your changes to the date won't be saved — the dual sets it.",
    );
    expect(droppedDetailsLine(["date", "round", "surface"], "tournament")).toBe(
      "Your changes to the date, round and surface won't be saved — the tournament sets them.",
    );
  });
});

test.describe("score winner after an edit", () => {
  test("a winner the old sets decided goes when the new sets don't decide", () => {
    const stored = {
      ...oneOff,
      score: { player1: [6, 6], player2: [4, 4], winner: "player1" as const },
    };
    expect(
      normalizeMatchPatch(
        { score: { player1: [6, 4], player2: [4, 6] } },
        stored,
      ),
    ).toMatchObject({ ok: true, update: { score: { winner: null } } });
  });

  test("a retirement's winner survives a score correction", () => {
    const stored = {
      ...oneOff,
      score: { player1: [6, 2], player2: [4, 3], winner: "player2" as const },
    };
    expect(
      normalizeMatchPatch(
        { score: { player1: [6, 3], player2: [4, 3] } },
        stored,
      ),
    ).toMatchObject({ ok: true, update: { score: { winner: "player2" } } });
  });
});
