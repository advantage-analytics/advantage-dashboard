import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The opponent menu on the upload wizard's Details step
 * (`/dashboard/matches/new`, `DetailsStepContent.tsx`) — T3 of the practice
 * sessions queue: rows truncate the name instead of growing the menu, and the
 * menu is 360px in every branch.
 */

const WIZARD = "src/components/dashboard/matches/new-match-wizard";
const read = (file: string) =>
  readFileSync(resolve(process.cwd(), file), "utf8");

const mod = createLoader().load(`${WIZARD}/OpponentMenuRow.tsx`) as {
  OpponentMenuRow: React.ComponentType<Record<string, unknown>>;
  OpponentNewRow: React.ComponentType<Record<string, unknown>>;
  OPPONENT_MENU_WIDTH_CLS: string;
};

const longName = "A".repeat(60);

function classOf(html: string, marker: string) {
  const m = new RegExp(`<span[^>]*${marker}=""[^>]*>`).exec(html);
  expect(m, `${marker} element`).not.toBeNull();
  return /class="([^"]*)"/.exec(m![0])![1].split(/\s+/);
}

test("a 60-character name truncates and the meta never wraps", () => {
  const html = renderToStaticMarkup(
    React.createElement(mod.OpponentMenuRow, {
      name: longName,
      meta: "12 matches · Last Oct 3",
      onPick: () => {},
    }),
  );
  expect(html).toContain(longName);
  const name = classOf(html, "data-opponent-name");
  expect(name).toEqual(expect.arrayContaining(["min-w-0", "truncate"]));
  const meta = classOf(html, "data-opponent-meta");
  expect(meta).toEqual(
    expect.arrayContaining(["whitespace-nowrap", "shrink-0"]),
  );
  // The name sits in a min-w-0 flex parent, on a 38px row.
  expect(html).toMatch(
    /class="[^"]*\bflex\b[^"]*\bmin-w-0\b[^"]*"><span data-opponent-name/,
  );
  expect(html).toContain("h-[38px]");
});

test("the New opponent row's trailing hint does not wrap", () => {
  const html = renderToStaticMarkup(
    React.createElement(mod.OpponentNewRow, {
      label: "New opponent",
      hint: "only you see this name",
      onPick: () => {},
    }),
  );
  expect(html).toMatch(
    /class="[^"]*shrink-0[^"]*whitespace-nowrap[^"]*">only you see this name/,
  );
});

test("the menu is 360px in every branch and 320px is gone", () => {
  expect(mod.OPPONENT_MENU_WIDTH_CLS).toBe("w-[360px]");
  const src = read(`${WIZARD}/DetailsStepContent.tsx`);
  expect(src).toContain("floatMenuCls, OPPONENT_MENU_WIDTH_CLS");
  expect(src).not.toContain("w-[320px]");
  expect(src).not.toMatch(/inDual \? "w-\[/);
});
