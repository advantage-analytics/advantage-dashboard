import { expect, test } from '@playwright/test';

import { planEntryChanges } from '@/lib/schedule/entry-plan';
import type { LineupLineInput, TournamentEntryInput } from '@/lib/schedule/actions';
import type { EntryMatch, EventDetail, EventEntry } from '@/lib/schedule/types';
import type { LadderPlayer } from '@/lib/data/roster-server';

import { dualSeed } from '@/components/dashboard/schedule/static/new-dual-flow';
import {
  buildDualPayloadLines,
  filledDualLines,
  lockedByKeyFromSeed,
  lockedForfeitFromSeed,
  seedDualLines,
  seededIdsFromSeed,
} from '@/components/dashboard/schedule/static/dual-build-step';
import { tournamentSeed } from '@/components/dashboard/schedule/static/new-tournament-flow';
import {
  buildTournamentEntries,
  seedEntries,
} from '@/components/dashboard/schedule/static/static-tournament-builder';

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
    status: 'imported',
    score: { player1: [6, 3], player2: [4, 6] },
    opponentLabels: ['Rival Player'],
    hasVideo: false,
  };
}

function baseEntry(overrides: Partial<EventEntry> & { id: string }): EventEntry {
  return {
    eventId: 'ev-dual-1',
    discipline: 'singles',
    slot: null,
    position: 0,
    draw: null,
    seed: null,
    playerUserIds: [],
    playerLabels: [],
    opponentLabels: [],
    opponentSchool: 'Ridgeline',
    opponentProgramId: null,
    forfeit: null,
    matches: [],
    ...overrides,
  };
}

test.describe('round trip — a dual, loaded and saved unchanged', () => {
  // Roster names match the saved `playerLabels` exactly (case/whitespace
  // aside) so `rosterIdsForLabels` — run again on the seeded label, never
  // carried in — resolves back to the same ids the entries were saved with.
  const ladder: LadderPlayer[] = [
    { userId: 'u-ana', name: 'Ana Vasquez', ladderPosition: 1 },
    { userId: 'u-ben', name: 'Ben Cole', ladderPosition: 2 },
    { userId: 'u-cara', name: 'Cara Diaz', ladderPosition: 3 },
    { userId: 'u-dana', name: 'Dana Brooks', ladderPosition: 4 },
    { userId: 'u-eli', name: 'Eli Frost', ladderPosition: 5 },
    { userId: 'u-faye', name: 'Faye Grant', ladderPosition: 6 },
  ];

  // Nine lines: two scored singles, one scored doubles, one singles forfeited
  // by the opponent, and five unplayed lines (three singles, two doubles) —
  // the ordinary "empty" state (`entryState`: no forfeit, no matches).
  const entries: EventEntry[] = [
    baseEntry({
      id: 'e-s1',
      slot: 'S1',
      position: 0,
      playerUserIds: ['u-ana'],
      playerLabels: ['Ana Vasquez'],
      opponentLabels: ['Rival One'],
      matches: [match('m-s1')],
    }),
    baseEntry({
      id: 'e-s2',
      slot: 'S2',
      position: 1,
      playerUserIds: ['u-ben'],
      playerLabels: ['Ben Cole'],
      opponentLabels: ['Rival Two'],
      matches: [match('m-s2')],
    }),
    baseEntry({
      id: 'e-s3',
      slot: 'S3',
      position: 2,
      playerUserIds: ['u-cara'],
      playerLabels: ['Cara Diaz'],
      opponentLabels: ['Rival Three'],
      forfeit: 'theirs',
    }),
    baseEntry({
      id: 'e-s4',
      slot: 'S4',
      position: 3,
      playerUserIds: ['u-dana'],
      playerLabels: ['Dana Brooks'],
      opponentLabels: ['Rival Four'],
    }),
    baseEntry({
      id: 'e-s5',
      slot: 'S5',
      position: 4,
      playerUserIds: ['u-eli'],
      playerLabels: ['Eli Frost'],
      opponentLabels: ['Rival Five'],
    }),
    baseEntry({
      id: 'e-s6',
      slot: 'S6',
      position: 5,
      playerUserIds: ['u-faye'],
      playerLabels: ['Faye Grant'],
      opponentLabels: ['Rival Six'],
    }),
    baseEntry({
      id: 'e-d1',
      discipline: 'doubles',
      slot: 'D1',
      position: 6,
      playerUserIds: ['u-ana', 'u-ben'],
      playerLabels: ['Ana Vasquez', 'Ben Cole'],
      opponentLabels: ['Rival One', 'Rival Two'],
      matches: [match('m-d1')],
    }),
    baseEntry({
      id: 'e-d2',
      discipline: 'doubles',
      slot: 'D2',
      position: 7,
      playerUserIds: ['u-cara', 'u-dana'],
      playerLabels: ['Cara Diaz', 'Dana Brooks'],
      opponentLabels: ['Rival Three', 'Rival Four'],
    }),
    baseEntry({
      id: 'e-d3',
      discipline: 'doubles',
      slot: 'D3',
      position: 8,
      playerUserIds: ['u-eli', 'u-faye'],
      playerLabels: ['Eli Frost', 'Faye Grant'],
      opponentLabels: ['Rival Five', 'Rival Six'],
    }),
  ];

  const detail: EventDetail = {
    event: {
      id: 'ev-dual-1',
      programId: 'prog-1',
      kind: 'dual',
      name: 'Ridgeline',
      startsOn: '2026-09-10',
      endsOn: '2026-09-10',
      site: 'home',
      surface: 'hard',
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
      lockedForfeitFromSeed(seed)
    );
  }

  test('loading the event and saving it unchanged plans nothing', () => {
    const payload = roundTripPayload();
    expect(payload).toHaveLength(9);

    const plan = planEntryChanges(entries, payload);

    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.delete).toEqual([]);
    expect(plan.refuse).toEqual([]);
  });

  test('clearing an unplayed line deletes exactly that line and refuses nothing', () => {
    const payload = roundTripPayload().filter((row) => row.slot !== 'S6');

    const plan = planEntryChanges(entries, payload);

    expect(plan.refuse).toEqual([]);
    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.delete).toEqual([{ id: 'e-s6', slot: 'S6' }]);
  });

  test('renaming a scored line refuses naming its slot', () => {
    const payload = roundTripPayload().map((row) =>
      row.slot === 'S1'
        ? { ...row, playerLabels: ['Someone Else'], playerUserIds: [] }
        : row
    );

    const plan = planEntryChanges(entries, payload);

    expect(plan.update).toEqual([]);
    expect(plan.delete).toEqual([]);
    expect(plan.refuse).toHaveLength(1);
    expect(plan.refuse[0].slot).toBe('S1');
    expect(plan.refuse[0].reason).toContain('S1');
    expect(plan.refuse[0].reason).toContain('recorded match');
  });
});

test.describe('round trip — a tournament, loaded and saved unchanged', () => {
  const roster: LadderPlayer[] = [
    { userId: 'u-ana', name: 'Ana Vasquez', ladderPosition: 1 },
    // Renamed on the roster since the entry was saved — see `t-2` below.
    { userId: 'u-ben', name: 'Ben H. Cole', ladderPosition: 2 },
    { userId: 'u-cara', name: 'Cara Diaz', ladderPosition: 3 },
    { userId: 'u-dana', name: 'Dana Brooks', ladderPosition: 4 },
  ];

  const entries: EventEntry[] = [
    // Main draw, seeded, unplayed — the field step can draw this one.
    baseEntry({
      id: 't-1',
      position: 0,
      draw: 'Main draw',
      seed: 3,
      playerUserIds: ['u-ana'],
      playerLabels: ['Ana Vasquez'],
    }),
    // Main draw, unseeded, played — a match hangs off it. The roster player
    // was renamed since ('Ben H. Cole' on the roster now); the saved label
    // must round-trip untouched rather than being re-derived from the
    // roster, or an unrelated rename would refuse a save that changed
    // nothing about this entry.
    baseEntry({
      id: 't-2',
      position: 1,
      draw: 'Main draw',
      seed: null,
      playerUserIds: ['u-ben'],
      playerLabels: ['Ben Cole'],
      matches: [match('m-t2')],
    }),
    // Qualifying, unseeded, unplayed.
    baseEntry({
      id: 't-3',
      position: 2,
      draw: 'Qualifying',
      seed: null,
      playerUserIds: ['u-cara'],
      playerLabels: ['Cara Diaz'],
    }),
    // A draw the field step's two-option control cannot draw — carried back
    // verbatim rather than dropped (which `planEntryChanges` would read as a
    // delete) or coerced onto Main draw/Qualifying (which would rewrite it).
    baseEntry({
      id: 't-4',
      position: 3,
      draw: 'Consolation',
      seed: null,
      playerUserIds: ['u-dana'],
      playerLabels: ['Dana Brooks'],
    }),
  ];

  const detail: EventDetail = {
    event: {
      id: 'ev-tourney-1',
      programId: 'prog-1',
      kind: 'tournament',
      name: 'Fall Invitational',
      startsOn: '2026-09-12',
      endsOn: '2026-09-13',
      site: 'neutral',
      surface: 'hard',
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

  test('loading the event and saving it unchanged plans nothing', () => {
    const payload = roundTripPayload();
    expect(payload).toHaveLength(4);

    const plan = planEntryChanges(entries, payload);

    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.delete).toEqual([]);
    expect(plan.refuse).toEqual([]);
  });

  test('the carried entry survives the round trip byte-for-byte', () => {
    const payload = roundTripPayload();
    const carried = payload.find((row) => row.id === 't-4');
    const saved = entries.find((row) => row.id === 't-4')!;

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
