import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { dualScore } from '@/lib/schedule/entry-state';
import {
  ALL_PROGRAM_SCHOOLS,
  CONFERENCE_SCHOOLS,
  DIRECTORY_TERM,
  DIRECTORY_TOTAL,
  DUAL_DRAFT_EVENT,
  DUAL_DRAFT_LINES,
  DUAL_DRAFT_OPPONENT_SHORT,
  DUAL_DRAFT_SAVED_ROSTER,
  DUAL_DRAFT_TYPED_NAME,
  EVENT_DETAILS,
  OUR_CONFERENCE,
  OUR_DIVISION,
  PROGRAM_NAME,
  RAIL_SCHOOLS,
  SCHEDULE_ROWS,
  SEASON_FACTS,
  SEASON_LABEL,
  TOURNAMENT_FIELD,
  USER_NAME,
} from '@/lib/schedule/fixtures';
import { formatEventDay, siteTitle } from '@/lib/schedule/format';
import { LINE_STATUS } from '@/lib/schedule/line-status';
import { formatOpponentRecord } from '@/lib/schedule/opponent-history';
import { divisionLabel, teamLabel } from '@/lib/data/programs-server';

/**
 * The copy contract for the four static schedule routes.
 *
 * `/dashboard/team/schedule`, `.../new`, `.../new/dual` and `.../new/tournament`
 * are a character-for-character rebuild of ten artboards in
 * `Events & Lineups.dc.html` — `7e 7d 7c 4c`, `3b`, `2c 2b 2d 2e` and `3c`. The
 * whole point of that run is the punctuation as much as the words: an en dash
 * between two figures, `·` between two clauses, a STRAIGHT apostrophe, `↵` on a
 * card, `—` where a value is absent. Every one of those is a character a
 * reviewer's eye slides straight over, and a fixture quietly emptied to `[]`
 * reads as "no rows today" rather than as a defect.
 *
 * ── Why every expected string below is written out by hand ─────────────────
 * **This spec is an independent second copy of the design's strings.** Each
 * expectation was transcribed from the artboard markup, not imported from the
 * module it checks. A spec that read `SEASON_FACTS` and asserted it equalled
 * `SEASON_FACTS` would pass forever and catch nothing; so would one that built
 * a subline with the same helpers the component builds it with. So on every
 * assertion here exactly one side comes from the app — a fixture export, a
 * formatter's return value, or the component's own source text — and the other
 * side is a literal typed out of the capture.
 *
 * The characters are the design's own, verified at byte level against the
 * capture: `·` is U+00B7, `–` is U+2013, `—` is U+2014, `↵` is U+21B5, and the
 * apostrophes are U+0027. The artboards use straight quotes throughout; do not
 * "upgrade" any of them to curly here, and note that `entities()` below
 * deliberately does NOT decode `&rsquo;`, so an apostrophe that drifts curly
 * fails rather than passing.
 *
 * ── Why the components are read as text ────────────────────────────────────
 * `playwright.config.ts` configures no browser and no `webServer` on purpose,
 * and nothing in this repo can mount a React component. Copy that lives inline
 * in JSX is therefore checked by reading the component's source — the same
 * thing `generate-map.spec.ts`, `splitstep-derivation.spec.ts` and
 * `splitstep-transcript.spec.ts` already do. Nothing here writes to any file.
 */

const SCREENS = path.join(
  __dirname,
  '..',
  'src',
  'components',
  'dashboard',
  'schedule',
  'static'
);

/**
 * One screen's source, reduced to something a designed sentence survives in.
 *
 * Four passes, and the order matters:
 *
 *   1. **Comments go first, and they are the load-bearing pass.** These files
 *      quote the artboards at length in their own doc blocks — the tournament
 *      builder's header carries the info callout verbatim, `2b`'s carries
 *      "— no available player" — so a `toContain` over the raw file would pass
 *      on prose about the copy after the copy itself had been deleted. The
 *      empty `{ }` a removed JSX comment leaves behind goes with it, or it
 *      lands in the middle of a sentence the design wrote as one.
 *   2. `{" "}`, JSX's explicit space, written wherever a line break would
 *      otherwise swallow the space between two interpolations.
 *   3. The entity escapes a lint rule forces on to a literal apostrophe in JSX
 *      text (`&#39;` in the tournament builder, `&apos;` in the other two).
 *      Both ARE U+0027; only the SOURCE is normalized, never an expectation.
 *      `&rsquo;` is left alone deliberately — see the header.
 *   4. Whitespace, because prettier wraps a designed sentence at its margin and
 *      leaves the indent in the middle of it.
 *
 * The result is then returned TWICE over, the second copy with its JSX tags
 * removed. Neither view alone is enough: copy that rides in an attribute
 * (`label="Starts"`, `note="Save as a different player"`) is inside a tag and
 * only survives the first, while a sentence broken across
 * `<span className="tabular">` only reads whole in the second. The tag pattern
 * requires a letter after `<` and forbids a `<` or `>` inside, so
 * `index < suggestions.length` is never mistaken for a tag.
 */
function screen(file: string): string {
  const source = readFileSync(path.join(SCREENS, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    // The braces a removed JSX comment leaves behind, which would otherwise
    // land in the middle of a sentence the design wrote as one.
    .replace(/\{\s*\}/g, ' ')
    .replace(/\{" "\}/g, ' ')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

  const text = source.replace(/<\/?[A-Za-z][^<>]*>/g, ' ').replace(/\s+/g, ' ');

  return `${source}\n${text}`;
}

/**
 * Assert one transcribed string is still on the screen.
 *
 * A boolean rather than `toContain` so a failure prints the missing string and
 * not the whole normalized file — the useful half of the diff is the
 * expectation, which is the design's.
 */
function drawn(source: string, file: string, expected: string): void {
  expect(
    source.includes(expected),
    `${file} no longer draws ${JSON.stringify(expected)}`
  ).toBe(true);
}

/* ────────────────────────────────────────────────────────────────────────── */

test.describe('/dashboard/team/schedule · 7e 7d 7c 4c', () => {
  const schedule = screen('static-schedule.tsx');
  const drawer = screen('event-drawer.tsx');
  const widget = screen('dual-widget.tsx');

  test('the season this app is signed in to', () => {
    expect(PROGRAM_NAME).toBe('Meridian State');
    expect(USER_NAME).toBe('Elena Vasquez');
    // En dash between the two years, in `7e`'s topbar count.
    expect(SEASON_LABEL).toBe('2026–27');
    // `7d`'s season line — en dash between the figures, `·` between the
    // clauses. It claims a fourth completed dual no artboard names; that is
    // the design's, reproduced, and pinned here so it cannot quietly change.
    expect(SEASON_FACTS).toBe('3–1 in duals · 31 of 36 lines analyzed');
  });

  test("7d's four drawer rows", () => {
    expect(SCHEDULE_ROWS.map((row) => row.name)).toEqual([
      'Ridgeline University',
      'Fairmont A&M',
      'State College of Ash',
      'Harlow Valley',
    ]);

    // The mono line above each name, as the formatter actually renders it. The
    // design's weekday labels are what fix the fixture calendar to 2025.
    expect(SCHEDULE_ROWS.map((row) => formatEventDay(row.startsOn))).toEqual([
      'Fri 26 Sep',
      'Sat 20 Sep',
      'Sat 13 Sep',
      'Sat 6 Sep',
    ]);
    expect(SCHEDULE_ROWS.map((row) => siteTitle(row.site))).toEqual([
      'Home',
      'Away',
      'Home',
      'Away',
    ]);

    // The upcoming dual carries no score; the three completed ones carry the
    // team scores `7d` draws.
    expect(SCHEDULE_ROWS.map((row) => row.teamScore)).toEqual([
      null,
      { us: 5, them: 2 },
      { us: 6, them: 1 },
      { us: 4, them: 3 },
    ]);
  });

  test("the drawer's own words", () => {
    drawn(drawer, 'event-drawer.tsx', 'Upcoming');
    drawn(drawer, 'event-drawer.tsx', 'Completed');
    // `7e`: both sections, when there is nothing in either.
    drawn(drawer, 'event-drawer.tsx', 'None yet');
    drawn(
      drawer,
      'event-drawer.tsx',
      'Duals and tournaments list here, newest first.'
    );
    drawn(drawer, 'event-drawer.tsx', 'New event');
    // `·` between day and site on every drawn row.
    drawn(
      drawer,
      'event-drawer.tsx',
      '{formatEventDay(row.startsOn)} · {siteTitle(row.site)}'
    );
    // EN DASH between the halves of a team score, not a hyphen.
    drawn(drawer, 'event-drawer.tsx', '{row.teamScore.us}–{row.teamScore.them}');
  });

  test("7d's prompt pane", () => {
    drawn(schedule, 'static-schedule.tsx', 'Select an event');
    drawn(
      schedule,
      'static-schedule.tsx',
      "Pick a dual or tournament on the left to see its lineup, every line's result and the report behind each one."
    );
    drawn(schedule, 'static-schedule.tsx', 'Season');
    drawn(schedule, 'static-schedule.tsx', 'Jump to');
    drawn(schedule, 'static-schedule.tsx', 'Next');
    drawn(schedule, 'static-schedule.tsx', 'Last');
    // A literal the rows cannot produce — the fixture calendar is September
    // 2025 and today is not four days before it.
    drawn(schedule, 'static-schedule.tsx', 'in 4 days');
    drawn(schedule, 'static-schedule.tsx', ' · lineup not set');
    // The design's own claim, and not derivable from the nine lines beside it.
    drawn(schedule, 'static-schedule.tsx', '· 8 of 9 lines analyzed');
  });

  test("7e's day-zero pane", () => {
    drawn(schedule, 'static-schedule.tsx', 'No events yet');
    drawn(
      schedule,
      'static-schedule.tsx',
      'Create a dual and the lineup card builds itself — every slot becomes a real match the moment you set the line.'
    );
    drawn(schedule, 'static-schedule.tsx', 'New dual');
    drawn(schedule, 'static-schedule.tsx', 'New tournament');
    drawn(schedule, 'static-schedule.tsx', 'One-off match in Matches');
    drawn(schedule, 'static-schedule.tsx', 'What a dual creates');
    drawn(schedule, 'static-schedule.tsx', '9 lines · none set');
    drawn(schedule, 'static-schedule.tsx', 'Singles');
    drawn(schedule, 'static-schedule.tsx', 'Doubles');
    drawn(
      schedule,
      'static-schedule.tsx',
      'Opponent, format and lets are typed once and inherit down every line.'
    );
    drawn(
      schedule,
      'static-schedule.tsx',
      'The team score adds itself up as lines resolve.'
    );
    // The separator between the three empty-state links.
    drawn(schedule, 'static-schedule.tsx', '·');
  });

  test("4c's nine lines, and the 5–2 they add up to", () => {
    const fairmont = EVENT_DETAILS[SCHEDULE_ROWS[1].id];
    expect(fairmont, '4c has no detail to draw').toBeTruthy();

    expect(fairmont.event.name).toBe('Fairmont A&M');
    // The pane's eyebrow: "Sat 20 Sep · Away · hard".
    expect(formatEventDay(fairmont.event.startsOn)).toBe('Sat 20 Sep');
    expect(siteTitle(fairmont.event.site)).toBe('Away');
    expect(fairmont.event.surface).toBe('hard');

    expect(fairmont.entries.map((entry) => entry.slot)).toEqual([
      'S1',
      'S2',
      'S3',
      'S4',
      'S5',
      'S6',
      'D1',
      'D2',
      'D3',
    ]);
    expect(fairmont.entries.map((entry) => entry.playerLabels.join(' / '))).toEqual(
      [
        'D. Brooks',
        'M. Reid',
        'R. Osei',
        'L. Moreau',
        'S. Tanaka',
        'K. Sato',
        // A pair is one entry; " / " is the design's separator.
        'Brooks / Osei',
        'Reid / Tanaka',
        'Moreau / Sato',
      ]
    );
    expect(
      fairmont.entries.map((entry) => entry.opponentLabels.join(' / '))
    ).toEqual([
      'A. Castillo',
      'J. Park',
      'T. Nguyen',
      'D. Ferro',
      'R. Alvarez',
      'J. Abara',
      'Castillo / Ferro',
      'Park / Alvarez',
      'Ferro / Nguyen',
    ]);

    // S2 is `4c`'s `6-7³`: the tiebreak digit rides against whoever LOST the
    // set, which on this line is us. Put it on the other side and the row
    // renders a score nobody played, with nothing looking broken.
    const s2 = fairmont.entries[1].matches[0];
    expect(s2.score).toEqual({
      player1: [4, 6],
      player2: [6, 7],
      player1_tiebreaks: [null, 3],
      player2_tiebreaks: [null, null],
    });

    // The header score `7c` and `4c` both draw.
    const score = dualScore(fairmont.entries);
    expect(score.us).toBe(5);
    expect(score.them).toBe(2);
  });

  test("the dual widget's own words", () => {
    drawn(widget, 'dual-widget.tsx', 'Singles');
    drawn(widget, 'dual-widget.tsx', 'Doubles');
    drawn(widget, 'dual-widget.tsx', 'View report');
    // The three doubles rows. The vendor rejects doubles outright, so this
    // promises something no roadmap carries — drawn, so reproduced.
    drawn(widget, 'dual-widget.tsx', 'Coming soon');
    // EN DASH in the header score.
    drawn(widget, 'dual-widget.tsx', '{score.us}–{score.them}');
    // " / " between a pair's two names, and "vs" before theirs.
    drawn(widget, 'dual-widget.tsx', '{entry.playerLabels.join(" / ")}');
    drawn(widget, 'dual-widget.tsx', 'vs {entry.opponentLabels.join(" / ")}');
    // The footer line, whose counts are computed and whose separators are not.
    drawn(widget, 'dual-widget.tsx', ' matches · ');
    drawn(widget, 'dual-widget.tsx', ' singles, ');
    // S2's chip. The artboard draws the DS component with `status="analyzing"`
    // and no text of its own, so the word itself is `LINE_STATUS`'s.
    expect(LINE_STATUS.working?.label).toBe('Analyzing');
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

test.describe('/dashboard/team/schedule/new · 3b', () => {
  const chooser = screen('static-event-chooser.tsx');
  const file = 'static-event-chooser.tsx';

  test("the two cards, and what each says it creates", () => {
    drawn(chooser, file, 'What are you adding?');
    drawn(
      chooser,
      file,
      'Both are events the team shows up to — they hold a date, a site and the matches played under them.'
    );

    drawn(chooser, file, 'Dual match');
    drawn(
      chooser,
      file,
      'Six singles and three doubles against one opponent, shared under one event.'
    );
    // Quoted so the trailing and leading spaces around the tabular `9` are
    // pinned too — "Creates 9 lines · one team score" is one drawn sentence.
    drawn(chooser, file, '"Creates "');
    drawn(chooser, file, '" lines · one team score"');

    drawn(chooser, file, 'Tournament');
    drawn(
      chooser,
      file,
      "Players entered into draws; matches get added by round as they're played."
    );
    drawn(chooser, file, 'Creates entries · draws by round');
  });

  test('the aside and the footer', () => {
    // Two em dashes and two straight apostrophes in one sentence.
    drawn(
      chooser,
      file,
      "One player's own match — a challenge, practice set or outside entry — isn't an event."
    );
    drawn(chooser, file, 'Add it in Matches');
    drawn(chooser, file, 'Cancel');
    drawn(chooser, file, 'Continue');
    // The footer names the selection; `3b` opens on the dual.
    drawn(chooser, file, 'Dual selected');
    drawn(chooser, file, 'Tournament selected');
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

test.describe('/dashboard/team/schedule/new/dual · 2c 2b 2d 2e', () => {
  const step1 = screen('dual-school-step.tsx');
  const step2 = screen('dual-build-step.tsx');
  const popup = screen('opponent-popup.tsx');

  test("2c's directory, as the artboard states it", () => {
    // Held, not retired: every expectation below reads `fixtures.ts`, which
    // this run has not touched, so each is still true of the module it names.
    // What changed is the audience — step one now lists real programs and
    // counts the real directory, so these describe the design record rather
    // than the live screen. T26 owns that demotion.
    expect(DIRECTORY_TERM).toBe('Ridg');
    // "5 of 1,940". A formatted string rather than a number, so the comma is
    // the design's and not the render locale's.
    expect(DIRECTORY_TOTAL).toBe('1,940');
    expect(OUR_CONFERENCE).toBe('Big Ten');
    expect(OUR_DIVISION).toBe('D-I');

    expect(CONFERENCE_SCHOOLS.map((s) => s.program.schoolName)).toEqual([
      'Ridgeline University',
      'Ridgemont Tech',
    ]);
    expect(ALL_PROGRAM_SCHOOLS.map((s) => s.program.schoolName)).toEqual([
      'Ridgeway College',
      'Ridge Valley State',
      'Ridgefield Academy',
    ]);

    // The opponent's OWN season record — a figure this app holds nowhere, so
    // it is a literal and drifts silently if it changes. En dash on all five.
    expect(CONFERENCE_SCHOOLS.map((s) => s.seasonRecord)).toEqual([
      '18–4',
      '11–10',
    ]);
    expect(ALL_PROGRAM_SCHOOLS.map((s) => s.seasonRecord)).toEqual([
      '14–7',
      '9–12',
      '16–5',
    ]);

    // The mono cell is month and day, no year — "04-12", not "12 Apr".
    expect(CONFERENCE_SCHOOLS[1].history.lastPlayedOn?.slice(5)).toBe('04-12');
    expect(ALL_PROGRAM_SCHOOLS[0].history.lastPlayedOn?.slice(5)).toBe('09-30');
  });

  test('the subline vocabulary the rows are built from', () => {
    // "Men's" opens every subline on `2c` and `2b` — STRAIGHT apostrophe.
    expect(teamLabel('mens')).toBe("Men's");
    // Four rows print a conference; the fifth prints a division.
    expect(divisionLabel('D1')).toBe('D-I');
    expect(divisionLabel('D3')).toBe('D-III');

    // The four head-to-head phrases the two artboards draw, each read off the
    // fixture row that draws it. En dash between the figures throughout.
    //
    // Held, not retired, on the four `RAIL_SCHOOLS` rows below: they read
    // `fixtures.ts`, which this run has not touched, so each is still true of
    // the module it names. What changed is the audience — `2b`'s rail now
    // lists the real conference and this program's real record, so these
    // describe the design record rather than the live screen. T26 owns that
    // demotion.
    expect(formatOpponentRecord(CONFERENCE_SCHOOLS[0].history)).toBe(
      'never played'
    );
    expect(formatOpponentRecord(CONFERENCE_SCHOOLS[1].history)).toBe(
      'you lead 2–1'
    );
    expect(formatOpponentRecord(ALL_PROGRAM_SCHOOLS[0].history)).toBe(
      'you lead 1–0'
    );
    expect(formatOpponentRecord(RAIL_SCHOOLS[1].history)).toBe('you lead 3–1');
    expect(formatOpponentRecord(RAIL_SCHOOLS[2].history)).toBe('split 1–1');
    expect(formatOpponentRecord(RAIL_SCHOOLS[3].history)).toBe('you lead 5–2');
    expect(formatOpponentRecord(RAIL_SCHOOLS[5].history)).toBe('you lead 2–0');
  });

  test("2c's own words", () => {
    drawn(step1, 'dual-school-step.tsx', 'New dual · step 1 of 2');
    drawn(step1, 'dual-school-step.tsx', 'Which school are you playing?');
    // RETIRED 'Region' — the pill is gone from the screen, not renamed. Nothing
    //   in `programs` backs a region and no mapping invents one, so the wired
    //   step drops the control rather than drawing a filter that cannot filter.
    //   The two pills beside it — conference and division — are now real.
    drawn(step1, 'dual-school-step.tsx', 'Clear');
    drawn(step1, 'dual-school-step.tsx', 'Your conference');
    drawn(step1, 'dual-school-step.tsx', 'All programs');
    // STRAIGHT double quotes around the term, as the artboard writes them.
    drawn(step1, 'dual-school-step.tsx', 'Add "');
    drawn(
      step1,
      'dual-school-step.tsx',
      '" as an unlisted school or club side'
    );
    drawn(
      step1,
      'dual-school-step.tsx',
      'No program record — their lineup gets typed by hand.'
    );
    // U+21B5, the return glyph at the end of the free-text row.
    drawn(step1, 'dual-school-step.tsx', '↵');
    // The em dash a row with no last-played date falls back to.
    drawn(step1, 'dual-school-step.tsx', '"—"');
    drawn(
      step1,
      'dual-school-step.tsx',
      '· date, site and lineup come next'
    );
    drawn(step1, 'dual-school-step.tsx', 'Cancel');
    drawn(step1, 'dual-school-step.tsx', 'Continue');
  });

  test("2b's draft, as the fields print it", () => {
    // Held, not retired: every expectation below reads `fixtures.ts`, which
    // this run has not touched, so each is still true of the module it names.
    // What changed is the audience — step two's date, site, surface and format
    // are controlled inputs, its rail lists the real conference, the school is
    // whichever step one chose, and the nine lines are now seeded from
    // `getLadder` and edited in place, so `DUAL_DRAFT_EVENT`, `RAIL_SCHOOLS`
    // and `DUAL_DRAFT_LINES` alike describe the design record rather than the
    // live screen. No `DUAL_DRAFT_*` export has a consumer under `src/` any
    // more; this spec is their only reader, which is the demotion T26 owns.
    //
    // "09-26", month and day, the same slice `2c`'s last-played cell takes.
    expect(DUAL_DRAFT_EVENT.startsOn.slice(5)).toBe('09-26');
    expect(siteTitle(DUAL_DRAFT_EVENT.site)).toBe('Home');
    // The dataset's own lowercase; `2b` title-cases it in the field cell.
    expect(DUAL_DRAFT_EVENT.surface).toBe('hard');
    // Best of 3, no-ad — explicit, never a default standing in for a null.
    expect(DUAL_DRAFT_EVENT.format).toEqual({ bestOf: 3, adScoring: false });

    expect(RAIL_SCHOOLS.map((s) => s.program.schoolName)).toEqual([
      'Ridgeline University',
      'Fairmont A&M',
      'Crestwood College',
      'Northlake State',
      'Ashford University',
      'Merritt College',
    ]);
    expect(RAIL_SCHOOLS.map((s) => s.seasonRecord)).toEqual([
      '18–4',
      '15–7',
      '12–9',
      '9–12',
      '14–6',
      '7–14',
    ]);

    expect(DUAL_DRAFT_LINES.map((line) => line.slot)).toEqual([
      'S1',
      'S2',
      'S3',
      'S4',
      'S5',
      'S6',
      'D1',
      'D2',
      'D3',
    ]);
    expect(DUAL_DRAFT_LINES.map((line) => line.ourLabels.join(' / '))).toEqual([
      'Dana Brooks',
      'Marcus Reid',
      'Rafael Osei',
      'Sam Tanaka',
      'Jules Moreau',
      // The forfeited line names nobody on either side.
      '',
      'Brooks / Reid',
      'Osei / Tanaka',
      'Moreau / Adeyemi',
    ]);
    expect(DUAL_DRAFT_LINES[5].forfeit).toBe('ours');
  });

  test("2b's own words", () => {
    drawn(step2, 'dual-build-step.tsx', 'Opponent');
    drawn(step2, 'dual-build-step.tsx', '· type to search all');
    drawn(step2, 'dual-build-step.tsx', 'Dual');
    drawn(step2, 'dual-build-step.tsx', 'Date');
    drawn(step2, 'dual-build-step.tsx', 'Site');
    drawn(step2, 'dual-build-step.tsx', 'Surface');
    drawn(step2, 'dual-build-step.tsx', 'Format');
    // "Best of 3 sets" over "No-ad scoring" — the sets half in the cell, the
    // scoring half under the underline.
    drawn(step2, 'dual-build-step.tsx', 'Best of ');
    drawn(step2, 'dual-build-step.tsx', ' sets');
    drawn(step2, 'dual-build-step.tsx', '"No-ad scoring"');
    drawn(step2, 'dual-build-step.tsx', '"Ad scoring"');

    drawn(step2, 'dual-build-step.tsx', 'Lineup · singles');
    drawn(step2, 'dual-build-step.tsx', 'six required · from your ladder');
    drawn(step2, 'dual-build-step.tsx', 'Lineup · doubles');
    drawn(
      step2,
      'dual-build-step.tsx',
      'three required · pairs carried from singles'
    );
    drawn(step2, 'dual-build-step.tsx', 'Add name');
    drawn(step2, 'dual-build-step.tsx', 'Add pair');
    // The one string a forfeited builder line prints. Em dash, then the words.
    drawn(step2, 'dual-build-step.tsx', '— no available player');
    drawn(step2, 'dual-build-step.tsx', 'Forfeited');
    drawn(step2, 'dual-build-step.tsx', 'Forfeit');
    drawn(
      step2,
      'dual-build-step.tsx',
      "All nine lines are expected — forfeit a line only when a team can't field a player for it."
    );
    drawn(step2, 'dual-build-step.tsx', 'Creates ');
    drawn(step2, 'dual-build-step.tsx', '"line" : "lines"');
    drawn(step2, 'dual-build-step.tsx', ' vs ');
    drawn(step2, 'dual-build-step.tsx', 'Create dual');
    drawn(step2, 'dual-build-step.tsx', 'Cancel');
  });

  test('2d and 2e — the add-opponent popup', () => {
    // What `2d` has typed, and the saved name it surfaces under it.
    expect(DUAL_DRAFT_TYPED_NAME).toBe('Alexis Cast');
    expect(DUAL_DRAFT_SAVED_ROSTER).toEqual([
      {
        playerId: 'fixture-opponent-player-alexis-castellano',
        name: 'Alexis Castellano',
        lineupSpot: 2,
        priorMeetings: 2,
      },
    ]);
    // The short form `2d` writes twice, where `2e`'s toast writes the school
    // in full. The design's own inconsistency — still recorded here, but no
    // longer rendered: the wired popup reads one `OpponentPool.schoolName` in
    // both places, because `programs` holds no short form and the rule that
    // would derive one ("Fairmont" for "Fairmont A&M") is wrong for most rows.
    // Held rather than retired: it is still true of `fixtures.ts`.
    expect(DUAL_DRAFT_OPPONENT_SHORT).toBe('Ridgeline');

    drawn(
      popup,
      'opponent-popup.tsx',
      'already has a close name saved. Pick one.'
    );
    drawn(popup, 'opponent-popup.tsx', 'Saved · ${school} #${candidate.lineupSpot}');
    drawn(popup, 'opponent-popup.tsx', '"1 prior meeting"');
    drawn(popup, 'opponent-popup.tsx', 'prior meetings');
    drawn(popup, 'opponent-popup.tsx', 'Save as a different player');
    // `2e`'s toast, in full — "Saved to Ridgeline University roster".
    drawn(popup, 'opponent-popup.tsx', 'Saved to ${schoolName} roster');
    // The field's placeholders, singles and doubles.
    drawn(popup, 'opponent-popup.tsx', '"Name / Name"');
    drawn(popup, 'opponent-popup.tsx', '"Name"');
    // The highlighted card carries the return glyph.
    drawn(popup, 'opponent-popup.tsx', '↵');
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

test.describe('/dashboard/team/schedule/new/tournament · 3c', () => {
  const builder = screen('static-tournament-builder.tsx');
  const file = 'static-tournament-builder.tsx';

  test("3c's roster rail and the field it feeds", () => {
    expect(TOURNAMENT_FIELD.map((row) => row.player.name)).toEqual([
      'Dana Brooks',
      'Marcus Reid',
      'Rafael Osei',
      'Sam Tanaka',
      'Jules Moreau',
      'Lena Adeyemi',
    ]);
    // S1…S6, in the order the artboard draws them.
    expect(TOURNAMENT_FIELD.map((row) => row.player.ladderPosition)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    // The three checked rows, and the three drawn with a `+`.
    expect(TOURNAMENT_FIELD.map((row) => row.entry?.draw ?? null)).toEqual([
      'Main draw',
      'Main draw',
      'Qualifying',
      null,
      null,
      null,
    ]);
    expect(TOURNAMENT_FIELD.map((row) => row.entry?.seed ?? null)).toEqual([
      3,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  test("3c's own words", () => {
    drawn(builder, file, 'Roster');
    drawn(builder, file, 'Add a player to the field');
    // The four shapes the rail's state line takes.
    drawn(builder, file, '${spot} · qualifying');
    drawn(builder, file, '${spot} · entered · seed ${entry.seed}');
    drawn(builder, file, '${spot} · entered');

    drawn(builder, file, 'Tournament · name');
    // Still drawn, as the name field's placeholder now rather than as text: a
    // new tournament opens unnamed, and this is the string the empty cell shows.
    drawn(builder, file, 'Buckeye Fall Classic');
    drawn(builder, file, 'Starts');
    drawn(builder, file, 'Ends');
    // RETIRED '10-03' — the Starts cell is an `<input type="date">` bound to the
    //   draft now, so `3c`'s drawn sample date is no longer a literal in this
    //   file. A date input has no placeholder to keep it in.
    // RETIRED '10-05' — the same, on the Ends cell.
    // Not moved onto `TOURNAMENT_DETAIL`, which still carries the design's
    //   '2025-10-03'/'2025-10-05': nothing renders that fixture, so an
    //   assertion over it could not fail for anything this screen does.
    drawn(builder, file, 'Neutral');
    // "Bo3 · ad" — best of 3, AD scoring, which is the opposite of the dual's.
    drawn(builder, file, 'Bo3 · ad');

    // A claim nothing in this app can compute: no table records which programs
    // attend a tournament. Drawn because the artboard draws it.
    drawn(
      builder,
      file,
      '3 Big Ten programs are in this field — matches against them count toward conference seeding.'
    );

    drawn(builder, file, 'Entries · singles');
    drawn(builder, file, 'added from the roster');
    drawn(builder, file, '"Main draw"');
    drawn(builder, file, '"Qualifying"');
    drawn(builder, file, '"Unseeded"');
    drawn(builder, file, 'Seed ${entry.seed}');
    // A qualifier holds no seed, and `3c` draws an em dash rather than a word.
    drawn(builder, file, '"—"');
    drawn(
      builder,
      file,
      "An entry is a player in a draw — where they start, not what they'll play."
    );
    drawn(builder, file, 'Creates ');
    drawn(builder, file, '"entry" : "entries"');
    drawn(
      builder,
      file,
      "and no matches — a match exists once it's played"
    );
    drawn(builder, file, 'Create tournament');
    drawn(builder, file, 'Cancel');
  });
});
