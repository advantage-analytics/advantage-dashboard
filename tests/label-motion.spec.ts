import { readdirSync, readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { tag } from "./fixtures/html-probe";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
  editContext,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/** The console's motion: the well unfolds when opened, nothing moves on page load, and the budget. */

const LABELS = "src/components/admin/labels";
const css = readFileSync("src/app/globals.css", "utf8");
const source = (file: string) => readFileSync(`${LABELS}/${file}`, "utf8");

function renderWell(): string {
  const { BlackShotsWell } = createLoader().load(
    `${LABELS}/label-black-shot-row.tsx`,
  ) as { BlackShotsWell: React.ComponentType<Record<string, unknown>> };
  return renderToStaticMarkup(
    React.createElement(BlackShotsWell, {
      point: labelSessionFixture().points[0],
      edit: editContext(),
    }),
  );
}

function renderConsole(props: Record<string, unknown> = {}): string {
  const { LabelConsole } = createLoader().load(
    `${LABELS}/label-console.tsx`,
  ) as { LabelConsole: React.ComponentType<Record<string, unknown>> };
  return renderToStaticMarkup(
    React.createElement(LabelConsole, {
      session: labelSessionFixture(),
      video: null,
      initialExpandedPointId: FIXTURE_POINT_IDS.P1,
      onSaveShot: async () => ({ ok: true, status: "edited" }),
      onSavePoint: async () => ({ ok: true, status: "edited" }),
      ...props,
    }),
  );
}

test.describe("the shots well opens as the Video tab's does", () => {
  test("the outer grid carries the unfold", () => {
    const html = renderWell();
    const outer = tag(html, "data-shots-well");
    expect(outer).toContain('class="film-shot-well-open"');
  });

  test("the console's first render animates nothing: the open point's well is simply there", () => {
    for (const initialLayoutMode of ["docked-side", "black"] as const) {
      const html = renderConsole({ initialLayoutMode });
      expect(html).toContain(`data-shots-for="${FIXTURE_POINT_IDS.P1}"`);
      for (const cls of [
        "film-shot-well-open",
        "film-shot-row-in",
        "label-row-arrive",
        "label-court-view-in",
        "label-layer-in-full",
        "label-layer-in-docked",
        "data-just-checked",
        "data-well-settled",
        "film-follow-pill-in",
      ]) {
        expect(html, `${initialLayoutMode}: ${cls}`).not.toContain(cls);
      }
    }
  });
});

test("budget: no layout property transitions, no will-change, no animation library", () => {
  for (const file of readdirSync(LABELS)) {
    const text = source(file);
    expect(text, file).not.toMatch(/will-change|willChange/);
    expect(text, file).not.toMatch(/from "(framer-motion|motion\/react)"/);
    expect(text, file).not.toMatch(
      /transition-\[[^\]]*(width|height|margin|padding|top|left)[^\]]*\]/,
    );
  }
  // The console's block of globals.css adds no colour of its own.
  const block = css.slice(
    css.indexOf("/* ── The labelling console"),
    css.indexOf(
      "@media (prefers-reduced-motion: reduce) {\n  .label-court-view-in",
    ),
  );
  expect(block.length).toBeGreaterThan(1000);
  expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  expect(block).not.toContain("will-change");
});
