import { expect, test } from '@playwright/test';

import { planEntryChanges } from '@/lib/schedule/entry-plan';
import type { LineupLineInput, TournamentEntryInput } from '@/lib/schedule/actions';
import type { EntryMatch, EventEntry } from '@/lib/schedule/types';

/**
 * `planEntryChanges` — what a lineup edit is allowed to do to lines the rest of
 * the product has already built on.
 *
 * Pure, over hand-built `EventEntry` rows, the same shape
 * `tests/tournament-run.spec.ts` uses: a drift in `EventEntry` fails at compile
 * time rather than at runtime, and nothing here needs a database or a browser.
 *
 * The rule these pin is the one that matters: a line with a match or a forfeit
 * is never re-pointed at a different player and never deleted. Re-attributing a
 * played line is invisible on screen — the page still renders, the score is
 * still there, and it now belongs to somebody who did not play it.
 */

function match(id: string): EntryMatch {
  return {
    id,
    round: null,
    status: 'imported',
    score: { player1: [6, 6], player2: [3, 4] },
    opponentLabels: ['Rival Player'],
    hasVideo: false,
  };
}

function entry(overrides: Partial<EventEntry> & { id: string }): EventEntry {
  return {
    eventId: 'ev-1',
    discipline: 'singles',
    slot: 'S1',
    position: 0,
    draw: null,
    seed: null,
    playerUserIds: ['user-a'],
    playerLabels: ['Ana Vasquez'],
    opponentLabels: ['Rival Player'],
    opponentSchool: 'Ridgeline',
    opponentProgramId: null,
    forfeit: null,
    matches: [],
    ...overrides,
  };
}

function line(overrides: Partial<LineupLineInput> = {}): LineupLineInput {
  return {
    discipline: 'singles',
    slot: 'S1',
    position: 0,
    playerUserIds: ['user-a'],
    playerLabels: ['Ana Vasquez'],
    opponentLabels: ['Rival Player'],
    forfeit: null,
    ...overrides,
  };
}

test.describe('planEntryChanges — a dual lineup', () => {
  /**
   * The commonest save of all: a coach opens the editor, changes one thing
   * somewhere else, and submits. Every untouched line must produce no
   * statement at all — an update that writes identical values still bumps
   * `updated_at` and still has to pass the settled check, so "no change, no
   * row" is the difference between editing a dual and re-saving it.
   */
  test('an unchanged lineup plans nothing', () => {
    const plan = planEntryChanges([entry({ id: 'e-1' })], [line({ id: 'e-1' })]);

    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.delete).toEqual([]);
    expect(plan.refuse).toEqual([]);
  });

  test('a renamed unplayed line updates', () => {
    const plan = planEntryChanges(
      [entry({ id: 'e-1' })],
      [line({ id: 'e-1', playerLabels: ['Dana Brooks'], playerUserIds: ['user-b'] })]
    );

    expect(plan.refuse).toEqual([]);
    expect(plan.delete).toEqual([]);
    expect(plan.update.map((row) => row.id)).toEqual(['e-1']);
    expect(plan.update[0].row.playerLabels).toEqual(['Dana Brooks']);
  });

  /**
   * The whole reason this module exists. S1 has a match; pointing it at a
   * different player would re-attribute that match. Refused by slot, and NOT
   * quietly dropped from the update list — a caller that saw an empty `update`
   * would report a successful save that changed nothing.
   */
  test('a renamed played line refuses, naming the slot', () => {
    const plan = planEntryChanges(
      [entry({ id: 'e-1', matches: [match('m-1')] })],
      [line({ id: 'e-1', playerLabels: ['Dana Brooks'], playerUserIds: ['user-b'] })]
    );

    expect(plan.update).toEqual([]);
    expect(plan.refuse).toHaveLength(1);
    expect(plan.refuse[0].slot).toBe('S1');
    expect(plan.refuse[0].reason).toContain('S1');
    expect(plan.refuse[0].reason).toContain('recorded match');
  });

  /** A forfeit is an outcome too, and locks the line exactly as a match does. */
  test('a renamed forfeited line refuses', () => {
    const plan = planEntryChanges(
      [entry({ id: 'e-1', forfeit: 'ours' })],
      [line({ id: 'e-1', forfeit: 'ours', playerLabels: ['Dana Brooks'] })]
    );

    expect(plan.update).toEqual([]);
    expect(plan.refuse).toHaveLength(1);
    expect(plan.refuse[0].reason).toContain('forfeited');
  });

  /**
   * Dropped, not renamed — and still refused. "Never deleted" is the stronger
   * half of the rule: a delete would orphan the `matches` row that points at
   * this entry, and nothing would name the line it belonged to.
   */
  test('a dropped played line refuses rather than deleting', () => {
    const plan = planEntryChanges(
      [entry({ id: 'e-1', matches: [match('m-1')] })],
      [] as LineupLineInput[]
    );

    expect(plan.delete).toEqual([]);
    expect(plan.refuse).toHaveLength(1);
    expect(plan.refuse[0].slot).toBe('S1');
    expect(plan.refuse[0].reason).toContain("can't be removed");
  });

  test('a dropped unplayed line deletes', () => {
    const plan = planEntryChanges(
      [entry({ id: 'e-1' })],
      [] as LineupLineInput[]
    );

    expect(plan.refuse).toEqual([]);
    expect(plan.delete).toEqual([{ id: 'e-1', slot: 'S1' }]);
  });

  test('a new slot inserts', () => {
    const plan = planEntryChanges(
      [entry({ id: 'e-1' })],
      [line({ id: 'e-1' }), line({ slot: 'S2', position: 1 })]
    );

    expect(plan.refuse).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.delete).toEqual([]);
    expect(plan.insert.map((row) => row.slot)).toEqual(['S2']);
  });

  /**
   * A form that never learned the ids still has to land on the saved rows.
   * Matching on slot is what stops a re-typed lineup reading as nine deletes
   * and nine inserts — which, on a dual with results, would be nine refusals
   * for a save that changed nothing.
   */
  test('a row with no id matches its saved row by slot', () => {
    const plan = planEntryChanges([entry({ id: 'e-1' })], [line()]);

    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.delete).toEqual([]);
  });
});

test.describe('planEntryChanges — a tournament draw', () => {
  const saved = entry({
    id: 't-1',
    slot: null,
    draw: 'Main draw',
    seed: 3,
    position: 0,
  });

  function tournamentEntry(
    overrides: Partial<TournamentEntryInput> = {}
  ): TournamentEntryInput {
    return {
      discipline: 'singles',
      position: 0,
      draw: 'Main draw',
      seed: 3,
      playerUserIds: ['user-a'],
      playerLabels: ['Ana Vasquez'],
      ...overrides,
    };
  }

  /**
   * A tournament entry has no slot column, so its label is drawn from the draw
   * and the position — and a scored entry carries `opponent_labels` that
   * `recordResult` wrote, which the submitted shape has no field for. Folding
   * that column into the comparison would report every scored entry as edited
   * and refuse a save that changed nothing.
   */
  test('an unchanged scored entry plans nothing', () => {
    const plan = planEntryChanges(
      [{ ...saved, matches: [match('m-1')], opponentLabels: ['Someone Else'] }],
      [tournamentEntry({ id: 't-1' })]
    );

    expect(plan.refuse).toEqual([]);
    expect(plan.update).toEqual([]);
  });

  test('a reseeded played entry refuses, naming the draw and position', () => {
    const plan = planEntryChanges(
      [{ ...saved, matches: [match('m-1')] }],
      [tournamentEntry({ id: 't-1', seed: 1 })]
    );

    expect(plan.refuse).toHaveLength(1);
    expect(plan.refuse[0].slot).toBe('Main draw #0');
    expect(plan.refuse[0].reason).toContain('Main draw #0');
  });

  test('a redrawn unplayed entry updates', () => {
    const plan = planEntryChanges(
      [saved],
      [tournamentEntry({ id: 't-1', draw: 'Qualifying' })]
    );

    expect(plan.refuse).toEqual([]);
    expect(plan.update.map((row) => row.id)).toEqual(['t-1']);
  });
});
