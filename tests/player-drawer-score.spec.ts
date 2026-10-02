import { expect, test } from "@playwright/test";

import { RECENT_MATCH_GRID } from "@/components/dashboard/team/player-drawer-layout";

import {
  GAME_SEPARATOR,
  SET_JOINER,
  playedSets,
  scoreSetsFrom,
  tiebreakOf,
  type ScoreLineSet,
} from "@/lib/ui/score-format";

/**
 * The roster drawer's recent-match row — `player-drawer.tsx`, reached from
 * `/dashboard/team/roster` via `roster-view.tsx`.
 *
 * Two independent defects made that row read `6-4 0-0 0-0`, clipped: the score
 * carried trailing zero sets that `matches.score` genuinely stores, and the row
 * gave it a fixed `72px` track under `overflow-hidden`, so anything wider
 * vanished with no ellipsis. Both are MEASURED here rather than asserted from
 * the source — `scrollWidth` against `clientWidth` in a real layout is the only
 * honest way to ask "did it fit", which is why this spec opens a browser when
 * the rest of `tests/` does not.
 *
 * ── What is reproduced, and why ─────────────────────────────────────────────
 * `player-drawer.tsx` is a Next client component pulling in navigation and
 * motion, and `@playwright/test` rewrites JSX in everything it transpiles into
 * its own component-test elements — so neither the row nor `<ScoreLine>` can be
 * server-rendered from here. The row's grid template and the score cell's
 * classes below are therefore copied VERBATIM from the row, and the score text
 * is built from the same `score-format` primitives `<ScoreLine>` itself uses.
 * If the row's template changes, change it here too.
 */

/**
 * The row's real track, imported from the component rather than restated.
 *
 * This was a hand-copied string, which made the test structurally unable to
 * catch its own regression: reverting the component to a fixed `72px` left
 * this spec green. Verified — do not inline it again.
 *
 * `RECENT_MATCH_GRID` is the Tailwind class (`grid-cols-[...]`); the browser
 * harness needs the raw CSS value, so the bracket contents are unwrapped and
 * Tailwind's underscore-for-space encoding undone.
 */
const GRID_TEMPLATE = RECENT_MATCH_GRID.replace(
  /^grid-cols-\[(.*)\]$/,
  "$1",
).replace(/_/g, " ");

/** A production shape: a two-setter stored with a phantom trailing set. */
const TRAILING_ZERO_SET = { player1: [6, 6, 0], player2: [4, 3, 0] };

/** A genuine three-setter, every set a tiebreak — the widest the column holds. */
const THREE_SETTER = {
  player1: [7, 6, 7],
  player2: [6, 7, 6],
  player1_tiebreaks: [7, 5, 7],
  player2_tiebreaks: [5, 7, 4],
};

/** `<ScoreLine>`'s markup, rebuilt from the same primitives it composes. */
function scoreHtml(sets: ScoreLineSet[]): string {
  return sets
    .map((set) => {
      const tiebreak = tiebreakOf(set);
      const games = `${set.player1}${GAME_SEPARATOR}${set.player2}`;
      return tiebreak === null
        ? games
        : `${games}<span style="font-size:0.6em;vertical-align:1.05em;margin-left:0.5px;line-height:0">${tiebreak}</span>`;
    })
    .join(SET_JOINER);
}

function rowHtml(score: Parameters<typeof scoreSetsFrom>[0]): string {
  return `
    <style>
      body { margin: 0; font-family: Inter, system-ui, sans-serif; }
      /* The drawer is a fixed 340px rail; the row sits inside its 20px padding. */
      .rail { width: 340px; padding: 0 20px; }
      .row {
        display: grid;
        grid-template-columns: ${GRID_TEMPLATE};
        align-items: center;
        gap: 10px;
        height: 36px;
        padding: 0 8px;
        margin: 0 -8px;
      }
      .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .score { font-variant-numeric: tabular-nums; font-size: 11px; text-align: right; white-space: nowrap; }
      .opponent { font-size: 12px; }
      .date { font-size: 10px; }
    </style>
    <div class="rail"><div class="row">
      <span>W</span>
      <span class="truncate opponent" id="opponent">A. Very-Long-Opponent-Name · Fall Invitational Championships</span>
      <span class="score" id="score">${scoreHtml(playedSets(scoreSetsFrom(score)))}</span>
      <span class="date">Sep 3</span>
      <span>&rsaquo;</span>
    </div></div>`;
}

test("a stored trailing 0-0 set never reaches the drawer row", async ({
  page,
}) => {
  await page.setContent(rowHtml(TRAILING_ZERO_SET));
  const text = await page.locator("#score").innerText();
  expect(text).toContain(`6${GAME_SEPARATOR}4`);
  expect(text).toContain(`6${GAME_SEPARATOR}3`);
  expect(text).not.toContain(`0${GAME_SEPARATOR}0`);
});

test("a three-set score is not clipped by the score track", async ({
  page,
}) => {
  await page.setContent(rowHtml(THREE_SETTER));
  const score = await page.locator("#score").evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(score.scrollWidth).toBeLessThanOrEqual(score.clientWidth);

  // The width has to come from somewhere: the opponent/event cell absorbs it
  // and truncates, which is the trade this row's grid deliberately makes.
  const opponent = await page.locator("#opponent").evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(opponent.scrollWidth).toBeGreaterThan(opponent.clientWidth);
});
