import { readdirSync, readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  FILM_ROW_ACTION_HELD,
  FILM_ROW_ACTION_ON_REACH,
  FILM_ROW_ACTION_TRANSITION,
  FILM_ROW_SLIDE_HELD,
  FILM_ROW_SLIDE_ON_REACH,
  FILM_ROW_SLIDE_TRANSITION,
} from "@/components/dashboard/matches/match-detail/film/film-row-reveal";
import { shotRowRevealDelay } from "@/components/dashboard/matches/match-detail/film/film-shots";
import type { LabelPoint, LabelShot } from "@/lib/services/labels/session";
import { tag } from "./fixtures/html-probe";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
  editContext,
  labelShot,
} from "./fixtures/label-session";
import { findByProp } from "./fixtures/react-tree";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The labelling console's motion (`/admin/labels/[sessionId]`): what moves,
 * on which element, and — as much as the rest — what does not: nothing on
 * page load, nothing on a tick of the film's clock, nothing a reduced-motion
 * labeller did not ask to keep.
 */

const LABELS = "src/components/admin/labels";
const css = readFileSync("src/app/globals.css", "utf8");
const source = (file: string) => readFileSync(`${LABELS}/${file}`, "utf8");

/** Every opening tag carrying `attr`, in order. */
function tags(html: string, attr: string): string[] {
  return [...html.matchAll(/<[^>]+>/g)]
    .map((m) => m[0])
    .filter((t) => t.includes(attr));
}

const shot = (id: string, fields: Partial<LabelShot> = {}) =>
  labelShot(id, "p-motion", { stroke: "forehand", videoTime: 10, ...fields });

/** A rally of `n` live strokes with a tombstone second. */
function rally(n: number): LabelPoint {
  const base = labelSessionFixture().points[0];
  const shots = Array.from({ length: n }, (_, i) =>
    shot(`m-${i + 1}`, { videoTime: 10 + i }),
  );
  shots.splice(1, 0, shot("m-gone", { status: "deleted", videoTime: 10.5 }));
  return { ...base, id: "p-motion", shots };
}

function renderWell(props: Record<string, unknown> = {}, strokes = 11): string {
  const { BlackShotsWell } = createLoader().load(
    `${LABELS}/label-black-shot-row.tsx`,
  ) as { BlackShotsWell: React.ComponentType<Record<string, unknown>> };
  return renderToStaticMarkup(
    React.createElement(BlackShotsWell, {
      point: rally(strokes),
      edit: editContext(),
      ...props,
    }),
  );
}

function renderRow(props: Record<string, unknown> = {}): string {
  const { BlackPointRow } = createLoader().load(
    `${LABELS}/label-black-point-row.tsx`,
  ) as { BlackPointRow: React.ComponentType<Record<string, unknown>> };
  const edit = editContext();
  const point = edit.points.find((p) => p.id === FIXTURE_POINT_IDS.P1)!;
  return renderToStaticMarkup(
    React.createElement(BlackPointRow, {
      point,
      open: false,
      playing: false,
      score: "0–0",
      edit,
      ...props,
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

// ── The focal moment: a point unfolding ─────────────────────────────────────

test.describe("the shots well opens as the Video tab's does", () => {
  test("the outer grid carries the unfold", () => {
    const html = renderWell();
    const outer = tag(html, "data-shots-well");
    expect(outer).toContain('class="film-shot-well-open"');
  });

  test("every row arrives on film-shot-row-in, 25ms apart, capped at eight steps", () => {
    const html = renderWell();
    // 11 strokes, a tombstone and Add shot: 13 rows.
    const rows = tags(html, "film-shot-row-in");
    expect(rows).toHaveLength(13);
    const delays = rows.map((row) =>
      Number(/animation-delay:(\d+)ms/.exec(row)?.[1]),
    );
    expect(delays).toEqual([
      0, 25, 50, 75, 100, 125, 150, 175, 200, 200, 200, 200, 200,
    ]);
    // The Video tab's own function, not a copy of its arithmetic.
    expect(delays).toEqual(delays.map((_, i) => shotRowRevealDelay(i + 1)));
    expect(Math.max(...delays)).toBe(8 * 25);
    // Stroke rows, the tombstone and Add shot each carry it themselves.
    expect(tag(html, 'data-shot-id="m-1"')).toContain("film-shot-row-in");
    expect(tag(html, "data-well-tombstone")).toContain("film-shot-row-in");
    expect(tag(html, "data-add-shot")).toContain("film-shot-row-in");
  });

  test("a clock tick replays nothing: the same arrival whichever stroke is lit", () => {
    // The same markup whichever stroke the film is on: only the lit row's
    // wash differs, never a class that would restart an arrival.
    const strip = (html: string) =>
      tags(html, "film-shot-row-in").map(
        (row) => /animation-delay:\d+ms/.exec(row)?.[0],
      );
    expect(strip(renderWell({ playingShotId: "m-3" }))).toEqual(
      strip(renderWell({ playingShotId: "m-4" })),
    );
  });

  test("`animate` off: no unfold and no arrival — the well a page loads with", () => {
    const html = renderWell({ animate: false });
    expect(html).not.toContain("film-shot-well-open");
    expect(html).not.toContain("film-shot-row-in");
    expect(html).not.toContain("animation-delay");
    expect(html).not.toContain("label-row-arrive");
    // Still the two elements, so nothing re-lays between the two.
    expect(tag(html, "data-shots-well")).not.toContain("class=");
    expect(html).toContain("min-h-0 flex-col overflow-hidden");
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

  test("only a tombstone carries the second arrival class", () => {
    // The tombstone alone carries the second class.
    const html = renderWell();
    expect(tags(html, "label-row-arrive")).toHaveLength(1);
    expect(tag(html, "data-well-tombstone")).toContain("label-row-arrive");
  });
});

// ── The point row's reveal ──────────────────────────────────────────────────

test.describe("the point row reveals its ⋯ as the Video tab reveals its bookmark", () => {
  test("at rest: the score slides on a transform, the actions fade in over its end — no width", () => {
    const html = renderRow();
    const score = tag(html, 'data-point-score=""');
    expect(score).toContain(FILM_ROW_SLIDE_TRANSITION);
    expect(score).toContain(FILM_ROW_SLIDE_ON_REACH);
    const actions = tag(html, 'data-row-actions=""');
    expect(actions).toContain(FILM_ROW_ACTION_TRANSITION);
    expect(actions).toContain(FILM_ROW_ACTION_ON_REACH);
    expect(actions).not.toMatch(/[\s"]w-0\b|:w-auto/);
    expect(html).not.toMatch(/transition-\[[^\]]*width/);
  });

  test("the playing row holds it, as a saved point's bookmark is held", () => {
    const html = renderRow({ playing: true });
    const score = tag(html, 'data-point-score=""');
    expect(score).toContain(` ${FILM_ROW_SLIDE_HELD}`);
    expect(score).not.toContain("group-hover/row");
    const actions = tag(html, 'data-row-actions=""');
    expect(actions).toContain(FILM_ROW_ACTION_HELD);
    expect(actions).not.toContain("opacity-0");
  });

  test("a row with no actions has nothing to make room for", () => {
    const edit = { ...editContext(), editable: false, operations: undefined };
    const score = tag(renderRow({ edit }), 'data-point-score=""');
    expect(score).not.toContain("translate-x");
  });
});

// ── Feedback ────────────────────────────────────────────────────────────────

test.describe("the check answers the click", () => {
  test("the glyph carries the class; a row that renders checked plays nothing", () => {
    const html = renderRow();
    const button = tag(html, 'data-check-row=""');
    const after = html.slice(html.indexOf('data-check-row=""'));
    expect(after.slice(0, after.indexOf("</button>"))).toContain(
      "label-check-in",
    );
    // Never from the markup: a row that renders checked plays nothing.
    expect(button).not.toContain("data-just-checked");
    const checked = labelSessionFixture().points.find(
      (p) => p.checkedAt !== null,
    )!;
    const row = renderRow({ point: checked });
    expect(tag(row, 'data-check-row=""')).toContain('aria-pressed="true"');
    expect(row).not.toContain("data-just-checked");
  });

  test("the click handler marks its own element, and unmarks it on uncheck", () => {
    const { BlackPointRow } = createLoader().load(
      `${LABELS}/label-black-point-row.tsx`,
    ) as {
      BlackPointRow: { type: (props: unknown) => React.ReactElement };
    };
    const edit = editContext();
    const press = (
      checkedAt: string | null,
      dataset: Record<string, string>,
    ) => {
      const point = {
        ...edit.points.find((p) => p.id === FIXTURE_POINT_IDS.P1)!,
        checkedAt,
      };
      const tree = BlackPointRow.type({
        point,
        open: false,
        playing: false,
        score: null,
        edit,
      });
      const button = findByProp(tree, "data-check-row")!;
      (button.props as { onClick: (event: unknown) => void }).onClick({
        stopPropagation() {},
        currentTarget: { dataset },
      });
      return dataset;
    };
    expect(press(null, {})).toEqual({ justChecked: "" });
    expect(press("2026-10-06T00:00:00Z", { justChecked: "" })).toEqual({});
  });
});

// ── Continuity ──────────────────────────────────────────────────────────────

test.describe("the court crossfades between the whole court and the half", () => {
  const load = () =>
    createLoader().load(`${LABELS}/label-court.tsx`) as {
      LabelCourt: React.ComponentType<Record<string, unknown>>;
    };
  const court = (props: Record<string, unknown>) =>
    renderToStaticMarkup(
      React.createElement(load().LabelCourt, { strokes: [], ...props }),
    );

  test("the art's layer carries the fade only when asked, on both scales", () => {
    for (const view of ["whole", "near", "far"] as const) {
      const still = tag(court({ view }), "data-court-layer");
      expect(still, view).not.toContain("label-court-view-in");
      expect(
        tag(court({ view, fadeOnZoom: true }), "data-court-layer"),
      ).toContain("label-court-view-in");
    }
    // The art is inside the layer; the box (its size, its outline) is not.
    const html = court({ view: "near", fadeOnZoom: true });
    expect(html.indexOf("data-court-layer")).toBeLessThan(
      html.indexOf("data-court-art"),
    );
    expect(tag(html, "data-court-view")).not.toContain("label-court-view-in");
  });
});

test.describe("switching layout fades the arriving view", () => {
  const view = (file: string, name: string, arrive: boolean) => {
    const mod = createLoader().load(`${LABELS}/${file}`) as Record<
      string,
      React.ComponentType<Record<string, unknown>>
    >;
    return renderToStaticMarkup(
      React.createElement(mod[name], { video: null, court: null, arrive }),
    );
  };

  test("each view carries its fade only when it arrives", () => {
    expect(
      tag(
        view("label-black-view.tsx", "LabelBlackView", true),
        "data-label-black=",
      ),
    ).toContain("label-layer-in-full");
    expect(
      tag(
        view("label-black-view.tsx", "LabelBlackView", false),
        "data-label-black=",
      ),
    ).not.toContain("label-layer-in");
    expect(
      tag(
        view("label-side-view.tsx", "LabelSideView", true),
        'data-label-side=""',
      ),
    ).toContain("label-layer-in-docked");
    expect(
      tag(
        view("label-side-view.tsx", "LabelSideView", false),
        'data-label-side=""',
      ),
    ).not.toContain("label-layer-in");
  });
});

// ── Budget ──────────────────────────────────────────────────────────────────

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

test("the 120 point rows take no per-row state or prop for any of it", () => {
  const row = source("label-black-point-row.tsx");
  const component = row.slice(
    row.indexOf("export const BlackPointRow = memo("),
    row.indexOf("/** The second line's ink"),
  );
  expect(component).not.toMatch(/\buse(State|Effect|Ref|LayoutEffect)\(/);
  // No arrival on a point row: nothing staggers when the page loads.
  expect(component).not.toContain("film-shot-row-in");
  expect(component).not.toContain("animationDelay");
});
