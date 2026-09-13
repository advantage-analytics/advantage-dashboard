import { expect, test } from "@playwright/test";

import { planEntryChanges } from "@/lib/schedule/entry-plan";
import type {
  LineupLineInput,
  TournamentEntryInput,
} from "@/lib/schedule/actions";
import type { EntryMatch, EventDetail, EventEntry } from "@/lib/schedule/types";
import type { LadderPlayer } from "@/lib/data/roster-server";

import { dualSeed } from "@/components/dashboard/schedule/static/new-dual-flow";
import {
  buildDualPayloadLines,
  filledDualLines,
  lockedByKeyFromSeed,
  lockedForfeitFromSeed,
  seedDualLines,
  seededIdsFromSeed,
} from "@/components/dashboard/schedule/static/dual-build-step";
import { tournamentSeed } from "@/components/dashboard/schedule/static/new-tournament-flow";
import {
  buildTournamentEntries,
  seedEntries,
} from "@/components/dashboard/schedule/static/static-tournament-builder";

/**
 * The round trip that matters most: a coach opens an event's editor and,
 * having changed nothing, presses Save. `NewDualFlow` and `NewTournamentFlow`
 * seed their drafts from `EventDetail` (`dualSeed`/`tournamentSeed`), and
 * `useDualDraft`/`useTournamentDraft` map that draft back to the exact input
 * shape `planEntryChanges` compares against what was loaded
 * (`LineupLineInput[]` / `TournamentEntryInput[]`).
 *
 * This spec drives the REAL seed→payload transformation end to end — the same
 * functions the two hooks call, exported unchanged (a mechanical extraction,
 * no logic duplicated here) — and asserts `planEntryChanges` reports no
 * insert, update, delete or refuse. If any field the two ends disagree about
 * slips in (a re-derived id, a recomputed roster id, a narrowed forfeit), this
 * is where it shows up: as a save that tells a coach a line they never
 * touched has changed.
 */

function match(id: string): EntryMatch {
  return {
    id,
    round: null,
    status: "imported",
    score: { player1: [6, 3], player2: [4, 6] },
    opponentLabels: ["Rival Player"],
    hasVideo: false,
  };
}

function baseEntry(
  overrides: Partial<EventEntry> & { id: string },
): EventEntry {
  return {
    eventId: "ev-dual-1",
    discipline: "singles",
    slot: null,
    position: 0,
    draw: null,
    seed: null,
    playerUserIds: [],
    playerLabels: [],
    opponentLabels: [],
    opponentSchool: "Ridgeline",
    opponentProgramId: null,
    forfeit: null,
    matches: [],
    ...overrides,
  };
}

test.describe("round trip — a dual, loaded and saved unchanged", () => {
  // Roster names match the saved `playerLabels` exactly (case/whitespace
  // aside) so `rosterIdsForLabels` — run again on the seeded label, never
  // carried in — resolves back to the same ids the entries were saved with.
  const ladder: LadderPlayer[] = [
    { userId: "u-ana", name: "Ana Vasquez", ladderPosition: 1 },
    { userId: "u-ben", name: "Ben Cole", ladderPosition: 2 },
    { userId: "u-cara", name: "Cara Diaz", ladderPosition: 3 },
    { userId: "u-dana", name: "Dana Brooks", ladderPosition: 4 },
    { userId: "u-eli", name: "Eli Frost", ladderPosition: 5 },
    { userId: "u-faye", name: "Faye Grant", ladderPosition: 6 },
  ];

  // Nine lines: two scored singles, one scored doubles, one singles forfeited
  // by the opponent, and five unplayed lines (three singles, two doubles) —
  // the ordinary "empty" state (`entryState`: no forfeit, no matches).
  const entries: EventEntry[] = [
    baseEntry({
      id: "e-s1",
      slot: "S1",
      position: 0,
      playerUserIds: ["u-ana"],
      playerLabels: ["Ana Vasquez"],
      opponentLabels: ["Rival One"],
      matches: [match("m-s1")],
    }),
    baseEntry({
      id: "e-s2",
      slot: "S2",
      position: 1,
      playerUserIds: ["u-ben"],
      playerLabels: ["Ben Cole"],
      opponentLabels: ["Rival Two"],
      matches: [match("m-s2")],
    }),
    baseEntry({
      id: "e-s3",
      slot: "S3",
      position: 2,
      playerUserIds: ["u-cara"],
      playerLabels: ["Cara Diaz"],
      opponentLabels: ["Rival Three"],
      forfeit: "theirs",
    }),
    baseEntry({
      id: "e-s4",
      slot: "S4",
      position: 3,
      playerUserIds: ["u-dana"],
      playerLabels: ["Dana Brooks"],
      opponentLabels: ["Rival Four"],
    }),
    baseEntry({
      id: "e-s5",
      slot: "S5",
      position: 4,
      playerUserIds: ["u-eli"],
      playerLabels: ["Eli Frost"],
      opponentLabels: ["Rival Five"],
    }),
    baseEntry({
      id: "e-s6",
      slot: "S6",
      position: 5,
      playerUserIds: ["u-faye"],
      playerLabels: ["Faye Grant"],
      opponentLabels: ["Rival Six"],
    }),
    baseEntry({
      id: "e-d1",
      discipline: "doubles",
      slot: "D1",
      position: 6,
      playerUserIds: ["u-ana", "u-ben"],
      playerLabels: ["Ana Vasquez", "Ben Cole"],
      opponentLabels: ["Rival One", "Rival Two"],
      matches: [match("m-d1")],
    }),
    baseEntry({
      id: "e-d2",
      discipline: "doubles",
      slot: "D2",
      position: 7,
      playerUserIds: ["u-cara", "u-dana"],
      playerLabels: ["Cara Diaz", "Dana Brooks"],
      opponentLabels: ["Rival Three", "Rival Four"],
    }),
    baseEntry({
      id: "e-d3",
      discipline: "doubles",
      slot: "D3",
      position: 8,
      playerUserIds: ["u-eli", "u-faye"],
      playerLabels: ["Eli Frost", "Faye Grant"],
      opponentLabels: ["Rival Five", "Rival Six"],
    }),
  ];

  const detail: EventDetail = {
    event: {
      id: "ev-dual-1",
      programId: "prog-1",
      kind: "dual",
      name: "Ridgeline",
      startsOn: "2026-09-10",
      endsOn: "2026-09-10",
      site: "home",
      surface: "hard",
      host: null,
      format: { bestOf: 3, adScoring: false },
    },
    entries,
  };

  /** `useDualDraft`'s seed→state→payload path, run over `ladder` and `detail`. */
  function roundTripPayload(): LineupLineInput[] {
    const seed = dualSeed(detail);
    const lines = seedDualLines(ladder, seed);
    const filled = filledDualLines(lines, lockedByKeyFromSeed(seed));
    return buildDualPayloadLines(
      filled,
      seededIdsFromSeed(seed),
      lockedForfeitFromSeed(seed),
    );
  }

  test("loading the event and saving it unchanged plans nothing", () => {
    const payload = roundTripPayload();
    expect(payload).toHaveLength(9);

    const plan = planEntryChanges(entries, payload);

    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.delete).toEqual([]);
    expect(plan.refuse).toEqual([]);
  });

  test("clearing an unplayed line deletes exactly that line and refuses nothing", () => {
    const payload = roundTripPayload().filter((row) => row.slot !== "S6");

    const plan = planEntryChanges(entries, payload);

    expect(plan.refuse).toEqual([]);
    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.delete).toEqual([{ id: "e-s6", slot: "S6" }]);
  });

  test("renaming a scored line refuses naming its slot", () => {
    const payload = roundTripPayload().map((row) =>
      row.slot === "S1"
        ? { ...row, playerLabels: ["Someone Else"], playerUserIds: [] }
        : row,
    );

    const plan = planEntryChanges(entries, payload);

    expect(plan.update).toEqual([]);
    expect(plan.delete).toEqual([]);
    expect(plan.refuse).toHaveLength(1);
    expect(plan.refuse[0].slot).toBe("S1");
    expect(plan.refuse[0].reason).toContain("S1");
    expect(plan.refuse[0].reason).toContain("recorded match");
  });

  /**
   * The two ways a coach's own edit used to come back refused, or silently
   * undone, naming a court they never touched.
   *
   * Both are the same underlying mistake: treating a court's place in the
   * lineup as something derived from the OTHER courts. It isn't — a dual's
   * courts are S1…D3 and always have been, so a line's position is a fact
   * about its slot, and a court nobody saved is a court nobody is playing.
   */
  test.describe("a lineup with a gap above a played line", () => {
    // S1 empty, S2 played. Exactly the shape that used to break: `position`
    // was the index into the FILLED list, so S2 sat at 0 while S1 was empty.
    const gapped: EventEntry[] = [
      baseEntry({
        id: "g-s2",
        slot: "S2",
        position: 0,
        playerUserIds: ["u-ben"],
        playerLabels: ["Ben Cole"],
        opponentLabels: ["Rival Two"],
        matches: [match("m-g-s2")],
      }),
      baseEntry({
        id: "g-s3",
        slot: "S3",
        position: 1,
        playerUserIds: ["u-cara"],
        playerLabels: ["Cara Diaz"],
        opponentLabels: ["Rival Three"],
      }),
    ];

    const gappedDetail: EventDetail = {
      ...detail,
      entries: gapped,
    };

    function payloadFor(seed: ReturnType<typeof dualSeed>): LineupLineInput[] {
      const lines = seedDualLines(ladder, seed);
      const filled = filledDualLines(lines, lockedByKeyFromSeed(seed));
      return buildDualPayloadLines(
        filled,
        seededIdsFromSeed(seed),
        lockedForfeitFromSeed(seed),
      );
    }

    test("a line’s position is its court, not its place among the filled ones", () => {
      const payload = payloadFor(dualSeed(gappedDetail));
      const bySlot = new Map(payload.map((row) => [row.slot, row.position]));

      // S2 is the second court whether or not S1 is empty.
      expect(bySlot.get("S2")).toBe(1);
      expect(bySlot.get("S3")).toBe(2);
    });

    test("filling the empty court above a played one refuses nothing", () => {
      const seed = dualSeed(gappedDetail);
      const payload = payloadFor(seed).concat({
        discipline: "singles",
        slot: "S1",
        position: 0,
        playerUserIds: ["u-ana"],
        playerLabels: ["Ana Vasquez"],
        opponentLabels: ["Rival One"],
        forfeit: null,
      });

      const plan = planEntryChanges(gapped, payload);

      // The coach touched S1 and nothing else. S2 is played and must be left
      // exactly alone — not refused over a position that only moved because
      // the court above it stopped being empty.
      expect(plan.refuse).toEqual([]);
      expect(plan.update).toEqual([]);
      expect(plan.delete).toEqual([]);
      expect(plan.insert).toHaveLength(1);
      expect(plan.insert[0].slot).toBe("S1");
    });

    test("a court the saved lineup does not mention opens empty, not ladder-seeded", () => {
      // `gapped` names S2 and S3 only. The ladder could fill all nine, and
      // used to: D1–D3 came back with pairs on them and the next save would
      // have inserted courts the coach had removed.
      const lines = seedDualLines(ladder, dualSeed(gappedDetail));

      const untouched = lines.filter(
        (line) => line.key !== "S2" && line.key !== "S3",
      );
      for (const line of untouched) {
        expect(
          line.ourLabels.filter(Boolean),
          `${line.key} should be empty`,
        ).toEqual([]);
        expect(line.ourIds, `${line.key} should name nobody`).toEqual([]);
      }

      const payload = payloadFor(dualSeed(gappedDetail));
      expect(payload.map((row) => row.slot).sort()).toEqual(["S2", "S3"]);
    });

    test("a brand new dual still opens on the ladder", () => {
      // The seed above is a LOADED lineup. One with no lines at all is a new
      // dual, and that is the case the ladder exists for.
      const lines = seedDualLines(ladder, undefined);
      expect(lines.find((line) => line.key === "S1")?.ourLabels).toEqual([
        "Ana Vasquez",
      ]);
      expect(lines.find((line) => line.key === "D1")?.ourIds).toEqual([
        "u-ana",
        "u-ben",
      ]);
    });
  });
});

test.describe("round trip — a tournament, loaded and saved unchanged", () => {
  const roster: LadderPlayer[] = [
    { userId: "u-ana", name: "Ana Vasquez", ladderPosition: 1 },
    // Renamed on the roster since the entry was saved — see `t-2` below.
    { userId: "u-ben", name: "Ben H. Cole", ladderPosition: 2 },
    { userId: "u-cara", name: "Cara Diaz", ladderPosition: 3 },
    { userId: "u-dana", name: "Dana Brooks", ladderPosition: 4 },
  ];

  const entries: EventEntry[] = [
    // Main draw, seeded, unplayed — the field step can draw this one.
    baseEntry({
      id: "t-1",
      position: 0,
      draw: "Main draw",
      seed: 3,
      playerUserIds: ["u-ana"],
      playerLabels: ["Ana Vasquez"],
    }),
    // Main draw, unseeded, played — a match hangs off it. The roster player
    // was renamed since ('Ben H. Cole' on the roster now); the saved label
    // must round-trip untouched rather than being re-derived from the
    // roster, or an unrelated rename would refuse a save that changed
    // nothing about this entry.
    baseEntry({
      id: "t-2",
      position: 1,
      draw: "Main draw",
      seed: null,
      playerUserIds: ["u-ben"],
      playerLabels: ["Ben Cole"],
      matches: [match("m-t2")],
    }),
    // Qualifying, unseeded, unplayed.
    baseEntry({
      id: "t-3",
      position: 2,
      draw: "Qualifying",
      seed: null,
      playerUserIds: ["u-cara"],
      playerLabels: ["Cara Diaz"],
    }),
    // A draw the field step's two-option control cannot draw — carried back
    // verbatim rather than dropped (which `planEntryChanges` would read as a
    // delete) or coerced onto Main draw/Qualifying (which would rewrite it).
    baseEntry({
      id: "t-4",
      position: 3,
      draw: "Consolation",
      seed: null,
      playerUserIds: ["u-dana"],
      playerLabels: ["Dana Brooks"],
    }),
  ];

  const detail: EventDetail = {
    event: {
      id: "ev-tourney-1",
      programId: "prog-1",
      kind: "tournament",
      name: "Fall Invitational",
      startsOn: "2026-09-12",
      endsOn: "2026-09-13",
      site: "neutral",
      surface: "hard",
      host: null,
      format: { bestOf: 3, adScoring: true },
    },
    entries,
  };

  /** `useTournamentDraft`'s seed→state→payload path, run over `roster` and `detail`. */
  function roundTripPayload(): TournamentEntryInput[] {
    const seed = tournamentSeed(detail, roster);
    const entered = seedEntries(roster, seed.field);
    return buildTournamentEntries(roster, entered, seed.carry ?? []);
  }

  test("loading the event and saving it unchanged plans nothing", () => {
    const payload = roundTripPayload();
    expect(payload).toHaveLength(4);

    const plan = planEntryChanges(entries, payload);

    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.delete).toEqual([]);
    expect(plan.refuse).toEqual([]);
  });

  test("the carried entry survives the round trip byte-for-byte", () => {
    const payload = roundTripPayload();
    const carried = payload.find((row) => row.id === "t-4");
    const saved = entries.find((row) => row.id === "t-4")!;

    expect(carried).toEqual({
      id: saved.id,
      discipline: saved.discipline,
      position: saved.position,
      draw: saved.draw,
      seed: saved.seed,
      playerUserIds: saved.playerUserIds,
      playerLabels: saved.playerLabels,
    });
  });
});
