import { expect, test } from '@playwright/test';

import { normalizedPersonName } from '@/lib/data/person-name';
import { headToHeadRows, opponentPlayerMatches } from '@/lib/data/opponents-server';
import { benchFromLines, rosterIdsForLabels } from '@/lib/schedule/roster-match';

/**
 * One rule for "the same name", applied on BOTH sides of every comparison.
 *
 * The bug these guard against was invisible: two spellings that render
 * identically on screen — one with a trailing space, one with a doubled
 * internal space — compared unequal, so a head-to-head row vanished, an
 * opponent profile lost a match, a lineup entry silently resolved to no
 * athlete, and a player already standing in S1 also sat on the bench. Nothing
 * errored and no number looked wrong.
 *
 * The doubled internal space is not hypothetical: an opponent roster name is
 * built as `${first_name} ${last_name}`, so one trailing space in a single
 * column produces it, and `.trim()` on the typed side can never reach it.
 *
 * The other half of the contract is that this stays EXACT, which is why every
 * describe below ends on a near-miss that must NOT match. Two of these sites
 * resolve a typed label to the id a match is recorded against; a looser rule
 * would attribute an athlete's match to somebody else with nothing looking
 * broken on screen.
 */

// Two people, each stored with one of the two stray-whitespace spellings, plus
// a near-miss. Different people on purpose: two rows normalizing to one key is
// the duplicate-profile case, not a working roster.
const BROOKS_TYPED = 'Dana Brooks';
const BROOKS_TRAILING = 'Dana Brooks ';
const REID_TYPED = 'Sam Reid';
const REID_DOUBLED = 'Sam  Reid';
const NEAR_MISS = 'Dana Brook';

test.describe('normalizedPersonName', () => {
  test('case and whitespace are noise', () => {
    expect(normalizedPersonName(BROOKS_TRAILING)).toBe(normalizedPersonName(BROOKS_TYPED));
    expect(normalizedPersonName(REID_DOUBLED)).toBe(normalizedPersonName(REID_TYPED));
    expect(normalizedPersonName('  dana\tBROOKS  ')).toBe(normalizedPersonName(BROOKS_TYPED));
  });

  test('everything else is signal', () => {
    expect(normalizedPersonName(NEAR_MISS)).not.toBe(normalizedPersonName(BROOKS_TYPED));
    expect(normalizedPersonName('Brooks Dana')).not.toBe(normalizedPersonName(BROOKS_TYPED));
    expect(normalizedPersonName('D. Brooks')).not.toBe(normalizedPersonName(BROOKS_TYPED));
  });

  test('a missing name is the empty key, not a wildcard', () => {
    expect(normalizedPersonName(null)).toBe('');
    expect(normalizedPersonName(undefined)).toBe('');
    expect(normalizedPersonName('   ')).toBe('');
  });
});

/**
 * The row shape both opponents helpers accept, as `OpponentAttributedRow`
 * bounds it. One builder for both describes: they are testing two functions
 * over one shape, and two copies is two places to edit when it grows a field.
 */
const row = (
  id: string,
  name: string | null,
  opponentId: string | null = null
) => ({
  id,
  player2_name: name,
  opponent_player_id: opponentId,
});

test.describe('headToHeadRows', () => {
  // `pooled_roster` hands back first and last name separately and the page
  // joins them, so both spellings below are what one stray space in one column
  // produces. `matches.player2_name` on the other side is whatever the uploader
  // typed.
  const roster = [
    { id: 'p-brooks', name: BROOKS_TRAILING },
    { id: 'p-reid', name: REID_DOUBLED },
  ];

  test('a roster name with a trailing space matches the typed form', () => {
    const kept = headToHeadRows([row('m1', BROOKS_TYPED)], roster);
    expect(kept.map((m) => m.id)).toEqual(['m1']);
  });

  test('a roster name with a doubled internal space matches the typed form', () => {
    const kept = headToHeadRows([row('m1', REID_TYPED)], roster);
    expect(kept.map((m) => m.id)).toEqual(['m1']);
  });

  test('the typed side brings its own stray whitespace and case', () => {
    const kept = headToHeadRows(
      [row('m1', '  dana   brooks  '), row('m2', 'SAM REID')],
      roster
    );
    expect(kept.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  test('a near-miss is a different person', () => {
    expect(headToHeadRows([row('m1', NEAR_MISS)], roster)).toEqual([]);
  });

  test('identity beats the name, in both directions', () => {
    // On the roster by id, so it counts even though the typed name is somebody
    // else's — the pre-identity rows are exactly what the fallback exists for.
    const byId = headToHeadRows([row('m1', 'Someone Entirely Else', 'p-brooks')], roster);
    expect(byId.map((m) => m.id)).toEqual(['m1']);

    // Attributed to a player who is NOT on this roster. The matching name must
    // not drag it back in: an explicit id is an answer, and the name fallback
    // is only for rows that have none.
    const wrongId = headToHeadRows([row('m1', BROOKS_TYPED, 'someone-elses-id')], roster);
    expect(wrongId).toEqual([]);
  });

  test('two blanks are not a match', () => {
    // A match with no opponent name filed under a roster player with no name is
    // the one thing an empty normalized key would silently do.
    const kept = headToHeadRows(
      [row('m1', null), row('m2', '  ')],
      [{ id: 'p-nameless', name: '' }]
    );
    expect(kept).toEqual([]);
  });
});

test.describe('opponentPlayerMatches', () => {
  test('the profile name matches the typed name through either spelling', () => {
    expect(
      opponentPlayerMatches([row('m1', BROOKS_TYPED)], 'her-id', BROOKS_TRAILING).map(
        (m) => m.id
      )
    ).toEqual(['m1']);
    expect(
      opponentPlayerMatches([row('m1', REID_TYPED)], 'his-id', REID_DOUBLED).map((m) => m.id)
    ).toEqual(['m1']);
  });

  test('the name fallback never reaches a row attributed to somebody else', () => {
    const rows = [row('m1', BROOKS_TYPED, 'another-players-id')];
    expect(opponentPlayerMatches(rows, 'her-id', BROOKS_TYPED)).toEqual([]);
  });

  test('her own rows count by id whatever the name says', () => {
    const rows = [row('m1', null, 'her-id')];
    expect(opponentPlayerMatches(rows, 'her-id', BROOKS_TYPED).map((m) => m.id)).toEqual(['m1']);
  });

  test('a nameless profile claims no unattributed rows', () => {
    expect(opponentPlayerMatches([row('m1', null)], 'her-id', '   ')).toEqual([]);
  });

  test('a near-miss is a different person', () => {
    expect(opponentPlayerMatches([row('m1', NEAR_MISS)], 'her-id', BROOKS_TYPED)).toEqual([]);
  });
});

// The ladder both schedule sites read. `LadderPlayer` in the source; the two
// stray-whitespace spellings stand in for a roster row nobody cleaned up.
const LADDER = [
  { userId: 'u-brooks', name: BROOKS_TRAILING, ladderPosition: 1 },
  { userId: 'u-reid', name: REID_DOUBLED, ladderPosition: 2 },
  { userId: 'u-osei', name: 'Ama Osei', ladderPosition: 3 },
];

test.describe('rosterIdsForLabels', () => {
  test('a roster name with a trailing space resolves from the typed form', () => {
    expect(rosterIdsForLabels(BROOKS_TYPED, LADDER)).toEqual(['u-brooks']);
  });

  test('a roster name with a doubled internal space resolves from the typed form', () => {
    expect(rosterIdsForLabels(REID_TYPED, LADDER)).toEqual(['u-reid']);
  });

  test('a doubles pair resolves both halves', () => {
    expect(rosterIdsForLabels(`${BROOKS_TYPED} / sam   reid`, LADDER)).toEqual([
      'u-brooks',
      'u-reid',
    ]);
  });

  test('a label matching nobody drops its id rather than guessing', () => {
    // The entry still records the typed name; it just carries no userId. That
    // is the line between "we do not know who this is" and attributing an
    // athlete's match to the nearest-looking teammate.
    expect(rosterIdsForLabels('Nobody Here', LADDER)).toEqual([]);
    expect(rosterIdsForLabels(NEAR_MISS, LADDER)).toEqual([]);
    expect(rosterIdsForLabels('Dana', LADDER)).toEqual([]);
    expect(rosterIdsForLabels('D. Brooks', LADDER)).toEqual([]);
  });

  test('the unmatched half of a pair drops out on its own', () => {
    expect(rosterIdsForLabels(`${BROOKS_TYPED} / Nobody Here`, LADDER)).toEqual(['u-brooks']);
  });

  test('an empty field resolves to no ids at all', () => {
    expect(rosterIdsForLabels('', LADDER)).toEqual([]);
    expect(rosterIdsForLabels('  /  ', LADDER)).toEqual([]);
  });
});

test.describe('benchFromLines', () => {
  test('a ladder name with a trailing space leaves the bench when it is fielded', () => {
    const bench = benchFromLines([{ ourLabels: [BROOKS_TYPED] }], LADDER);
    expect(bench.map((p) => p.userId)).toEqual(['u-reid', 'u-osei']);
  });

  test('a ladder name with a doubled internal space leaves the bench too', () => {
    const bench = benchFromLines([{ ourLabels: [REID_TYPED] }], LADDER);
    expect(bench.map((p) => p.userId)).toEqual(['u-brooks', 'u-osei']);
  });

  test('a doubles line names both of its players', () => {
    const bench = benchFromLines([{ ourLabels: [`${BROOKS_TYPED} / ${REID_TYPED}`] }], LADDER);
    expect(bench.map((p) => p.userId)).toEqual(['u-osei']);
  });

  test('a near-miss does not take anybody off the bench', () => {
    const bench = benchFromLines([{ ourLabels: [NEAR_MISS] }], LADDER);
    expect(bench.map((p) => p.userId)).toEqual(['u-brooks', 'u-reid', 'u-osei']);
  });

  test('an empty lineup benches the whole ladder', () => {
    expect(benchFromLines([{ ourLabels: [] }, { ourLabels: [''] }], LADDER)).toHaveLength(3);
  });
});
