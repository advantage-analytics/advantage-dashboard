import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The Edit match dialog's loading state (`loading/edit-match-pending.tsx`).
 * Offline: rendered to static markup and read as text — what is asserted is
 * the Carbon/DS contract and the form's own rows, not pixels.
 *
 *   - one `role="status"`, labelled "Loading match"
 *   - every skeleton bar is hidden and pulses motion-safe
 *   - nothing interactive, no hex colour, no spinner
 *   - one bar row per `EDIT_MATCH_FIELD_ROWS` entry, and that list is the
 *     form's: each field it names is drawn by the form's sources
 */

const loader = createLoader();
const { EditMatchPending } = loader.load(
  "src/components/dashboard/loading/edit-match-pending.tsx",
) as { EditMatchPending: React.ComponentType };
const { EDIT_MATCH_FIELD_ROWS } = loader.load(
  "src/components/dashboard/matches/match-actions/edit-match-rows.ts",
) as {
  EDIT_MATCH_FIELD_ROWS: readonly { section: string; fields: string[] }[];
};

const source = (path: string) => readFileSync(resolve(path), "utf8");
const DIR = "src/components/dashboard/matches/match-actions";
const dialog = source(`${DIR}/edit-match-dialog.tsx`);
const scoreSrc = source(`${DIR}/edit-match-score.tsx`);
const playersSrc = source(`${DIR}/edit-match-players.tsx`);

const html = renderToStaticMarkup(React.createElement(EditMatchPending));
const TAG = /<(\/?)([a-zA-Z0-9]+)([^>]*?)(\/?)>/g;
const VOID = new Set(["br", "hr", "img", "input", "meta", "link"]);

test("one loading status, labelled for the match", () => {
  expect(html.match(/role="status"/g)?.length).toBe(1);
  expect(html).toContain('role="status" aria-label="Loading match"');
});

test("nothing is interactive, no colour is a hex, nothing spins", () => {
  expect(html).not.toContain("<button");
  expect(html).not.toContain("<a ");
  expect(html).not.toContain("<input");
  expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  expect(html).not.toContain("animate-spin");
});

test("every skeleton element is hidden and pulses motion-safe", () => {
  // Walk the markup as a tag stack, so "under an aria-hidden ancestor" is
  // checked structurally rather than by position in the string.
  const stack: boolean[] = [];
  let skeletons = 0;
  for (const match of html.matchAll(TAG)) {
    const [, closing, tag, attrs, selfClosing] = match;
    if (closing) {
      stack.pop();
      continue;
    }
    const hidden = /aria-hidden="true"/.test(attrs);
    const underHidden = stack.includes(true);
    if (/\sdata-pending-bar=""/.test(attrs)) {
      skeletons++;
      expect(underHidden, attrs).toBe(true);
      expect(attrs).toContain("motion-safe:animate-pulse");
    }
    if (!selfClosing && !VOID.has(tag)) stack.push(hidden);
  }
  expect(skeletons).toBeGreaterThan(8);
  expect(html).not.toMatch(/(?<!motion-safe:)\banimate-pulse\b/);
});

test("one bar row per field row the form renders", () => {
  const rows = [...html.matchAll(/data-pending-row="([^"]*)"/g)].map(
    ([, name]) => name,
  );
  expect(rows).toHaveLength(EDIT_MATCH_FIELD_ROWS.length);
  expect(rows).toEqual(EDIT_MATCH_FIELD_ROWS.map((row) => row.fields[0]));
});

test("the row list is the form's own", () => {
  const bySection = (section: string) =>
    EDIT_MATCH_FIELD_ROWS.filter((row) => row.section === section);

  // Score: one `renderRow` per side, each named by its fallback.
  const score = bySection("Score");
  expect(scoreSrc.match(/\{renderRow\(/g)?.length).toBe(score.length);
  for (const row of score) expect(scoreSrc).toContain(`|| "${row.fields[0]}"`);

  // Players: one required caption per row, then the two menus.
  const players = bySection("Players");
  const required = [...playersSrc.matchAll(/<Caption required>(\w[^<]*)</g)];
  expect(required.map(([, name]) => name)).toEqual(
    players.map((row) => row.fields[0]),
  );
  expect(playersSrc.match(/\{selects\(/g)?.length).toBe(players.length);
  for (const row of players)
    expect(row.fields.slice(1)).toEqual(["Hand", "Backhand"]);
  expect(playersSrc).toContain("<Caption>Hand</Caption>");
  expect(playersSrc).toContain("<Caption>Backhand</Caption>");

  // Details: Event, then the two-column grid's unconditional fields.
  const [event, ...grid] = bySection("Details");
  expect(event.fields).toEqual(["Event"]);
  expect(dialog).toContain('aria-label="Event"');
  expect(dialog).toContain(
    '<div className="grid grid-cols-2 gap-x-4 gap-y-3.5">',
  );
  for (const row of grid) {
    expect(row.fields.length).toBeLessThanOrEqual(2);
    for (const field of row.fields) expect(dialog).toContain(`"${field}"`);
  }
  // Date, Match type, Court surface: three cells, two rows of two.
  expect(grid.flatMap((row) => row.fields)).toEqual([
    "Date",
    "Match type",
    "Court surface",
  ]);
});

test("the dialog draws EditMatchPending while the match is read", () => {
  expect(dialog).toMatch(/: !match \? \(\s*<EditMatchPending \/>\s*\) :/);
  expect(dialog).not.toContain("Reading the match");
  // The Save button's inline spinner stays: it is an action, not a load.
  expect(dialog).toMatch(/\{saving && \(\s*<Loader2/);
});
