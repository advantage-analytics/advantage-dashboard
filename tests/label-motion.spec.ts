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
import { labelScores } from "@/lib/services/labels/score";
import type { LabelPoint, LabelShot } from "@/lib/services/labels/session";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The labelling console's motion (`/admin/labels/[sessionId]`): what moves,
 * on which element, and — as much as the rest — what does not: nothing on
 * page load, nothing on a tick of the film's clock, nothing a reduced-motion
 * labeller did not ask to keep.
 *
 * A static render has no animation to watch, so each piece is pinned where a
 * diff reviewer can read it: the class on the element that carries it, the
 * rule in globals.css, and the source of the latch that keeps it off the
 * first render.
 */

const LABELS = "src/components/admin/labels";
const FILM = "src/components/dashboard/matches/match-detail/film";
const css = readFileSync("src/app/globals.css", "utf8");
const source = (file: string) => readFileSync(`${LABELS}/${file}`, "utf8");

/** The opening tag carrying `attr`. */
function tag(html: string, attr: string): string {
  const at = html.indexOf(attr);
  expect(at, attr).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
}

/** Every opening tag carrying `attr`, in order. */
function tags(html: string, attr: string): string[] {
  return [...html.matchAll(/<[^>]+>/g)]
    .map((m) => m[0])
    .filter((t) => t.includes(attr));
}

/** The block of globals.css from `from` to the next blank-line comment. */
function rule(selector: string): string {
  const at = css.indexOf(selector);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at) + 1);
}

function shot(id: string, fields: Partial<LabelShot> = {}): LabelShot {
  return {
    id,
    labelPointId: "p-motion",
    eventId: null,
    afterEventId: null,
    status: "kept",
    statusBeforeDelete: null,
    deleteReason: null,
    hitter: "p1",
    stroke: "forehand",
    result: null,
    spin: null,
    contactX: null,
    contactY: null,
    landingX: null,
    landingY: null,
    videoTime: 10,
    siteRemoval: null,
    siteRemovalRestoredAt: null,
    seed: null,
    ...fields,
  };
}

const noop = () => {};
const OPERATIONS = {
  onAskDeleteShot: noop,
  onAskDeletePoint: noop,
  onRestoreShot: noop,
  onRestorePoint: noop,
  onMovePoint: noop,
  onSetChecked: noop,
  onAddShot: noop,
  onAskResetShot: noop,
  onAskResetPoint: noop,
};

function editContext() {
  const session = labelSessionFixture();
  return {
    editable: true,
    names: { p1: "Lee", p2: "Vargas" },
    selectedShotId: null,
    onPatchPoint: noop,
    onPatchShot: noop,
    operations: OPERATIONS,
    points: session.points,
    scores: labelScores(session.points, session.adScoring).points,
  };
}

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
  test("two elements: the outer grid unfolds, the inner column is what it clips", () => {
    const html = renderWell();
    const outer = tag(html, "data-shots-well");
    expect(outer).toContain('class="film-shot-well-open"');
    // The inner column, the outer's only child: the film's own structure.
    const outerEnd = html.indexOf(">", html.indexOf("data-shots-well")) + 1;
    const inner = html.slice(outerEnd, html.indexOf(">", outerEnd) + 1);
    for (const cls of ["flex", "min-h-0", "flex-col", "overflow-hidden"]) {
      expect(inner, cls).toContain(cls);
    }
    // The Video tab's well, for the same two classes on the same two levels.
    const film = readFileSync(`${FILM}/point-list.tsx`, "utf8");
    expect(film).toMatch(
      /<div data-shot-well className="film-shot-well-open">\s+<div className="flex min-h-0 flex-col overflow-hidden /,
    );
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
    expect(source("label-black-shot-row.tsx")).toContain(
      "style: { animationDelay: `${shotRowRevealDelay(order)}ms` },",
    );
    // Stroke rows, the tombstone and Add shot each carry it themselves.
    expect(tag(html, 'data-shot-id="m-1"')).toContain("film-shot-row-in");
    expect(tag(html, "data-well-tombstone")).toContain("film-shot-row-in");
    expect(tag(html, "data-add-shot")).toContain("film-shot-row-in");
  });

  test("the rows are keyed by their stroke, so an edit or a clock tick replays nothing", () => {
    const well = source("label-black-shot-row.tsx");
    for (const row of ["BlackDeletedShot", "BlackGhostShot", "BlackShotRow"]) {
      expect(well, row).toMatch(new RegExp(`<${row}\\s+key=\\{shot\\.id\\}`));
    }
    expect(well).toMatch(/<BlackSuggestedShot\s+key=\{suggestion\.key\}/);
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
    // The latch: on only once the open point has changed since the rail
    // mounted, set in render so the first new well already has it.
    const rail = source("label-black-rail.tsx");
    expect(rail).toContain("const [openAtMount] = useState(expandedPointId);");
    expect(rail).toContain(
      "if (!openMoved && expandedPointId !== openAtMount) setOpenMoved(true);",
    );
    expect(rail).toContain("animate={openMoved}");
  });

  test("once the rally has arrived, a row that mounts is an edit: no stagger, and only a tombstone rises", () => {
    // The mark is put on the well's own element, from its events — no state.
    const well = source("label-black-shot-row.tsx");
    expect(well).toContain('well.dataset.wellSettled = "";');
    expect(well).toContain(
      "if (event.target === well.firstElementChild?.lastElementChild) {",
    );
    expect(well).toContain(
      'if (event.animationName !== "film-shot-row-in") return;',
    );
    expect(well).toContain(
      'if (event.animationName === "film-shot-well-fade") {',
    );
    expect(well).toContain(
      "onAnimationEnd={animate ? settleWellOnArrival : undefined}",
    );
    expect(well).toContain(
      "onPointerDownCapture={animate ? settleWellOnReach : undefined}",
    );
    // Only the duration and the delay change — never the animation's name,
    // which would replay every row already in place.
    const settled = rule("[data-well-settled] .film-shot-row-in {");
    expect(settled).toContain("animation-duration: 0s;");
    expect(settled).toContain("animation-delay: 0s !important;");
    expect(settled).not.toMatch(/animation(-name)?:/);
    const tombstone = rule(
      "[data-well-settled] .film-shot-row-in.label-row-arrive {",
    );
    expect(tombstone).toContain("animation-duration: var(--duration-fast);");
    expect(tombstone).not.toMatch(/animation(-name)?:/);
    // The tombstone alone carries the second class.
    const html = renderWell();
    expect(tags(html, "label-row-arrive")).toHaveLength(1);
    expect(tag(html, "data-well-tombstone")).toContain("label-row-arrive");
  });

  test("reduced motion is the Video tab's: rows are simply there, the well only fades", () => {
    expect(css).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*\.film-shot-row-in\s*\{\s*animation:\s*none;/,
    );
    expect(css).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*\.film-shot-well-open\s*\{\s*animation:\s*film-shot-well-fade var\(--duration-fast\)/,
    );
  });
});

// ── The point row's reveal ──────────────────────────────────────────────────

test.describe("the point row reveals its ⋯ as the Video tab reveals its bookmark", () => {
  test("the recipe is the Video tab's own constants, used by both rows", () => {
    expect(FILM_ROW_SLIDE_TRANSITION).toBe(
      "transition-transform duration-200 ease-[var(--ease-primary)]",
    );
    expect(FILM_ROW_SLIDE_HELD).toBe("-translate-x-[26px]");
    expect(FILM_ROW_SLIDE_ON_REACH).toBe(
      "motion-safe:group-focus-within/row:-translate-x-[26px] motion-safe:group-hover/row:-translate-x-[26px]",
    );
    expect(FILM_ROW_ACTION_TRANSITION).toBe(
      "transition-opacity duration-200 focus-visible:opacity-100",
    );
    expect(FILM_ROW_ACTION_HELD).toBe("opacity-100");
    expect(FILM_ROW_ACTION_ON_REACH).toBe(
      "opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100",
    );
    const film = readFileSync(`${FILM}/point-list.tsx`, "utf8");
    const row = source("label-black-point-row.tsx");
    for (const name of [
      "FILM_ROW_SLIDE_TRANSITION",
      "FILM_ROW_SLIDE_HELD",
      "FILM_ROW_SLIDE_ON_REACH",
      "FILM_ROW_ACTION_TRANSITION",
      "FILM_ROW_ACTION_HELD",
      "FILM_ROW_ACTION_ON_REACH",
    ]) {
      expect(film, name).toContain(name);
      expect(row, name).toContain(name);
    }
    // The Video tab keeps no second copy of the strings.
    expect(film).not.toContain('"-translate-x-[26px]"');
    expect(film).not.toContain("group-hover/row:opacity-100");
  });

  test("at rest: the score slides on a transform, the actions fade in over its end — no width", () => {
    const html = renderRow();
    const score = tag(html, 'data-point-score=""');
    expect(score).toContain(FILM_ROW_SLIDE_TRANSITION);
    expect(score).toContain(FILM_ROW_SLIDE_ON_REACH);
    // Held aside while the ⋯ menu is open (it is portalled).
    expect(score).toContain(
      "group-has-[[data-row-actions]_[aria-expanded=true]]/row:-translate-x-[26px]",
    );
    const actions = tag(html, 'data-row-actions=""');
    expect(actions).toContain(FILM_ROW_ACTION_TRANSITION);
    expect(actions).toContain(FILM_ROW_ACTION_ON_REACH);
    expect(actions).toContain("absolute inset-y-0");
    expect(actions).toContain("right-[46px]");
    expect(actions).not.toMatch(/[\s"]w-0\b|:w-auto/);
    expect(html).not.toMatch(/transition-\[[^\]]*width/);
    // The row is the group, and it has no actions track.
    expect(tag(html, 'data-row="point"')).toContain("group/row");
    expect(tag(html, 'data-row="point"')).toContain(
      "grid-cols-[22px_30px_minmax(0,1fr)_auto_52px_22px]",
    );
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

  test("reduced motion: the score still gets out from under the button, without the slide", () => {
    const score = tag(renderRow(), 'data-point-score=""');
    for (const cls of [
      "motion-reduce:transition-none",
      "motion-reduce:group-hover/row:-translate-x-[26px]",
      "motion-reduce:group-focus-within/row:-translate-x-[26px]",
    ]) {
      expect(score, cls).toContain(cls);
    }
  });

  test("a row with no actions has nothing to make room for", () => {
    const edit = { ...editContext(), editable: false, operations: undefined };
    const score = tag(renderRow({ edit }), 'data-point-score=""');
    expect(score).not.toContain("translate-x");
  });
});

// ── Feedback ────────────────────────────────────────────────────────────────

test.describe("the check answers the click", () => {
  test("the glyph carries the class; the animation needs the click's mark AND the pressed state", () => {
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

    const selector =
      '[data-just-checked][aria-pressed="true"] > .label-check-in {';
    expect(rule(selector)).toContain(
      "animation: label-check-in var(--duration-fast) var(--ease-out-expo);",
    );
    // No bare `.label-check-in` rule: the class alone animates nothing.
    expect(css).not.toMatch(/^\.label-check-in\b/m);
    expect(css).toMatch(
      /@keyframes label-check-in \{\s*from \{\s*transform: scale\(0\.8\);/,
    );
    expect(css).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*\[data-just-checked\]\[aria-pressed="true"\] > \.label-check-in \{\s*animation: none;/,
    );
  });

  test("the mark is set by the click handler, on its own element, and taken off on uncheck", () => {
    const row = source("label-black-point-row.tsx");
    expect(row).toMatch(
      /if \(checked\) delete event\.currentTarget\.dataset\.justChecked;\s+else event\.currentTarget\.dataset\.justChecked = "";\s+operations\?\.onSetChecked\(point\.id, !checked\);/,
    );
    // Nowhere else, and never as a prop or state of the memoised row.
    for (const file of readdirSync(LABELS)) {
      const text = source(file);
      const uses = text.match(/justChecked|data-just-checked/g) ?? [];
      expect(uses.length, file).toBe(
        file === "label-black-point-row.tsx" ? 2 : 0,
      );
    }
    // Driving it: the handler marks a fake element and unmarks it.
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
      const find = (node: React.ReactNode): React.ReactElement | null => {
        for (const child of React.Children.toArray(node)) {
          if (!React.isValidElement(child)) continue;
          const props = child.props as Record<string, unknown>;
          if (props["data-check-row"] === "") return child;
          const inner = find(props.children as React.ReactNode);
          if (inner) return inner;
        }
        return null;
      };
      const button = find(tree)!;
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

test.describe("every rail control has a pressed state", () => {
  const PRESS = [
    "active:scale-[0.96]",
    "active:duration-100",
    "motion-reduce:active:scale-100",
    "transition-[color,background-color,scale]",
  ];

  test("RAIL_PRESS: 0.96, 100ms in, and no dip under reduced motion", () => {
    const { RAIL_PRESS } = createLoader().load(
      `${LABELS}/label-black-parts.tsx`,
    ) as { RAIL_PRESS: string };
    expect(RAIL_PRESS).toBe(
      "transition-[color,background-color,scale] duration-200 active:scale-[0.96] active:duration-100 motion-reduce:active:scale-100",
    );
  });

  test("the tick, the ⋯, Add shot's neighbours and the header's buttons all carry it", () => {
    const row = renderRow();
    const well = renderWell();
    const consoleHtml = renderConsole({
      video: { url: "https://example.test/v.mp4?sig=x", startTimeSeconds: 0 },
    });
    const carriers: [string, string][] = [
      ["the tick", tag(row, 'data-check-row=""')],
      ["the point's ⋯", tag(row, 'data-point-menu=""')],
      ["a tombstone's Undo", tag(well, "data-undo-delete")],
      [
        "the rail's full-screen button",
        tag(consoleHtml, "data-label-rail-full-screen"),
      ],
      [
        "the full screen's exit",
        tag(
          renderConsole({ initialLayoutMode: "black" }),
          "data-label-black-exit",
        ),
      ],
    ];
    for (const [name, element] of carriers) {
      for (const cls of PRESS)
        expect(element, `${name}: ${cls}`).toContain(cls);
      // One transition-property per element.
      expect(element, name).not.toContain("transition-colors");
    }
    // The stroke row's own requests and the game band's triggers: read off
    // the source, since they sit behind hover and state.
    for (const file of ["label-black-shot-row.tsx", "label-game-band.tsx"]) {
      for (const cls of PRESS.slice(0, 3)) {
        expect(source(file), `${file}: ${cls}`).toContain(cls);
      }
    }
  });
});

test("row washes and reveals ease over 200ms rather than cutting", () => {
  expect(tag(renderRow(), 'data-row="point"')).toContain(
    "transition-colors duration-200",
  );
  const well = renderWell();
  expect(tag(well, 'data-shot-id="m-1"')).toContain(
    "transition-colors duration-200",
  );
  expect(tag(well, "data-shot-actions")).toContain(
    "transition-opacity duration-200",
  );
  expect(tag(well, "data-add-shot")).toContain(
    "transition-colors duration-200",
  );
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
      expect(still, view).toContain("absolute inset-0 block");
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

  test("keyed by the scale, so near ↔ far — every placing click — replays nothing", () => {
    expect(source("label-court.tsx")).toContain(
      'key={zoomed ? "half" : "whole"}',
    );
  });

  test("never the court the panel mounted with: the panel latches a switch", () => {
    const panel = source("label-court-panel.tsx");
    expect(panel).toContain("const [zoomAtMount] = useState(placing);");
    expect(panel).toContain(
      "if (!zoomSwitched && placing !== zoomAtMount) setZoomSwitched(true);",
    );
    expect(panel).toContain("fadeOnZoom={zoomSwitched}");
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

  test("the full screen 200ms, the docked view 150ms, and neither on first render", () => {
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

    const consoleSource = source("label-console.tsx");
    expect(consoleSource).toContain("arrive={layoutSwitched}");
    expect(consoleSource).toContain(
      "const [layoutSwitched, setLayoutSwitched] = useState(false);",
    );
    // Set by a switch alone.
    expect(consoleSource.match(/setLayoutSwitched\(/g)).toHaveLength(1);
    expect(consoleSource).toMatch(
      /const switchLayout = useCallback\(\(mode: LabelLayoutMode\) => \{[\s\S]*?setLayoutSwitched\(true\);\s+\}, \[\]\);/,
    );
  });

  test("opacity only, from a visible default, with a reduced-motion path", () => {
    const keyframe = css.slice(css.indexOf("@keyframes label-fade-in"));
    // Only a `from`: every element ends at its own opacity.
    expect(keyframe.slice(0, keyframe.indexOf("}\n}") + 3)).toMatch(
      /^@keyframes label-fade-in \{\s*from \{\s*opacity: 0;\s*\}\s*\}$/,
    );
    expect(css).toMatch(
      /\.label-court-view-in,\s*\.label-layer-in-full \{\s*animation: label-fade-in var\(--duration-hover\) var\(--ease-primary\) both;/,
    );
    expect(css).toMatch(
      /\.label-layer-in-docked \{\s*animation: label-fade-in var\(--duration-fast\) var\(--ease-primary\) both;/,
    );
    expect(css).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*\.label-court-view-in,\s*\.label-layer-in-full \{\s*animation-duration: var\(--duration-fast\);/,
    );
  });
});

test("the Now playing pill arrives on the Video tab's own keyframe", () => {
  const pill = source("label-follow-pill.tsx");
  expect(pill).toContain('"film-follow-pill-in [--film-pill-rise:-4px]"');
  expect(css).toMatch(
    /prefers-reduced-motion: reduce\)\s*\{\s*\.film-follow-pill-in \{\s*animation: film-follow-pill-fade/,
  );
});

// ── Budget ──────────────────────────────────────────────────────────────────

test("budget: no layout property transitions, no will-change, no animation library, no banned word", () => {
  for (const file of readdirSync(LABELS)) {
    const text = source(file);
    expect(text, file).not.toMatch(/will-change|willChange/);
    expect(text, file).not.toMatch(/from "(framer-motion|motion\/react)"/);
    expect(text, file).not.toMatch(
      /transition-\[[^\]]*(width|height|margin|padding|top|left)[^\]]*\]/,
    );
    expect(text, file).not.toMatch(/\bflags\b/);
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
