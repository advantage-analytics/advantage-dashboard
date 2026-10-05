import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  fromCourt,
  fromCourtInHalf,
} from "@/components/admin/labels/court-geometry";
import type { LabelSession, LabelVideo } from "@/lib/services/labels/session";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * `/admin/labels/[sessionId]`'s console (T5, editing T6), rendered offline
 * from a fixture session through `fixtures/vm-modules` — the real table,
 * court and player, nothing stubbed.
 */

type ConsoleProps = {
  session: LabelSession;
  video: LabelVideo | null;
  initialExpandedPointId?: string | null;
  initialSelectedShotId?: string | null;
  initialVideoTime?: number | null;
  initialVideoMinimised?: boolean;
  initialPointFocus?:
    { mode: "follow" } | { mode: "held"; pointId: string | null };
  initialLayoutMode?:
    "overlay" | "docked-top" | "docked-side" | "black" | "film";
  initialDockSize?: number;
  initialRailWidth?: number;
  initialFilmRailHidden?: boolean;
  initialFilmCourtHidden?: boolean;
  onSaveShot?: (...args: unknown[]) => Promise<unknown>;
  onSavePoint?: (...args: unknown[]) => Promise<unknown>;
};

/** Save functions that are never called by a static render. */
const SAVES = {
  onSaveShot: async () => ({ ok: true, status: "edited" }),
  onSavePoint: async () => ({ ok: true, status: "edited" }),
};

/** The markup of one row, up to the next row of any kind. */
function rowMarkup(html: string, attr: string): string {
  const start = html.indexOf(attr);
  expect(start).toBeGreaterThan(-1);
  const next = html.indexOf("data-row=", start + attr.length);
  return html.slice(start, next === -1 ? undefined : next);
}

/** A mounted editor: a text field, or a dropdown (`SelectEditor`). */
const EDITORS = /data-select-editor|<input|<textarea/g;

function render(props: ConsoleProps): string {
  const { LabelConsole } = createLoader().load(
    "src/components/admin/labels/label-console.tsx",
  ) as { LabelConsole: React.ComponentType<ConsoleProps> };
  return renderToStaticMarkup(React.createElement(LabelConsole, props));
}

function count(html: string, pattern: RegExp): number {
  return html.match(pattern)?.length ?? 0;
}

/** The markup of the expanded point's shot panel, up to the next point. */
function shotPanel(html: string, pointId: string): string {
  const start = html.indexOf(`data-shots-for="${pointId}"`);
  expect(start).toBeGreaterThan(-1);
  const next = html.indexOf('data-row="point"', start);
  const deleted = html.indexOf('data-row="deleted-point"', start);
  const ends = [next, deleted].filter((i) => i > -1);
  return html.slice(start, ends.length ? Math.min(...ends) : undefined);
}

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

test("one row per live point, and a marker for the deleted one", () => {
  const html = render({
    session: labelSessionFixture(),
    video: null,
    initialExpandedPointId: null,
  });
  expect(count(html, /data-row="point"/g)).toBe(3);
  expect(count(html, /data-row="deleted-point"/g)).toBe(1);
  expect(text(html)).toContain("Deleted point");
  // Collapsed: no strokes are drawn at all.
  expect(count(html, /data-row="shot"/g)).toBe(0);
  expect(html).not.toContain("Deleted shot");
});

test("an expanded point folds its shots out in video order", () => {
  const html = render({
    session: labelSessionFixture(),
    video: null,
    initialExpandedPointId: FIXTURE_POINT_IDS.P1,
  });
  const panel = shotPanel(html, FIXTURE_POINT_IDS.P1);

  // Three live strokes plus one tombstone, all inside point 1's panel.
  expect(count(panel, /data-row="shot"/g)).toBe(3);
  expect(count(html, /data-row="shot"/g)).toBe(3);
  expect(text(panel)).toContain("Deleted shot");

  // Serve (41:12.0), the edited return (41:13.1), the tombstone (41:13.6),
  // the added forehand (41:14.4) — the fixture lists them out of order.
  const ids = [...panel.matchAll(/data-shot-id="([^"]+)"/g)].map((m) => m[1]);
  expect(ids).toEqual(["s-serve", "s-return", "s-added"]);
  const panelText = text(panel);
  // Shot · time · player's name · stroke · spin · hit at · landed at ·
  // placement · result · status. There is no Type or Speed column.
  expect(panelText).toContain(
    "Shot Time Player Stroke Spin Hit at Landed at Placement Result Status 1 ",
  );
  expect(panelText).toContain(
    "1 41:12.0 Lee First serve Flat -0.80, -0.32 0.60, 17.79 T In 2 ",
  );
  expect(panelText).toContain(
    "2 41:13.1 Vargas Backhand Topspin 1.80, 24.49 -2.10, 3.49 Crosscourt In Edited",
  );
  // The added stroke has no spin yet: an em dash, named.
  expect(panelText).toContain(
    "3 41:14.4 Lee Forehand — Not set -2.30, -1.02 4.20, 24.90 Crosscourt Out Added",
  );
  expect(panelText.indexOf("Deleted shot")).toBeLessThan(
    panelText.indexOf("41:14.4"),
  );
});

test("shot columns: spin, the two positions, whole, and nothing typed for Result", () => {
  const { SHOT_COLUMNS, SHOT_TRACKS } = createLoader().load(
    "src/components/admin/labels/label-table-layout.ts",
  ) as { SHOT_COLUMNS: readonly string[]; SHOT_TRACKS: string };
  // The last, unlabelled track is the row's ✕.
  expect(SHOT_COLUMNS).toEqual([
    "Shot",
    "Time",
    "Player",
    "Stroke",
    "Spin",
    "Hit at",
    "Landed at",
    "Placement",
    "Result",
    "Status",
    "",
  ]);
  for (const gone of ["Type", "Speed"]) {
    expect(SHOT_COLUMNS.join(" ")).not.toContain(gone);
  }
  // One track per column, and the two positions at least 112px wide.
  const tracks = /grid-cols-\[([^\]]+)\]/.exec(SHOT_TRACKS)![1].split("_");
  expect(tracks).toHaveLength(SHOT_COLUMNS.length);
  for (const name of ["Hit at", "Landed at"]) {
    const track = tracks[SHOT_COLUMNS.indexOf(name)];
    expect(track, name).toMatch(/^\d+px$/);
    expect(parseInt(track, 10), name).toBeGreaterThanOrEqual(112);
  }

  // A wide pair is in the markup whole — as text, and in the editor.
  // A copy: the fixture's rows are shared between calls.
  const session = structuredClone(labelSessionFixture());
  const serve = session.points
    .flatMap((point) => point.shots)
    .find((shot) => shot.id === "s-serve")!;
  Object.assign(serve, { contactX: -3.21, contactY: 18.4 });
  const asText = render({
    session,
    video: null,
    initialExpandedPointId: FIXTURE_POINT_IDS.P1,
  });
  expect(rowMarkup(asText, 'data-shot-id="s-serve"')).toContain(
    ">-3.21, 18.40<",
  );
  const editing = rowMarkup(
    render({
      session,
      video: null,
      initialExpandedPointId: FIXTURE_POINT_IDS.P1,
      initialSelectedShotId: "s-serve",
      ...SAVES,
    }),
    'data-shot-id="s-serve"',
  );
  expect(editing).toMatch(
    /<input[^>]*aria-label="Shot 1 hit at, metres x, y"[^>]*value="-3\.21, 18\.40"/,
  );
});

test("shot rows: a card of strokes, the hitter by name, calculated cells, faults", () => {
  const session = structuredClone(labelSessionFixture());
  const shots = session.points.flatMap((point) => point.shots);
  // The serve goes long, and the return has not been placed.
  Object.assign(
    shots.find((shot) => shot.id === "s-serve")!,
    {
      result: "out",
    },
  );
  Object.assign(
    shots.find((shot) => shot.id === "s-return")!,
    {
      landingX: null,
      landingY: null,
      result: null,
    },
  );
  const html = render({
    session,
    video: null,
    initialExpandedPointId: FIXTURE_POINT_IDS.P1,
  });
  const panel = shotPanel(html, FIXTURE_POINT_IDS.P1);
  // One bordered card holds every stroke row.
  expect(count(panel, /data-shot-card/g)).toBe(1);
  expect(panel.indexOf("data-shot-card")).toBeLessThan(
    panel.indexOf('data-row="shot"'),
  );

  // The Player cell is the name alone: no chip of either kind in the fold.
  const serve = rowMarkup(html, 'data-shot-id="s-serve"');
  expect(panel).not.toContain("data-player-mark");
  expect(count(panel, /data-winner-mark/g)).toBe(0);
  expect(serve).toMatch(
    /data-cell="Shot 1 player"[^>]*><span[^>]*>Lee<\/span><\/span>/,
  );

  // A serve that did not go in is muted, and says so.
  expect(serve).toContain("data-fault");
  expect(serve).toContain("text-[var(--ink-500)]");
  expect(text(serve)).toMatch(/T Out Fault/);
  expect(rowMarkup(html, 'data-shot-id="s-added"')).not.toContain("data-fault");

  // Unplaced: Placement and Result are an em dash, never a guess.
  const unplaced = rowMarkup(html, 'data-shot-id="s-return"');
  expect(unplaced).toMatch(/data-calculated="placement"[^>]*><span[^>]*>—</);
  expect(unplaced).toMatch(/data-calculated="result"[^>]*><span[^>]*>—</);

  // Calculated cells are text and nothing else — no aim glyph, no tooltip —
  // on a resting row and on the selected one.
  const selected = rowMarkup(
    render({
      session,
      video: null,
      initialExpandedPointId: FIXTURE_POINT_IDS.P1,
      initialSelectedShotId: "s-added",
      ...SAVES,
    }),
    'data-shot-id="s-added"',
  );
  for (const row of [serve, selected]) {
    expect(row).toMatch(/data-calculated="placement"[^>]*>[^<]+<\/span>/);
    expect(row).toMatch(/data-calculated="result"[^>]*>[^<]+<\/span>/);
    expect(row).not.toContain("lucide-crosshair");
  }
  expect(html).not.toContain("Set by where the shot was hit");
});

test("point rows: who won, then the point, how it ended, its note and status", () => {
  const html = render({
    session: labelSessionFixture(),
    video: null,
    initialExpandedPointId: null,
  });
  const out = text(html);
  expect(out).toContain(
    "Won # Time Score How it ended Last shot Rally Note Status",
  );
  // Winner initial · # · time · score before · ending · last shot · rally ·
  // note · status. Read-only, an empty note is a dash, not "Add note".
  expect(out).toMatch(/V 1 41:12\.0 0–0 Error Forehand 3 — No note Edited/);
  expect(out).toMatch(
    /L 2 41:30\.2 0–15 Ace First serve 1 Clean ace down the T\. Checked/,
  );
  // Nothing labelled and no stroke timed: each gap is a dash, named for
  // assistive technology — and a new game starts at 0–0. The light table
  // knows nothing of the site's removal: point 4's ghost is a stroke like any
  // other here, before the second serve the rally counts from.
  expect(out).toMatch(
    /— 4 — No timed shot 0–0 — Not labelled Second serve 1 — No note To check/,
  );
});

test("column headers are the DS table header; game bands the points rail's", () => {
  const html = render({
    session: labelSessionFixture(),
    video: null,
    initialExpandedPointId: FIXTURE_POINT_IDS.P1,
  });
  const { POINT_COLUMNS, SHOT_COLUMNS } = createLoader().load(
    "src/components/admin/labels/label-table-layout.ts",
  ) as {
    POINT_COLUMNS: readonly { label: string }[];
    SHOT_COLUMNS: readonly string[];
  };
  /** Every element whose whole text is `label`, by its class. */
  const classesOf = (markup: string, label: string) =>
    [...markup.matchAll(/<span class="([^"]*)">([^<]*)<\/span>/g)]
      .filter((match) => match[2] === label)
      .map((match) => match[1].split(" "));

  // The point header: everything in the stuck strip, before the first band.
  const headerAt = html.indexOf("data-label-point-header");
  const pointHeader = html.slice(headerAt, html.indexOf("data-game-band="));
  const pointLabels = POINT_COLUMNS.map((c) => c.label).filter(Boolean);
  expect(pointLabels).toHaveLength(9);
  for (const label of pointLabels) {
    const found = classesOf(pointHeader, label);
    expect(found, label).toHaveLength(1);
    expect(found[0], label).toContain("eyebrow-sm");
    // Left-aligned over its column, bar Rally's right-aligned number.
    expect(found[0], label).not.toContain("text-center");
  }
  expect(pointHeader).not.toContain("text-[12px]");
  // The hairline under it stays.
  expect(pointHeader).toContain("border-b border-[var(--border-hairline)]");

  // The shot header: the fold's first grid, before its first stroke.
  const panel = shotPanel(html, FIXTURE_POINT_IDS.P1);
  const shotHeader = panel.slice(0, panel.indexOf("data-row="));
  const shotLabels = SHOT_COLUMNS.filter(Boolean);
  expect(shotLabels).toHaveLength(10);
  for (const label of shotLabels) {
    const found = classesOf(shotHeader, label);
    expect(found, label).toHaveLength(1);
    expect(found[0], label).toContain("eyebrow-sm");
    expect(found[0], label).not.toContain("text-center");
  }

  // The first game's band: the rail's header — no ground, the label, a
  // spacer, then the games before it and who serves.
  const bandAt = html.indexOf('data-game-band="1-1"');
  expect(bandAt).toBeGreaterThan(-1);
  const band = html.slice(
    html.lastIndexOf("<div", bandAt),
    html.indexOf("</div>", bandAt),
  );
  expect(band).not.toContain("surface-subtle");
  expect(band).not.toContain("data-player-mark");
  expect(band).toContain("flex items-center px-3 pt-3 pb-[5px]");
  expect(band).toContain(
    "mono text-[9px] tracking-[1.4px] uppercase text-[var(--ink-400)]",
  );
  expect(band).toContain("mono tabular text-[10px] text-[var(--ink-400)]");
  expect(band).toContain('<span class="flex-1"></span>');
  const words = text(band);
  expect(words).toBe("Set 1 · Game 1 0–0 · Lee serves");
  const label = words.indexOf("Set 1 · Game 1");
  const score = words.indexOf("0–0");
  const serves = words.indexOf("serves");
  expect(label).toBe(0);
  expect(score).toBeGreaterThan(label);
  expect(serves).toBeGreaterThan(score);
});

test("a point row's winner chip, score, last shot and rally", () => {
  const html = render({
    session: labelSessionFixture(),
    video: null,
    initialExpandedPointId: null,
    ...SAVES,
  });
  const cell = (row: string, attr: string) =>
    row.match(new RegExp(`${attr}[^>]*>([^<]*)<`))?.[1];

  // Point 1: Vargas (p2) won it; Lee serves the first point of the game; the
  // live strokes are serve, return, forehand — the tombstone is not counted.
  const first = rowMarkup(html, `data-point-id="${FIXTURE_POINT_IDS.P1}"`);
  expect(cell(first, 'data-winner-mark="p2"')).toBe("V");
  expect(first).toMatch(
    /data-winner-mark="p2"[^>]*bg-\[var\(--surface-subtle\)\]/,
  );
  expect(cell(first, "data-point-score")).toBe("0–0");
  expect(cell(first, "data-point-last-shot")).toBe("Forehand");
  expect(cell(first, "data-point-rally")).toBe("3");
  // Editable, the chip is the menu's trigger and an empty note invites one.
  expect(first).toMatch(
    /<button[^>]*aria-label="Point 1 won by Vargas"[^>]*aria-haspopup="menu"/,
  );
  expect(text(first)).toContain("Add note");

  // Point 2: Lee (p1) on blue, at 0–15 after losing the first point.
  const second = rowMarkup(html, `data-point-id="${FIXTURE_POINT_IDS.P2}"`);
  expect(cell(second, 'data-winner-mark="p1"')).toBe("L");
  expect(second).toMatch(/data-winner-mark="p1"[^>]*bg-\[var\(--blue\)\]/);
  expect(cell(second, "data-point-score")).toBe("0–15");
  expect(cell(second, "data-point-last-shot")).toBe("First serve");
  expect(cell(second, "data-point-rally")).toBe("1");
  expect(html).toContain('aria-label="Point 2 note: Clean ace down the T."');
});

test("the rally counts from the last serve, tombstones left out", () => {
  const { pointSummary } = createLoader().load(
    "src/components/admin/labels/label-point-row.tsx",
  ) as {
    pointSummary: (point: { shots: unknown[] }) => {
      time: string | null;
      lastShot: string | null;
      rally: number;
    };
  };
  const stroke = (
    stroke: string,
    videoTime: number | null,
    status = "kept",
  ) => ({
    stroke,
    videoTime,
    status,
  });
  // A fault, the second serve, two groundstrokes — and a deleted phantom.
  expect(
    pointSummary({
      shots: [
        stroke("first_serve", null),
        stroke("second_serve", 61.5),
        stroke("forehand", 62.4, "deleted"),
        stroke("backhand", 63),
        stroke("forehand_volley", 64.2),
      ],
    }),
  ).toEqual({ time: "1:01.5", lastShot: "Forehand volley", rally: 3 });
  // No serve labelled: every live stroke counts. No strokes: nothing to say.
  expect(pointSummary({ shots: [stroke("backhand", 5)] }).rally).toBe(1);
  expect(pointSummary({ shots: [] })).toEqual({
    time: null,
    lastShot: null,
    rally: 0,
  });
});

test("defaults to the first point still to check", () => {
  const html = render({ session: labelSessionFixture(), video: null });
  expect(html).toContain(`data-shots-for="${FIXTURE_POINT_IDS.P1}"`);
  expect(html).toMatch(/data-court-title="[^"]*"[^>]*>Point 1</);
});

/** The court's marks layer, the `<svg data-court-marks>` and its children. */
function courtMarks(html: string): string {
  const match = /<svg[^>]*data-court-marks=""[^>]*>([\s\S]*?)<\/svg>/.exec(
    html,
  );
  expect(match).not.toBeNull();
  return match![1];
}

test("the court is board 08's art, showing the rally one stroke at a time (T22)", () => {
  // Nothing selected, before the video moves: the whole court, as a picture,
  // with nothing on it — the marks follow the film, never the whole point.
  const still = render({
    session: labelSessionFixture(),
    video: null,
    initialExpandedPointId: FIXTURE_POINT_IDS.P1,
  });
  expect(still).toContain('viewBox="-7.265 -4.5 14.53 32.77"');
  expect(still).toContain('data-court-view="whole"');
  expect(still).not.toContain("data-court-target");
  expect(still).toContain('aria-label="Court with no strokes placed"');
  expect(courtMarks(still)).not.toContain("<circle");
  // No list of shots in or beside the card — the table is the list — and
  // no switch until something is being placed.
  expect(still).toContain("data-court-legend");
  expect(still).not.toContain("data-court-steps");
  expect(still).not.toContain("Flip side");

  // At the serve's contact (41:12.0): its ring, and the ball not yet down.
  const serve = render({
    session: labelSessionFixture(),
    video: null,
    initialExpandedPointId: FIXTURE_POINT_IDS.P1,
    initialVideoTime: 2472.0,
  });
  expect(count(serve, /data-court-hit/g)).toBe(1);
  expect(count(serve, /data-court-landed/g)).toBe(0);
  const serveAt = fromCourt({ x: -0.8, y: -0.32 });
  expect(serve).toContain(
    `data-court-hit="" cx="${serveAt.sx.toFixed(2)}%" cy="${serveAt.sy.toFixed(2)}%"`,
  );
  // Full strength, eased and risen in with the Video tab's own motion.
  expect(serve).toMatch(
    /data-court-hit=""[^>]*style="opacity:1;transition:opacity 300ms cubic-bezier\(\.25,\.46,\.45,\.94\);animation:film-mark-in var\(--duration-fast\) var\(--ease-primary\) both"/,
  );

  // 3.3 s after the added forehand (41:14.4): its ring is fading, the return's
  // (41:13.1, 4.6 s ago) is gone and the serve's (41:12.0) long gone.
  const late = render({
    session: labelSessionFixture(),
    video: null,
    initialExpandedPointId: FIXTURE_POINT_IDS.P1,
    initialVideoTime: 2477.7,
  });
  expect(late).toContain('data-court-view="whole"');
  expect(count(late, /data-court-hit/g)).toBe(1);
  const addedAt = fromCourt({ x: -2.3, y: -1.02 });
  expect(late).toContain(
    `data-court-hit="" cx="${addedAt.sx.toFixed(2)}%" cy="${addedAt.sy.toFixed(2)}%"`,
  );
  expect(late).not.toContain(`cx="${serveAt.sx.toFixed(2)}%"`);
  expect(late).toMatch(/data-court-hit=""[^>]*style="opacity:0\.5;/);
});

test("a selected stroke is on the court alone, at full strength (T22)", () => {
  // Editable: the zoomed half, the return's ring and dot and nothing else —
  // not the serve, not the added forehand.
  const html = render({
    session: labelSessionFixture(),
    video: null,
    initialExpandedPointId: FIXTURE_POINT_IDS.P1,
    initialSelectedShotId: "s-return",
    initialVideoTime: 2477.7,
    ...SAVES,
  });
  expect(html).toContain('data-court-view="far"');
  expect(count(html, /data-court-hit/g)).toBe(1);
  expect(count(html, /data-court-landed/g)).toBe(1);
  expect(html).toMatch(/data-court-hit=""[^>]*style="opacity:1;/);
  expect(html).toMatch(/data-court-landed=""[^>]*style="opacity:1;/);
  const hitAt = fromCourtInHalf("far", { x: 1.8, y: 24.49 });
  expect(html).toContain(
    `data-court-hit="" cx="${hitAt.sx.toFixed(2)}%" cy="${hitAt.sy.toFixed(2)}%"`,
  );
  expect(count(html, /data-selected-ring="contact"/g)).toBe(1);

  // Read-only: the whole court, still that one stroke.
  const readOnly = render({
    session: labelSessionFixture(),
    video: null,
    initialExpandedPointId: FIXTURE_POINT_IDS.P1,
    initialSelectedShotId: "s-return",
    initialVideoTime: 2477.7,
  });
  expect(readOnly).toContain('data-court-view="whole"');
  expect(count(readOnly, /data-court-hit/g)).toBe(1);
  expect(count(readOnly, /data-court-landed/g)).toBe(1);
  expect(readOnly).not.toContain("data-selected-ring");
});

test("a selected stroke with no coordinates yet is a blank court, still clickable (T22)", () => {
  const html = render({
    session: labelSessionFixture(),
    video: null,
    initialExpandedPointId: FIXTURE_POINT_IDS.P2,
    initialSelectedShotId: "s-ace",
    initialVideoTime: 2490.2,
    ...SAVES,
  });
  expect(html).toMatch(/<button[^>]*data-court-target/);
  expect(html).toContain('aria-label="Click where shot 1 was hit. ');
  expect(courtMarks(html)).not.toContain("<circle");
  expect(html).not.toContain("data-selected-ring");
});

test("the court left the band for a floating card of its own", () => {
  const html = render({
    session: labelSessionFixture(),
    video: { url: "https://example.test/v.mp4?sig=x", startTimeSeconds: 0 },
  });
  expect(html).not.toContain("data-label-band");
  // Board 08i's 300 × 318 card, in its own fixed layer after the video's.
  expect(html).toMatch(
    /data-label-court-dock=""[^>]*style="[^"]*width:300px;height:318px/,
  );
  expect(html).toMatch(
    /data-label-court-dock=""[^>]*data-dock-anchor="bottom-left"/,
  );
  expect(html).toMatch(
    /data-label-dock=""[^>]*data-dock-anchor="bottom-right"/,
  );
  expect(html.indexOf("data-label-court-layer")).toBeGreaterThan(
    html.indexOf("data-label-dock-layer"),
  );
  expect(html).toContain('aria-label="Minimise the court"');
  expect(html).toContain('aria-label="Expand the court"');
  // The table follows the header directly: nothing sits above it.
  expect(html.indexOf("<video")).toBeGreaterThan(
    html.indexOf('data-row="point"'),
  );
});

test("the video is the signed file, or a quiet frame without one", () => {
  const withVideo = render({
    session: labelSessionFixture(),
    video: { url: "https://example.test/v.mp4?sig=x", startTimeSeconds: 0 },
  });
  expect(withVideo).toContain('src="https://example.test/v.mp4?sig=x"');

  const without = render({ session: labelSessionFixture(), video: null });
  expect(without).not.toContain("<video");
  expect(text(without)).toContain("No video for this job");
});

test.describe("the video dock", () => {
  const VIDEO = {
    url: "https://example.test/v.mp4?sig=x",
    startTimeSeconds: 0,
  };

  /** The dock's markup: from its fixed layer to the end of the render. */
  function dock(html: string): string {
    const start = html.indexOf("data-label-dock-layer");
    expect(start).toBeGreaterThan(-1);
    return html.slice(html.lastIndexOf("<", start));
  }

  /** One element's opening tag, found by an attribute on it. */
  function tag(html: string, attr: string): string {
    const at = html.indexOf(attr);
    expect(at, attr).toBeGreaterThan(-1);
    return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
  }

  test("floats over the page in the bottom-right corner, fixed to the viewport", () => {
    const html = dock(render({ session: labelSessionFixture(), video: VIDEO }));
    expect(tag(html, "data-label-dock-layer")).toMatch(
      /class="[^"]*pointer-events-none fixed inset-0/,
    );
    const box = tag(html, 'data-label-dock=""');
    expect(box).toContain('data-dock-anchor="bottom-right"');
    expect(box).toContain('data-dock-minimised="false"');
    expect(box).toContain('role="group"');
    expect(box).toContain('tabindex="0"');
    expect(box).toContain("width:480px");
    // Invisible until the hook has measured it, so it never flies in.
    expect(box).toMatch(/class="[^"]*\binvisible\b/);
  });

  test("carries the Video tab's transport, minus what the console has no use for", () => {
    const html = dock(render({ session: labelSessionFixture(), video: VIDEO }));
    expect(html).toContain('data-testid="label-video"');
    expect(html).toContain('src="https://example.test/v.mp4?sig=x"');
    expect(html).toContain('preload="metadata"');
    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-label="Previous point"');
    expect(html).toContain('aria-label="Next point"');
    expect(html).toContain('aria-label="Skip dead time — off"');
    expect(html).toContain('aria-label="Playback speed, 1×"');
    expect(html).toContain('aria-label="Loop this point — off"');
    expect(html).toContain('aria-label="Sound — on"');
    expect(html).not.toContain("Save point");
    expect(html).not.toContain("Show the court");
    expect(html).not.toContain("Exit fullscreen");
    expect(html).not.toContain("More — not available yet");
    expect(html).not.toContain("Open the film room fullscreen");
    // The table already shows the score: nothing on the film repeats it.
    expect(html).not.toMatch(/scoreboard/i);
  });

  test("the transport's title row describes the playing point", () => {
    // Point 1: ended on an error, its last live stroke the added forehand.
    const html = dock(
      render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialVideoTime: 2473.4,
      }),
    );
    const words = text(html);
    expect(words).toContain("Error · Forehand");
    expect(words).toContain("Set 1 · Game 1 · Lee serves");
    expect(words).toContain("Point 1 / 4");

    // In dead time there is no point to describe.
    const idle = text(
      dock(render({ session: labelSessionFixture(), video: VIDEO })),
    );
    expect(idle).toContain("Between points");
    expect(idle).not.toMatch(/Point \d+ \/ \d+/);
  });

  test("the bar is the drag handle, with the playing point and a minimise button", () => {
    const html = dock(
      render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialVideoTime: 2473.4,
      }),
    );
    const handle = tag(html, "data-dock-handle");
    expect(handle).toMatch(/class="[^"]*touch-none[^"]*cursor-grab/);
    expect(html).toContain("lucide-grip-vertical");
    // s-return, the second live stroke (the tombstone is not counted).
    expect(text(html)).toContain("Point 1 · shot 2");
    expect(tag(html, 'aria-label="Minimise the video"')).toContain(
      'type="button"',
    );
  });

  test("with nothing playing the bar just says Video", () => {
    const html = dock(render({ session: labelSessionFixture(), video: VIDEO }));
    const bar = html.slice(html.indexOf("data-dock-now-playing"));
    expect(text(bar.slice(0, bar.indexOf("</span>")))).toContain("Video");
  });

  test("minimised, it is a pill in its corner and the player stays mounted", () => {
    const html = dock(
      render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialVideoTime: 2490.5,
        initialVideoMinimised: true,
      }),
    );
    const box = tag(html, 'data-label-dock=""');
    expect(box).toContain('data-dock-minimised="true"');
    expect(box).toContain('tabindex="-1"');

    const card = tag(html, "data-dock-card");
    expect(card).toContain('aria-hidden="true"');
    expect(card).toMatch(/class="[^"]*pointer-events-none invisible/);
    // Hidden, not unmounted: playback carries on behind the pill.
    expect(html).toContain('data-testid="label-video"');

    const pill = tag(html, "data-dock-pill");
    expect(pill).not.toContain("aria-hidden");
    expect(pill).toMatch(/class="[^"]*bottom-0 right-0/);
    expect(pill).toContain("transform-origin:bottom right");
    const pillHtml = html.slice(html.indexOf("data-dock-pill"));
    expect(pillHtml).toContain('aria-label="Play"');
    expect(pillHtml).toContain('aria-label="Expand the video"');
    expect(text(pillHtml)).toContain("Point 2");
  });

  test("motion: fast in, faster out, and none of the scale under reduced motion", () => {
    const expanded = dock(
      render({ session: labelSessionFixture(), video: VIDEO }),
    );
    const card = tag(expanded, "data-dock-card");
    expect(card).toContain("transition-[opacity,scale] duration-[220ms]");
    expect(card).toContain("duration-[220ms]");
    expect(card).toContain("motion-reduce:scale-100");
    expect(card).toContain("transform-origin:bottom right");
    // Out is faster, and only the outgoing half keeps `visibility` on its
    // transition, so it stays drawn while it fades.
    expect(tag(expanded, "data-dock-pill")).toContain(
      "transition-[opacity,scale,visibility] duration-[160ms]",
    );

    const lift = tag(expanded, "data-dock-lift");
    expect(lift).toContain("transition-[scale,box-shadow]");
    expect(lift).toContain("motion-reduce:scale-100");
    expect(lift).not.toContain("scale-[1.015]");

    // The corner glide is the film room's, which drops to a jump under
    // reduced motion; it goes on once the dock has been placed.
    const { SETTLE_CLASS } = createLoader().load(
      "src/components/dashboard/matches/match-detail/film/use-corner-drag.ts",
    ) as { SETTLE_CLASS: string };
    expect(SETTLE_CLASS).toContain("duration-[360ms]");
    expect(SETTLE_CLASS).toContain("ease-[var(--ease-out-expo)]");
    expect(SETTLE_CLASS).toContain("motion-reduce:transition-none");
    const source = readFileSync(
      path.resolve("src/components/admin/labels/label-video-dock.tsx"),
      "utf8",
    );
    expect(source).toContain("!move.free && move.placed && SETTLE_CLASS");
  });
});

test.describe("viewport fit (T19)", () => {
  /** The opening tag carrying `attr`. */
  function tagOf(html: string, attr: string): string {
    const at = html.indexOf(attr);
    expect(at, attr).toBeGreaterThan(-1);
    return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
  }

  test("one root, a flex column that fills what the page gives it", () => {
    const html = render({ session: labelSessionFixture(), video: null });
    expect(html.startsWith("<div data-label-console")).toBe(true);
    expect(count(html, /data-label-console/g)).toBe(1);
    const root = tagOf(html, "data-label-console");
    for (const cls of ["flex", "min-h-0", "flex-1", "flex-col"]) {
      expect(root).toMatch(new RegExp(`class="[^"]*\\b${cls}\\b`));
    }
    // The header and its save line sit above the table.
    expect(html.indexOf("<h1")).toBeLessThan(
      html.indexOf("data-label-scroller"),
    );
  });

  test("the table card is the scroller, both ways", () => {
    const html = render({ session: labelSessionFixture(), video: null });
    expect(count(html, /data-label-scroller/g)).toBe(1);
    const scroller = tagOf(html, "data-label-scroller");
    for (const cls of [
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
      "overflow-x-auto",
    ]) {
      expect(scroller, cls).toContain(cls);
    }
    // Every row is inside it.
    expect(html.indexOf('data-row="point"')).toBeGreaterThan(
      html.indexOf("data-label-scroller"),
    );
  });

  test("the point header sticks to the scroller's top, on the card's ground", () => {
    const html = render({ session: labelSessionFixture(), video: null });
    const at = html.indexOf("data-label-point-header");
    expect(at).toBeGreaterThan(html.indexOf("data-label-scroller"));
    expect(at).toBeLessThan(html.indexOf('data-row="point"'));
    const header = tagOf(html, "data-label-point-header");
    expect(header).toMatch(/class="[^"]*\bsticky\b[^"]*\btop-0\b/);
    expect(header).toMatch(/class="[^"]*\bz-10\b/);
    expect(header).toContain("bg-[var(--surface-card)]");
    // It names the columns.
    expect(text(html.slice(at, html.indexOf('data-row="point"')))).toContain(
      "How it ended",
    );
  });

  test("the stuck header's height is the one the follow scroll takes off", () => {
    const { POINT_HEADER_HEIGHT } = createLoader().load(
      "src/components/admin/labels/label-points-table.tsx",
    ) as { POINT_HEADER_HEIGHT: number };
    const html = render({ session: labelSessionFixture(), video: null });
    const at = html.indexOf("data-label-point-header");
    expect(html.slice(at, at + 400)).toContain(
      `min-h-[${POINT_HEADER_HEIGHT}px]`,
    );
  });

  test("the page bounds main to the viewport under the header", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/app/admin/labels/[sessionId]/page.tsx"),
      "utf8",
    );
    expect(source).toContain(
      'className="h-[calc(100dvh-var(--header-h))] overflow-hidden pb-6"',
    );
  });
});

test.describe("the Now playing pill", () => {
  /** The pill's opening tag. */
  function pill(html: string): string {
    const at = html.indexOf("data-label-follow-pill");
    expect(at).toBeGreaterThan(-1);
    return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
  }

  test("held while a point plays: the film room's words, over the table's top-centre", () => {
    const html = render({
      session: labelSessionFixture(),
      video: null,
      initialPointFocus: { mode: "held", pointId: FIXTURE_POINT_IDS.P1 },
      initialVideoTime: 2490.5,
    });
    const tag = pill(html);
    expect(tag).toContain('type="button"');
    // The table's own number, as the dock bar prints it.
    expect(tag).toContain(
      'aria-label="Now playing: point 2 — follow playback"',
    );
    expect(text(html.slice(html.indexOf("data-label-follow-pill")))).toContain(
      "Now playing · Point 2",
    );
    // Not in the table's flow and not on the viewport (T19): pinned over the
    // scroller, clear of the dock's corner and above its layer.
    expect(tag).toMatch(
      /class="[^"]*\babsolute\b[^"]*\btop-12\b[^"]*\bleft-1\/2\b/,
    );
    expect(tag).not.toMatch(/class="[^"]*\bfixed\b/);
    // Its positioning context is the wrapper around the scroller, which
    // comes first inside it.
    const wrapper = html.lastIndexOf(
      "<div",
      html.indexOf("data-label-scroller") - 1,
    );
    const context = html.lastIndexOf("<div", wrapper - 1);
    const contextTag = html.slice(
      html.lastIndexOf("<div", context - 1),
      html.indexOf(">", context) + 1,
    );
    expect(contextTag).toMatch(/class="[^"]*\brelative\b/);
    expect(html.indexOf("data-label-follow-pill")).toBeGreaterThan(
      html.indexOf("data-label-scroller"),
    );
    expect(tag).toMatch(/class="[^"]*\bz-50\b/);
    expect(tag).toContain("film-follow-pill-in");
    expect(tag).toContain("shadow-[var(--shadow-floating)]");
  });

  test("held on the playing point itself still gets one (T24)", () => {
    const html = render({
      session: labelSessionFixture(),
      video: null,
      initialPointFocus: { mode: "held", pointId: FIXTURE_POINT_IDS.P2 },
      initialVideoTime: 2490.5,
    });
    expect(html).toContain("data-label-follow-pill");
    expect(html).toContain(`data-shots-for="${FIXTURE_POINT_IDS.P2}"`);
  });

  test("absent while following", () => {
    for (const initialPointFocus of [undefined, { mode: "follow" } as const]) {
      const html = render({
        session: labelSessionFixture(),
        video: null,
        initialPointFocus,
        initialVideoTime: 2490.5,
      });
      expect(html).not.toContain("data-label-follow-pill");
    }
  });

  test("absent in dead time, and before the video moves", () => {
    for (const initialVideoTime of [undefined, null, 100, 2480, 9999]) {
      const html = render({
        session: labelSessionFixture(),
        video: null,
        initialPointFocus: { mode: "held", pointId: FIXTURE_POINT_IDS.P1 },
        initialVideoTime,
      });
      expect(html, String(initialVideoTime)).not.toContain(
        "data-label-follow-pill",
      );
      // Held keeps its point open with nothing playing.
      expect(html).toContain(`data-shots-for="${FIXTURE_POINT_IDS.P1}"`);
    }
  });

  test("following with nothing playing keeps the resting point open", () => {
    // Before the video moves: the first point still to check, as before.
    const html = render({
      session: labelSessionFixture(),
      video: null,
      initialVideoTime: 2480,
    });
    expect(html).toContain(`data-shots-for="${FIXTURE_POINT_IDS.P1}"`);
    expect(html).toMatch(/data-court-title="[^"]*"[^>]*>Point 1</);
  });
});

test("no labels component reads a flags field", () => {
  const dir = path.resolve("src/components/admin/labels");
  for (const file of readdirSync(dir)) {
    const source = readFileSync(path.join(dir, file), "utf8");
    expect(source, file).not.toMatch(/\bflags\b/i);
  }
});

test.describe("editing (T6)", () => {
  test("every value cell is text until hovered or selected", () => {
    const html = render({
      session: labelSessionFixture(),
      video: null,
      initialExpandedPointId: FIXTURE_POINT_IDS.P1,
      ...SAVES,
    });
    // An open point with three strokes, and not one form control.
    expect(count(html, /data-row="shot"/g)).toBe(3);
    expect(count(html, EDITORS)).toBe(0);
    // Each cell is a keyboard stop that names what it edits.
    expect(html).toContain('aria-label="Point 1 ending: Error"');
    expect(html).toContain('aria-label="Point 1 note: None"');
    expect(html).toContain('aria-label="Shot 2 stroke: Backhand"');
    expect(html).toContain('aria-label="Shot 2 spin: Topspin"');
    expect(html).toContain('aria-label="Shot 3 spin: Not set"');
    expect(html).toContain('aria-label="Shot 1 hit at: -0.80, -0.32"');
    expect(count(html, /role="button" tabindex="0"/g)).toBeGreaterThanOrEqual(
      // Two per point (ending, note); six per stroke — time, player,
      // stroke, spin, hit at, landed at. Placement and Result are not stops.
      3 * 2 + 3 * 6,
    );
  });

  test("the selected stroke's row mounts its editors, and only that row", () => {
    const html = render({
      session: labelSessionFixture(),
      video: null,
      initialExpandedPointId: FIXTURE_POINT_IDS.P1,
      initialSelectedShotId: "s-return",
      ...SAVES,
    });
    const selected = rowMarkup(html, 'data-shot-id="s-return"');
    expect(selected).toContain("data-selected");
    // Player, stroke and spin as the design system's menu — a button that
    // opens one, showing the value — and time, hit at, landed at as inputs.
    // The result follows the coordinates: it is text, never a dropdown.
    expect(html).not.toContain("<select");
    expect(count(selected, /data-select-editor/g)).toBe(3);
    expect(count(selected, /<input/g)).toBe(3);
    expect(selected).not.toContain('aria-label="Shot 2 result"');
    expect(selected).toMatch(/data-calculated="result"[^>]*>In</);
    expect(selected).toMatch(/data-calculated="placement"[^>]*>Crosscourt</);
    for (const [name, value] of [
      ["player", "Vargas"],
      ["stroke", "Backhand"],
      ["spin", "Topspin"],
    ]) {
      expect(selected, name).toMatch(
        new RegExp(
          `<button[^>]*aria-label="Shot 2 ${name}"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"[^>]*><span[^>]*>${value}</span>`,
        ),
      );
    }

    expect(count(rowMarkup(html, 'data-shot-id="s-serve"'), EDITORS)).toBe(0);
    expect(count(rowMarkup(html, 'data-shot-id="s-added"'), EDITORS)).toBe(0);
    expect(
      count(
        rowMarkup(html, `data-point-id="${FIXTURE_POINT_IDS.P1}"`),
        EDITORS,
      ),
    ).toBe(0);
    expect(count(html, EDITORS)).toBe(6);
  });

  test("selecting a stroke zooms the court to the hitter's half", () => {
    const html = render({
      session: labelSessionFixture(),
      video: null,
      initialExpandedPointId: FIXTURE_POINT_IDS.P1,
      initialSelectedShotId: "s-return",
      ...SAVES,
    });
    // The return was hit from the far side (contact_y 24.49): the far half,
    // run-off and all, is the control.
    expect(html).toMatch(/<button[^>]*data-court-target/);
    expect(html).toContain('data-court-view="far"');
    expect(html).toContain('viewBox="-10.085 -3.5 20.17 16.224"');
    expect(html).not.toContain('viewBox="-7.265 -4.5 14.53 32.77"');
    expect(html).toMatch(/aria-label="Click where shot 2 was hit\. /);
    expect(html).toMatch(/data-court-title="[^"]*"[^>]*>Shot 2 · contact</);
    expect(html).toMatch(/data-court-subtitle="[^"]*"[^>]*>Vargas’s side</);
    // The end the click places is ringed: the contact, not the landing.
    expect(count(html, /data-selected-ring="contact"/g)).toBe(1);
    expect(count(html, /data-selected-ring/g)).toBe(1);

    // The Contact / Landing switch, on Contact; Flip side, not pressed.
    expect(html).toMatch(/role="group" aria-label="What you are placing"/);
    expect(html).toMatch(
      /aria-pressed="true" data-court-step="contact"[^>]*>Contact</,
    );
    expect(html).toMatch(
      /aria-pressed="false" data-court-step="landing"[^>]*>Landing</,
    );
    expect(html).toMatch(/aria-pressed="false" data-court-flip=""/);
    expect(html).not.toContain("data-court-legend");

    // The serve was hit from the near side: the near half.
    const serve = render({
      session: labelSessionFixture(),
      video: null,
      initialExpandedPointId: FIXTURE_POINT_IDS.P1,
      initialSelectedShotId: "s-serve",
      ...SAVES,
    });
    expect(serve).toContain('viewBox="-10.085 11.046 20.17 16.224"');
    expect(serve).toContain('data-court-view="near"');

    const none = render({
      session: labelSessionFixture(),
      video: null,
      initialExpandedPointId: FIXTURE_POINT_IDS.P1,
      ...SAVES,
    });
    expect(none).not.toContain("data-court-target");
    expect(none).not.toContain("Click where");
    expect(none).toContain('viewBox="-7.265 -4.5 14.53 32.77"');
    expect(none).not.toContain("16.224");
    expect(none).not.toContain("data-court-steps");
  });

  test("without a way to save, the console is read-only", () => {
    const html = render({
      session: labelSessionFixture(),
      video: null,
      initialExpandedPointId: FIXTURE_POINT_IDS.P1,
      initialSelectedShotId: "s-return",
    });
    expect(count(html, EDITORS)).toBe(0);
    expect(html).not.toContain('role="button" tabindex="0"');
    // Read-only: the whole court, nothing to click, no switch.
    expect(html).not.toContain("data-court-target");
    expect(html).toContain('data-court-view="whole"');
    expect(html).not.toContain("data-court-steps");
  });

  test("a complete session is read-only too", () => {
    const html = render({
      session: { ...labelSessionFixture(), status: "complete" },
      video: null,
      initialExpandedPointId: FIXTURE_POINT_IDS.P1,
      initialSelectedShotId: "s-return",
      ...SAVES,
    });
    expect(count(html, EDITORS)).toBe(0);
    expect(text(html)).toContain("· Complete");
  });

  test("the header carries the progress and the save line, and no Save button", () => {
    const html = render({
      session: labelSessionFixture(),
      video: null,
      ...SAVES,
    });
    const out = text(html);
    expect(out).toContain("Label match · Jordan Lee vs Elena Vargas");
    expect(out).toContain("1 of 3 points checked");
    expect(out).toContain("derivation 0.3.2");
    expect(html).toContain('data-save-status="idle"');
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*\bSave\b/);

    const page = readFileSync(
      path.resolve("src/app/admin/labels/[sessionId]/page.tsx"),
      "utf8",
    );
    expect(page).not.toMatch(/>\s*Save\s*</);
  });

  test("the save line reads Saved · just now, or the error", () => {
    const { LabelSaveStatus } = createLoader().load(
      "src/components/admin/labels/label-save-status.tsx",
    ) as {
      LabelSaveStatus: React.ComponentType<{ status: unknown; now?: number }>;
    };
    const at = 1_000_000;
    const saved = renderToStaticMarkup(
      React.createElement(LabelSaveStatus, {
        status: { pending: 0, last: { kind: "saved", at } },
        now: at + 1_000,
      }),
    );
    expect(saved).toContain('data-save-status="saved"');
    expect(text(saved)).toBe("Saved · just now");

    const failed = renderToStaticMarkup(
      React.createElement(LabelSaveStatus, {
        status: {
          pending: 0,
          last: { kind: "error", message: "write refused" },
        },
        now: at,
      }),
    );
    expect(failed).toContain('role="alert"');
    expect(text(failed)).toBe("Not saved · write refused");
  });
});

test.describe("the playing row", () => {
  const PLAYING = /data-playing="true"/g;

  test("marks the point and the stroke the video is on", () => {
    const html = render({
      session: labelSessionFixture(),
      video: null,
      initialExpandedPointId: FIXTURE_POINT_IDS.P1,
      // Between the return (2473.1) and the added forehand (2474.4).
      initialVideoTime: 2473.4,
      ...SAVES,
    });
    expect(count(html, PLAYING)).toBe(2);
    expect(
      rowMarkup(html, `data-point-id="${FIXTURE_POINT_IDS.P1}"`),
    ).toContain('data-playing="true"');
    const playing = rowMarkup(html, 'data-shot-id="s-return"');
    expect(playing).toContain('data-playing="true"');
    expect(playing).toContain("data-playing-mark");
    expect(text(playing)).toContain("2 , playing 41:13.1 Vargas");
    expect(rowMarkup(html, 'data-shot-id="s-serve"')).not.toContain(
      "data-playing",
    );
    expect(rowMarkup(html, 'data-shot-id="s-added"')).not.toContain(
      "data-playing",
    );
    // A mark, not a selection: nothing is selected and no editor mounts.
    expect(html).not.toContain("data-selected");
    expect(count(html, EDITORS)).toBe(0);
  });

  test("following, the playing point is the open one", () => {
    const html = render({
      session: labelSessionFixture(),
      video: null,
      initialExpandedPointId: FIXTURE_POINT_IDS.P1,
      // Point 2's ace.
      initialVideoTime: 2490.5,
    });
    // The point row and, unfolded under it, the playing stroke.
    expect(count(html, PLAYING)).toBe(2);
    expect(
      rowMarkup(html, `data-point-id="${FIXTURE_POINT_IDS.P2}"`),
    ).toContain('data-playing="true"');
    expect(rowMarkup(html, 'data-shot-id="s-ace"')).toContain(
      'data-playing="true"',
    );
    // Point 1 folds away; the court moves with the video.
    expect(html).toContain(`data-shots-for="${FIXTURE_POINT_IDS.P2}"`);
    expect(html).not.toContain(`data-shots-for="${FIXTURE_POINT_IDS.P1}"`);
    expect(html).toMatch(/data-court-title="[^"]*"[^>]*>Point 2</);
    // The playing stroke is the lit one: "Shot 1 of 1 · <its hitter>".
    expect(html).toMatch(/data-court-subtitle="[^"]*"[^>]*>Shot 1 of 1 · /);
    // Following: nothing to return to, so no pill.
    expect(html).not.toContain("data-label-follow-pill");
    expect(text(html)).not.toContain("Now playing");
  });

  test("held, only the playing point is unfolded — a hold is about the scroll, not a second well", () => {
    const html = render({
      session: labelSessionFixture(),
      video: null,
      initialExpandedPointId: FIXTURE_POINT_IDS.P1,
      initialPointFocus: { mode: "held", pointId: FIXTURE_POINT_IDS.P1 },
      // Point 2's ace.
      initialVideoTime: 2490.5,
    });
    // The point row and its playing stroke.
    expect(count(html, PLAYING)).toBe(2);
    expect(
      rowMarkup(html, `data-point-id="${FIXTURE_POINT_IDS.P2}"`),
    ).toContain('data-playing="true"');
    // Point 2 is the current point: the one well, and the court, are its;
    // point 1 is folded. The way back to following is still offered.
    expect(html).not.toContain(`data-shots-for="${FIXTURE_POINT_IDS.P1}"`);
    expect(html).toContain(`data-shots-for="${FIXTURE_POINT_IDS.P2}"`);
    expect(count(html, /data-shots-for=/g)).toBe(1);
    expect(html).toMatch(/data-court-title="[^"]*"[^>]*>Point 2</);
    expect(html).toContain("data-label-follow-pill");
  });

  test("the rows offer no fold: a point's control goes to it, and the current one stays unfolded", () => {
    const html = render({
      session: labelSessionFixture(),
      video: null,
      initialExpandedPointId: FIXTURE_POINT_IDS.P1,
    });
    expect(html).not.toMatch(/data-point-go=""[^>]*aria-expanded/);
    expect(html).toMatch(/data-point-go=""[^>]*aria-label="Go to point 1"/);
    expect(html).not.toContain("Show shots for point");
    expect(html).not.toContain("Hide shots for point");
    expect(count(html, /data-shots-for=/g)).toBe(1);
  });

  test("the playing stroke can also be the selected one", () => {
    const html = render({
      session: labelSessionFixture(),
      video: null,
      initialExpandedPointId: FIXTURE_POINT_IDS.P1,
      initialSelectedShotId: "s-serve",
      initialVideoTime: 2472.0,
      ...SAVES,
    });
    const row = rowMarkup(html, 'data-shot-id="s-serve"');
    expect(row).toContain("data-selected");
    expect(row).toContain('data-playing="true"');
  });

  test("nothing is marked before the video moves, or in dead time", () => {
    for (const initialVideoTime of [undefined, null, 100, 2480, 9999]) {
      const html = render({
        session: labelSessionFixture(),
        video: null,
        initialExpandedPointId: FIXTURE_POINT_IDS.P1,
        initialVideoTime,
      });
      expect(count(html, PLAYING), String(initialVideoTime)).toBe(0);
      expect(html).not.toContain("data-playing-mark");
    }
  });

  test("held with nothing named, the playing point is still the current one", () => {
    const html = render({
      session: labelSessionFixture(),
      video: null,
      initialPointFocus: { mode: "held", pointId: null },
      initialVideoTime: 2490.5,
    });
    expect(count(html, PLAYING)).toBe(2);
    expect(html).toContain(`data-shots-for="${FIXTURE_POINT_IDS.P2}"`);
    expect(html).not.toContain(`data-shots-for="${FIXTURE_POINT_IDS.P1}"`);
    // The court follows the current point, whatever is held.
    expect(html).toMatch(/data-court-title="[^"]*"[^>]*>Point 2</);
    // The way back is still there.
    expect(html).toContain("data-label-follow-pill");
  });

  // T21: the points rail's 2px blue rule, on the playing point row only.
  test.describe("the progress rule", () => {
    const RULE = /h-0\.5 bg-\[var\(--blue\)\]/g;
    const ruleOf = (row: string) =>
      row.match(
        /<span aria-hidden="true" class="([^"]*h-0\.5 bg-\[var\(--blue\)\][^"]*)" style="width:([^"]*)"/,
      );

    test("the playing row draws it from the film's clock", () => {
      const html = render({
        session: labelSessionFixture(),
        video: null,
        initialPointFocus: { mode: "held", pointId: null },
        // Inside P1: its serve is at 2472.0.
        initialVideoTime: 2473.4,
      });
      expect(count(html, RULE)).toBe(1);
      const row = rowMarkup(html, `data-point-id="${FIXTURE_POINT_IDS.P1}"`);
      expect(row).toContain('data-playing="true"');
      // The row is the rule's positioning context.
      expect(row).toMatch(/class="[^"]*\brelative\b[^"]*"/);
      const rule = ruleOf(row);
      expect(rule).not.toBeNull();
      // The rail's classes, whole.
      expect(rule![1]).toBe("absolute bottom-0 left-0 h-0.5 bg-[var(--blue)]");
      expect(
        rule![2].startsWith("clamp(0%, calc((var(--film-t, 0) - 2472)"),
      ).toBe(true);
    });

    test("the window is on the FILE clock: the video's offset comes off", () => {
      const html = render({
        session: labelSessionFixture(),
        video: {
          url: "https://example.test/v.mp4?sig=x",
          startTimeSeconds: 2000,
        },
        initialPointFocus: { mode: "held", pointId: null },
        initialVideoTime: 2473.4,
      });
      const rule = ruleOf(
        rowMarkup(html, `data-point-id="${FIXTURE_POINT_IDS.P1}"`),
      );
      expect(
        rule![2].startsWith("clamp(0%, calc((var(--film-t, 0) - 472)"),
      ).toBe(true);
    });

    test("a row that is not playing has none", () => {
      const html = render({
        session: labelSessionFixture(),
        video: null,
        initialPointFocus: { mode: "held", pointId: null },
        initialVideoTime: 2473.4,
      });
      const rows = html
        .split('data-row="point"')
        .slice(1)
        .filter((row) => !row.includes('data-playing="true"'));
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(count(row, RULE)).toBe(0);
    });

    test("none in dead time, or before the video moves", () => {
      for (const initialVideoTime of [undefined, null, 100, 2480, 9999]) {
        const html = render({
          session: labelSessionFixture(),
          video: null,
          initialExpandedPointId: FIXTURE_POINT_IDS.P1,
          initialVideoTime,
        });
        expect(count(html, RULE), String(initialVideoTime)).toBe(0);
      }
    });

    test("the table draws none without a window to fill", () => {
      const { LabelPointsTable } = createLoader().load(
        "src/components/admin/labels/label-points-table.tsx",
      ) as { LabelPointsTable: React.ComponentType<Record<string, unknown>> };
      const session = labelSessionFixture();
      const table = (playingWindow?: { start: number; end: number }) =>
        renderToStaticMarkup(
          React.createElement(LabelPointsTable, {
            points: session.points,
            names: { p1: "Lee", p2: "Vargas" },
            expandedPointId: null,
            playingPointId: FIXTURE_POINT_IDS.P1,
            playingWindow,
          }),
        );
      expect(count(table(), RULE)).toBe(0);
      expect(count(table({ start: 10, end: 14 }), RULE)).toBe(1);
      expect(table({ start: 10, end: 14 })).toContain(
        "width:clamp(0%, calc((var(--film-t, 0) - 10) / 4 * 100%), 100%)",
      );
    });

    test("one clock: the film's hook, and no frame loop of the console's own", () => {
      const dir = path.join(process.cwd(), "src/components/admin/labels");
      for (const file of readdirSync(dir)) {
        const source = readFileSync(path.join(dir, file), "utf8");
        expect(source, file).not.toContain("requestAnimationFrame");
      }
      const player = readFileSync(path.join(dir, "label-video.tsx"), "utf8");
      expect(count(player, /useFilmClockVars\(/g)).toBe(2);
    });
  });

  test("the table draws whatever rows it is told are playing", () => {
    const { LabelPointsTable } = createLoader().load(
      "src/components/admin/labels/label-points-table.tsx",
    ) as { LabelPointsTable: React.ComponentType<Record<string, unknown>> };
    const session = labelSessionFixture();
    const html = renderToStaticMarkup(
      React.createElement(LabelPointsTable, {
        points: session.points,
        names: { p1: "Lee", p2: "Vargas" },
        expandedPointId: FIXTURE_POINT_IDS.P1,
        playingPointId: FIXTURE_POINT_IDS.P1,
        playingShotId: "s-added",
      }),
    );
    expect(count(html, PLAYING)).toBe(2);
    expect(rowMarkup(html, 'data-shot-id="s-added"')).toContain(
      'data-playing="true"',
    );
    expect(rowMarkup(html, 'data-shot-id="s-return"')).not.toContain(
      "data-playing",
    );
  });
});

test.describe("layout modes (T24)", () => {
  const VIDEO = {
    url: "https://example.test/v.mp4?sig=x",
    startTimeSeconds: 0,
  };

  /** The opening tag carrying `attr`. */
  function tagOf(html: string, attr: string): string {
    const at = html.indexOf(attr);
    expect(at, attr).toBeGreaterThan(-1);
    return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
  }

  /** The dock band or column: from its marker to the table's scroller or the end. */
  function dockOf(html: string, mode: "top" | "side"): string {
    const start = html.indexOf(`data-label-dock="${mode}"`);
    expect(start, mode).toBeGreaterThan(-1);
    const from = html.lastIndexOf("<", start);
    // Docked top: the band ends where the table begins. Docked side: the
    // column comes after the table, so it runs to the render's end (before
    // the confirm dialog, which a read-only render has none of).
    const scroller = html.indexOf("data-label-scroller", start);
    return html.slice(from, scroller === -1 ? undefined : scroller);
  }

  test("the header carries one Layout menu trigger, the current mode on it", () => {
    const html = render({ session: labelSessionFixture(), video: VIDEO });
    const trigger = tagOf(html, 'data-label-layout=""');
    expect(trigger).toContain('type="button"');
    expect(trigger).toContain('aria-haspopup="menu"');
    expect(trigger).toContain('aria-expanded="false"');
    expect(trigger).toContain('data-layout-mode="overlay"');
    expect(trigger).toContain('aria-label="Layout: Overlay"');
    expect(count(html, /data-label-layout=""/g)).toBe(1);
    // Beside the save line, in the header's trailing cluster.
    expect(html.indexOf('data-label-layout=""')).toBeGreaterThan(
      html.indexOf("data-save-status"),
    );
    expect(html.indexOf('data-label-layout=""')).toBeLessThan(
      html.indexOf("data-label-scroller"),
    );
    // No native tooltip anywhere on it.
    expect(trigger).not.toMatch(/\stitle=/);

    const side = render({
      session: labelSessionFixture(),
      video: VIDEO,
      initialLayoutMode: "docked-side",
    });
    expect(tagOf(side, 'data-label-layout=""')).toContain(
      'data-layout-mode="docked-side"',
    );
    expect(tagOf(side, 'data-label-layout=""')).toContain(
      'aria-label="Layout: Docked side"',
    );
  });

  test("overlay: today's floating cards, and nothing docked", () => {
    for (const html of [
      render({ session: labelSessionFixture(), video: VIDEO }),
      render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode: "overlay",
      }),
    ]) {
      expect(html).not.toMatch(/data-label-dock="(top|side)"/);
      expect(tagOf(html, "data-label-console")).toContain(
        'data-label-layout-mode="overlay"',
      );
      // Both floating layers, each in its default corner, the court's last.
      expect(tagOf(html, 'data-label-dock=""')).toContain(
        'data-dock-anchor="bottom-right"',
      );
      expect(tagOf(html, "data-label-court-dock")).toContain(
        'data-dock-anchor="bottom-left"',
      );
      expect(html.indexOf("data-label-court-layer")).toBeGreaterThan(
        html.indexOf("data-label-dock-layer"),
      );
      expect(html).toContain('aria-label="Minimise the video"');
      expect(html).toContain('aria-label="Minimise the court"');
      // The video's own frame, once, inside the floating dock.
      expect(count(html, /data-label-video-frame/g)).toBe(1);
      expect(html.indexOf("data-label-video-frame")).toBeGreaterThan(
        html.indexOf("data-label-dock-layer"),
      );
    }
  });

  test("docked top: a band above the table holding the player and the court panel", () => {
    const html = render({
      session: labelSessionFixture(),
      video: VIDEO,
      initialLayoutMode: "docked-top",
      initialVideoTime: 2473.4,
    });
    expect(tagOf(html, "data-label-console")).toContain(
      'data-label-layout-mode="docked-top"',
    );
    const band = dockOf(html, "top");
    expect(tagOf(band, 'data-label-dock="top"')).toContain("height:318px");
    expect(band).toContain("data-label-video-frame");
    expect(band).toContain('data-testid="label-video"');
    expect(band).toContain("data-court-art");
    expect(band).toContain('data-court-view="whole"');
    // The video before the court, side by side; the court card at its
    // floating width.
    expect(band.indexOf("data-label-dock-video")).toBeLessThan(
      band.indexOf("data-label-dock-court"),
    );
    expect(tagOf(band, "data-label-dock-video")).toMatch(
      /class="[^"]*\baspect-video\b[^"]*\bh-full\b/,
    );
    expect(tagOf(band, "data-label-dock-court")).toContain("width:300px");
    // The transport stays; the floating shell does not.
    expect(band).toContain('aria-label="Previous point"');
    expect(band).toContain('role="slider"');
    expect(text(band)).toContain("Error · Forehand");
    expect(text(band)).toContain("Point 1 / 4");
    expect(html).not.toContain("data-dock-minimised");
    expect(html).not.toContain("data-label-dock-layer");
    expect(html).not.toContain("data-label-court-layer");
    expect(html).not.toContain("data-court-handle");
    expect(html).not.toContain('aria-label="Minimise the video"');
    expect(html).not.toContain('aria-label="Minimise the court"');
    expect(html).not.toContain("lucide-grip-vertical");
    // Above the table, which keeps the rest and scrolls.
    expect(html.indexOf('data-label-dock="top"')).toBeLessThan(
      html.indexOf("data-label-scroller"),
    );
    expect(tagOf(html, "data-label-scroller")).toMatch(
      /class="[^"]*\bmin-h-0\b[^"]*\bflex-1\b/,
    );
    // The court header reads the playing stroke, as the floating card does.
    expect(band).toMatch(/data-court-title="[^"]*"[^>]*>Point 1</);
    expect(band).toMatch(/data-court-subtitle="[^"]*"[^>]*>Shot 2 of 3 · /);
  });

  test("docked side: a column beside the table, the player over the court", () => {
    const html = render({
      session: labelSessionFixture(),
      video: VIDEO,
      initialLayoutMode: "docked-side",
    });
    expect(tagOf(html, "data-label-console")).toContain(
      'data-label-layout-mode="docked-side"',
    );
    const column = dockOf(html, "side");
    const open = tagOf(column, 'data-label-dock="side"');
    expect(open).toContain("width:480px");
    expect(open).toMatch(/class="[^"]*\bflex-col\b/);
    // The clamp is the column's only cap: no second limit in the markup.
    expect(open).not.toContain("max-w-");
    expect(column).toContain("data-label-video-frame");
    expect(column).toContain("data-court-art");
    expect(column.indexOf("data-label-dock-video")).toBeLessThan(
      column.indexOf("data-label-dock-court"),
    );
    expect(tagOf(column, "data-label-dock-video")).toMatch(
      /class="[^"]*\bw-full\b/,
    );
    expect(tagOf(column, "data-label-dock-court")).toMatch(
      /class="[^"]*\bmin-h-0\b[^"]*\bflex-1\b/,
    );
    expect(html).not.toContain("data-dock-minimised");
    expect(html).not.toContain("data-label-dock-layer");
    expect(html).not.toContain("data-label-court-layer");
    // The table comes first, on the left, and narrows rather than pushing.
    expect(html.indexOf("data-label-scroller")).toBeLessThan(
      html.indexOf('data-label-dock="side"'),
    );
    expect(count(html, /data-label-video-frame/g)).toBe(1);
  });

  test("a selected shot in a docked mode still zooms the court to its half", () => {
    for (const mode of ["docked-top", "docked-side"] as const) {
      const html = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode: mode,
        initialExpandedPointId: FIXTURE_POINT_IDS.P1,
        initialSelectedShotId: "s-return",
        ...SAVES,
      });
      const dock = dockOf(html, mode === "docked-top" ? "top" : "side");
      expect(dock, mode).toMatch(/data-court-view="(near|far)"/);
      expect(dock, mode).toMatch(/<button[^>]*data-court-target/);
      expect(dock, mode).toContain("data-court-steps");
      expect(dock, mode).toMatch(
        /data-court-title="[^"]*"[^>]*>Shot 2 · contact</,
      );
      // The card wears the blue outline while placing, as the floating one does.
      expect(tagOf(dock, "data-label-dock-court"), mode).toContain(
        'data-court-placing="true"',
      );
      expect(tagOf(dock, "data-label-dock-court"), mode).toContain(
        "shadow-[0_0_0_1.5px_var(--blue)",
      );
    }
  });

  test("without a video, a docked mode still frames the quiet placeholder", () => {
    const html = render({
      session: labelSessionFixture(),
      video: null,
      initialLayoutMode: "docked-top",
    });
    const band = dockOf(html, "top");
    expect(band).not.toContain("<video");
    expect(text(band)).toContain("No video for this job");
    expect(band).toContain("data-court-art");
  });

  test.describe("the divider (T25)", () => {
    test("docked top: a horizontal separator between the band and the table, the band as tall as asked", () => {
      const html = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode: "docked-top",
        initialDockSize: 402,
      });
      expect(count(html, /role="separator"/g)).toBe(1);
      const separator = tagOf(html, 'role="separator"');
      expect(separator).toContain('aria-orientation="horizontal"');
      expect(separator).toContain('aria-valuenow="402"');
      expect(separator).toContain('aria-valuemin="240"');
      expect(separator).toMatch(/aria-valuemax="\d+"/);
      expect(separator).toContain('aria-label="Resize video and court"');
      expect(separator).toContain('tabindex="0"');
      expect(separator).toContain('data-label-divider="docked-top"');
      expect(separator).toMatch(/class="[^"]*\bcursor-row-resize\b/);
      // An 8px grab area in the 16px gap, never a native drag or tooltip.
      expect(separator).toMatch(/class="[^"]*\bmy-1\b[^"]*\bh-2\b/);
      expect(separator).not.toContain("draggable");
      expect(separator).not.toMatch(/\stitle=/);
      // The band's height is that one number, inline.
      expect(tagOf(html, 'data-label-dock="top"')).toContain("height:402px");
      // Band, then the divider, then the table — which takes the rest.
      const at = html.indexOf('role="separator"');
      expect(at).toBeGreaterThan(html.indexOf('data-label-dock="top"'));
      expect(at).toBeGreaterThan(html.indexOf("data-label-dock-court"));
      expect(at).toBeLessThan(html.indexOf("data-label-scroller"));
      expect(tagOf(html, "data-label-scroller")).toMatch(
        /class="[^"]*\bmin-h-0\b[^"]*\bflex-1\b/,
      );
      // A hairline at rest, blue once focused.
      const line = html.slice(at, html.indexOf("</div>", at));
      expect(line).toContain("bg-[var(--border-hairline)]");
      expect(line).toContain("group-focus-visible:bg-[var(--blue)]");
    });

    test("docked side: a vertical separator between the table and the column, the column as wide as asked", () => {
      const html = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode: "docked-side",
        initialDockSize: 612,
      });
      expect(count(html, /role="separator"/g)).toBe(1);
      const separator = tagOf(html, 'role="separator"');
      expect(separator).toContain('aria-orientation="vertical"');
      expect(separator).toContain('aria-valuenow="612"');
      expect(separator).toContain('aria-valuemin="360"');
      expect(separator).toContain('data-label-divider="docked-side"');
      expect(separator).toMatch(/class="[^"]*\bcursor-col-resize\b/);
      expect(tagOf(html, 'data-label-dock="side"')).toContain("width:612px");
      const at = html.indexOf('role="separator"');
      expect(at).toBeGreaterThan(html.indexOf("data-label-scroller"));
      expect(at).toBeLessThan(html.indexOf('data-label-dock="side"'));
    });

    test("with no size given a docked mode is its default, and an asked size under the minimum is the minimum", () => {
      const top = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode: "docked-top",
      });
      expect(tagOf(top, 'role="separator"')).toContain('aria-valuenow="318"');
      expect(tagOf(top, 'data-label-dock="top"')).toContain("height:318px");

      const small = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode: "docked-side",
        initialDockSize: 100,
      });
      expect(tagOf(small, 'role="separator"')).toContain('aria-valuenow="360"');
      expect(tagOf(small, 'data-label-dock="side"')).toContain("width:360px");
    });

    test("overlay: no separator", () => {
      for (const html of [
        render({ session: labelSessionFixture(), video: VIDEO }),
        render({
          session: labelSessionFixture(),
          video: VIDEO,
          initialLayoutMode: "overlay",
          initialDockSize: 402,
        }),
      ]) {
        expect(html).not.toContain('role="separator"');
        expect(html).not.toContain("data-label-divider");
      }
    });

    test("the docked court scales to its panel; the floating card keeps its fixed art box", () => {
      const overlay = render({ session: labelSessionFixture(), video: VIDEO });
      const floating = tagOf(overlay, 'data-court-view="whole"');
      expect(floating).toMatch(/style="width:98\.4\d+px;height:222px"/);
      expect(floating).not.toContain("cqh");
      expect(tagOf(overlay, "data-court-box")).toMatch(
        /class="[^"]*\bh-\[222px\][^"]*\bshrink-0\b/,
      );
      expect(tagOf(overlay, "data-court-box")).not.toContain("container-type");

      for (const mode of ["docked-top", "docked-side"] as const) {
        const html = render({
          session: labelSessionFixture(),
          video: VIDEO,
          initialLayoutMode: mode,
        });
        // The box is the size container; the court is the largest 14.53 ×
        // 32.77 box that fits it — no fixed height to clip.
        expect(tagOf(html, "data-court-box"), mode).toMatch(
          /class="[^"]*\[container-type:size\][^"]*\bmin-h-0\b[^"]*\bflex-1\b/,
        );
        const court = tagOf(html, 'data-court-view="whole"');
        expect(court, mode).toContain(
          "width:min(100cqw, calc(100cqh * 0.4434))",
        );
        expect(court, mode).toMatch(/aspect-ratio:98\.43 ?\/ ?222/);
        expect(court, mode).not.toContain("height:222px");
      }

      // Placing, docked: the half's own 276 × 222 proportions, still a button.
      const placing = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode: "docked-top",
        initialExpandedPointId: FIXTURE_POINT_IDS.P1,
        initialSelectedShotId: "s-return",
        ...SAVES,
      });
      const target = tagOf(placing, "data-court-target");
      expect(target).toContain("width:min(100cqw, calc(100cqh * 1.2432))");
      expect(target).toMatch(/aspect-ratio:276\.00 ?\/ ?222/);
    });
  });

  test.describe("the full-screen black view (T33)", () => {
    /** The black layer's markup: from its marker to the confirm dialog or the end. */
    function blackOf(html: string): string {
      const start = html.indexOf('data-label-black=""');
      expect(start).toBeGreaterThan(-1);
      return html.slice(html.lastIndexOf("<", start));
    }

    /** The rail's markup, from its marker to the end of the layer. */
    function railOf(html: string): string {
      const black = blackOf(html);
      const start = black.indexOf('data-label-rail=""');
      expect(start).toBeGreaterThan(-1);
      return black.slice(black.lastIndexOf("<", start));
    }

    test("a fixed layer over the page: the film and court on the left, the rail on the right", () => {
      const html = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode: "black",
        initialRailWidth: 700,
        initialExpandedPointId: FIXTURE_POINT_IDS.P1,
      });
      expect(tagOf(html, "data-label-console")).toContain(
        'data-label-layout-mode="black"',
      );
      // The film room's own mechanism, inside the console's root — not a
      // portal — so `--film-t` reaches the rows.
      const layer = tagOf(html, 'data-label-black=""');
      expect(layer).toMatch(/class="[^"]*\bfixed\b[^"]*\binset-0\b/);
      expect(layer).toMatch(/class="[^"]*\bz-50\b/);
      expect(layer).toMatch(/class="[^"]*\bbg-black\b/);
      expect(html.indexOf('data-label-black=""')).toBeGreaterThan(
        html.indexOf("data-label-console"),
      );

      const black = blackOf(html);
      // The stage: the same player, then the court panel, bare on the black.
      expect(black).toContain("data-label-black-stage");
      expect(black).toContain("data-label-video-frame");
      expect(black).toContain('data-testid="label-video"');
      expect(black).toContain("data-court-art");
      expect(black).toContain('data-court-view="whole"');
      expect(black.indexOf("data-label-video-frame")).toBeLessThan(
        black.indexOf("data-label-black-court"),
      );
      // The film: 16:9, centred, and capped so the court always keeps two
      // fifths of the stage (320px at least) — the stage a size container.
      const film = tagOf(black, "data-label-black-video");
      expect(film).toMatch(/class="[^"]*\bmx-auto\b[^"]*\baspect-video\b/);
      expect(film).toMatch(/class="[^"]*\bmax-w-full\b/);
      expect(film).not.toMatch(/class="(?:[^"]* )?w-full\b/);
      expect(film).toContain(
        "width:min(100cqw, max(calc((100cqh - max(320px, 40cqh)) * 16 / 9), 213px))",
      );
      expect(tagOf(black, "data-label-black-stage")).toMatch(
        /class="[^"]*\[container-type:size\]/,
      );
      const court = tagOf(black, "data-label-black-court");
      expect(court).not.toContain("rounded-[var(--radius-card)]");
      expect(court).not.toContain("bg-[#1A1A1C]");
      expect(court).not.toContain("shadow-[var(--shadow-card)]");
      expect(tagOf(black, "data-court-box")).toMatch(
        /class="[^"]*\[container-type:size\][^"]*\bflex-1\b/,
      );
      expect(black).toContain("data-court-legend");
      // The transport stays with the player.
      expect(black).toContain('aria-label="Previous point"');
      expect(black).toContain('role="slider"');
      expect(count(html, /data-label-video-frame/g)).toBe(1);

      // The rail, as wide as asked, its handle on its left edge.
      const rail = railOf(html);
      expect(tagOf(rail, 'data-label-rail=""')).toContain("width:700px");
      expect(tagOf(rail, 'data-label-rail=""')).toMatch(
        /class="[^"]*\brelative\b/,
      );
      expect(tagOf(rail, 'data-label-rail=""')).toContain(
        "bg-[var(--surface-dark)]",
      );
      expect(count(html, /role="separator"/g)).toBe(1);
      const separator = tagOf(rail, 'role="separator"');
      expect(separator).toContain('aria-label="Resize the points list"');
      expect(separator).toContain('aria-orientation="vertical"');
      expect(separator).toContain('aria-valuenow="700"');
      expect(separator).toContain('aria-valuemin="520"');
      expect(separator).toContain('aria-valuemax="880"');
      expect(html).not.toContain('aria-label="Resize video and court"');
      expect(html).not.toContain("data-label-divider");

      // Nothing under the layer to Tab through: the console's own light
      // header is not drawn at all (the rail's header carries its facts and
      // the way out), and the page's chrome is made inert on mount.
      expect(html).not.toContain("data-console-header");
      expect(html).not.toContain("<h1");
      expect(html).not.toContain('data-label-layout=""');
      expect(html.startsWith("<div data-label-console")).toBe(true);
      expect(html.slice(html.indexOf(">") + 1).startsWith("<div")).toBe(true);
      expect(html.indexOf('data-label-black=""')).toBeLessThan(
        html.indexOf(">") + 1 + 200,
      );
      const view = readFileSync(
        "src/components/admin/labels/label-black-view.tsx",
        "utf8",
      );
      expect(view).toContain("ref={inertOutside}");
      expect(view).toContain("sibling.inert = true;");
      expect(view).toContain("element.inert = false;");
      // Never `body`'s own children: Radix portals live there.
      expect(view).toContain("node.parentElement !== document.body");

      // Nothing docked, nothing floating, no light table.
      expect(html).not.toMatch(/data-label-dock\b/);
      expect(html).not.toContain("data-label-dock-layer");
      expect(html).not.toContain("data-label-court-layer");
      expect(html).not.toContain("data-label-scroller");
      expect(html).not.toContain("data-label-point-header");
    });

    test("the rail: a header with the match, the progress, the save line and the way out, over one scroller", () => {
      const html = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode: "black",
        initialExpandedPointId: FIXTURE_POINT_IDS.P1,
      });
      const rail = railOf(html);
      const header = rail.slice(
        rail.indexOf("data-label-rail-header"),
        rail.indexOf("data-label-rail-scroller"),
      );
      expect(text(header)).toContain("Jordan Lee vs Elena Vargas");
      expect(text(header)).toMatch(/\d+ \/ \d+ checked/);
      expect(header).toContain("data-save-status");
      expect(header).toContain('aria-label="Exit full screen"');
      expect(header).toContain("lucide-minimize-2");
      expect(tagOf(rail, "data-label-rail-header")).toMatch(
        /class="[^"]*\bh-\[46px\]/,
      );
      // No column header anywhere in it: the rows are two lines, not columns.
      expect(rail).not.toContain("eyebrow-sm");
      expect(rail).not.toContain("Hit at</span>");
      // The scroller is the rail's own, taking the rest of its height.
      expect(tagOf(rail, "data-label-rail-scroller")).toMatch(
        /class="[^"]*\bmin-h-0\b[^"]*\bflex-1\b[^"]*\boverflow-x-hidden\b[^"]*\boverflow-y-auto\b/,
      );
      // The black rows: one per live point, the tombstone's marker, the
      // bands, and the well under the open point only.
      expect(count(rail, /data-row="point"/g)).toBe(3);
      expect(count(rail, /data-row="deleted-point"/g)).toBe(1);
      // The tombstone is the rail's own dark line — not the light table's
      // marker and ghost. (Its Undo is label-black-rows.spec.ts's.)
      const gone = rail.slice(rail.indexOf('data-row="deleted-point"'));
      const line = gone.slice(0, gone.indexOf("</div>"));
      expect(line).toContain("Deleted point");
      expect(line).toContain("text-white/45");
      expect(line).not.toContain("aria-expanded");
      expect(rail).not.toContain("ghost-point");
      expect(rail).not.toContain("ghost-shot");
      expect(count(rail, /data-game-band="/g)).toBeGreaterThan(0);
      expect(rail).toContain(`data-shots-for="${FIXTURE_POINT_IDS.P1}"`);
      expect(count(rail, /data-shots-well/g)).toBe(1);
      expect(rail).toContain("data-point-sentence");
      expect(rail).toContain('data-row="shot"');
      // The default width, when none is asked for.
      expect(tagOf(rail, 'data-label-rail=""')).toContain("width:640px");
      expect(tagOf(rail, 'role="separator"')).toContain('aria-valuenow="640"');
    });

    test("held while a point plays, the Now playing pill sits inside the rail", () => {
      const html = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode: "black",
        initialPointFocus: { mode: "held", pointId: FIXTURE_POINT_IDS.P1 },
        initialVideoTime: 2490.5,
      });
      const rail = railOf(html);
      expect(rail).toContain("data-label-follow-pill");
      const pill = tagOf(rail, "data-label-follow-pill");
      expect(pill).toContain(
        'aria-label="Now playing: point 2 — follow playback"',
      );
      expect(pill).toMatch(/class="[^"]*\babsolute\b[^"]*\bleft-1\/2\b/);
      expect(pill).not.toMatch(/class="[^"]*\bfixed\b/);
      // Over the scroller, after it in the DOM.
      expect(rail.indexOf("data-label-follow-pill")).toBeGreaterThan(
        rail.indexOf("data-label-rail-scroller"),
      );
      // The playing point is the one unfolded; the held rail shows no second.
      expect(rail).not.toContain(`data-shots-for="${FIXTURE_POINT_IDS.P1}"`);
      expect(rail).toContain(`data-shots-for="${FIXTURE_POINT_IDS.P2}"`);
      expect(count(rail, /data-shots-well/g)).toBe(1);
      expect(rail).toMatch(/data-point-id="[^"]*"[^>]*data-playing="true"/);
    });

    test("the other modes draw none of it, and keep the light header it drops", () => {
      for (const initialLayoutMode of [
        undefined,
        "overlay",
        "docked-top",
        "docked-side",
      ] as const) {
        const other = render({
          session: labelSessionFixture(),
          video: VIDEO,
          initialLayoutMode,
        });
        expect(other, String(initialLayoutMode)).not.toContain(
          "data-label-black",
        );
        expect(other, String(initialLayoutMode)).not.toContain(
          "data-label-rail",
        );
        expect(other, String(initialLayoutMode)).toContain(
          "data-console-header",
        );
        expect(other, String(initialLayoutMode)).toContain(
          'data-label-layout=""',
        );
      }
    });

    test("a selected shot zooms the court to its half and outlines the court; the film's frame stays square", () => {
      const html = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode: "black",
        initialExpandedPointId: FIXTURE_POINT_IDS.P1,
        initialSelectedShotId: "s-return",
        ...SAVES,
      });
      const black = blackOf(html);
      expect(black).toMatch(/data-court-view="(near|far)"/);
      expect(black).toMatch(/<button[^>]*data-court-target/);
      // Full screen: the loading skeleton's card radius is taken off every
      // box in it — the frame is flush to the black stage.
      expect(tagOf(black, "data-label-video-pending")).toMatch(
        /class="[^"]*\[&amp;_\*\]:rounded-none/,
      );
      const docked = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode: "docked-top",
      });
      expect(tagOf(docked, "data-label-video-pending")).not.toContain(
        "rounded-none",
      );
      expect(black).toContain("data-court-steps");
      expect(tagOf(black, "data-label-black-court")).toContain(
        'data-court-placing="true"',
      );
      // The selected row mounts its editors, and only that row.
      const rail = railOf(html);
      expect(rail).toMatch(
        /data-row="shot" data-shot-id="s-return" data-selected=""/,
      );
      expect(count(rail, /data-selected=""/g)).toBe(1);
      expect(rail).toMatch(EDITORS);
    });
  });

  test.describe("the film full-screen view (board 08n)", () => {
    /** The film layer's markup: from its marker to the end. */
    function filmOf(html: string): string {
      const start = html.indexOf('data-label-film=""');
      expect(start).toBeGreaterThan(-1);
      return html.slice(html.lastIndexOf("<", start));
    }

    /** The rail's markup, from its marker to the end of the layer. */
    function railOf(html: string): string {
      const film = filmOf(html);
      const start = film.indexOf('data-label-rail=""');
      expect(start).toBeGreaterThan(-1);
      return film.slice(film.lastIndexOf("<", start));
    }

    /** The court card's markup, up to the rail. */
    function courtOf(html: string): string {
      const film = filmOf(html);
      const start = film.indexOf("data-label-film-court=");
      expect(start).toBeGreaterThan(-1);
      const end = film.indexOf('data-label-rail=""', start);
      return film.slice(
        film.lastIndexOf("<", start),
        end === -1 ? undefined : end,
      );
    }

    const PANEL_GROUND = "bg-[rgba(13,13,13,0.86)]";
    const PANEL_SHADOW =
      "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1),0_18px_44px_rgba(0,0,0,0.35)]";

    test("a fixed layer the film fills, the rail and the court laid over it", () => {
      const html = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode: "film",
        initialRailWidth: 700,
        initialExpandedPointId: FIXTURE_POINT_IDS.P1,
      });
      expect(tagOf(html, "data-label-console")).toContain(
        'data-label-layout-mode="film"',
      );
      // The black view's mechanism: fixed, over everything, inside the root.
      const layer = tagOf(html, 'data-label-film=""');
      expect(layer).toMatch(/class="[^"]*\bfixed\b[^"]*\binset-0\b/);
      expect(layer).toMatch(/class="[^"]*\bz-50\b/);
      expect(layer).toMatch(/class="[^"]*\bbg-black\b/);
      expect(html.indexOf('data-label-film=""')).toBeGreaterThan(
        html.indexOf("data-label-console"),
      );
      const view = readFileSync(
        "src/components/admin/labels/label-film-view.tsx",
        "utf8",
      );
      expect(view).toContain("ref={inertOutside}");
      expect(view).toContain("useRailWidth(initialRailWidth)");

      const film = filmOf(html);
      // The film fills the layer: the frame is the whole of it, not a 16:9
      // box, the picture contained on black, never cropped.
      const frame = tagOf(film, "data-label-video-frame");
      expect(frame).toMatch(/class="[^"]*\babsolute\b[^"]*\binset-0\b/);
      expect(frame).not.toContain("aspect-video");
      expect(frame).toContain("bg-black");
      expect(tagOf(film, 'data-testid="label-video"')).toContain(
        "object-contain",
      );
      expect(count(html, /data-label-video-frame/g)).toBe(1);
      expect(tagOf(film, "data-label-video-pending")).toMatch(
        /class="[^"]*\[&amp;_\*\]:rounded-none/,
      );
      // DOM order is paint order: the film, the top scrim, the court, the rail.
      const order = [
        "data-label-film-video",
        "data-label-film-scrim",
        "data-label-film-court=",
        'data-label-rail=""',
      ].map((marker) => film.indexOf(marker));
      expect(order.every((at) => at > -1)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      expect(tagOf(film, "data-label-film-scrim")).toMatch(
        /class="[^"]*\bpointer-events-none\b[^"]*\babsolute\b/,
      );

      // The transport stays with the player — its title line and stepping —
      // at the room's own scale, and stops at the rail's left edge (its own
      // 24px padding keeps the breathing room).
      expect(film).toContain('aria-label="Previous point"');
      expect(film).toContain('aria-label="Next point"');
      expect(film).toContain('role="slider"');
      expect(film).toContain('style="right:700px"');
      expect(film).not.toContain("px-4 pb-1.5");

      // The rail: the black rail unchanged, flush to the right edge from top
      // to bottom (screen B) on the translucent ground — never the opaque
      // one — with a left hairline only: no inset, no corner, no drop. As
      // wide as asked, its handle on its left edge.
      const rail = tagOf(film, 'data-label-rail=""');
      expect(rail).toMatch(
        /class="[^"]*\babsolute\b[^"]*\binset-y-0\b[^"]*\bright-0\b/,
      );
      expect(rail).not.toMatch(/\b(top|right|bottom)-3\b/);
      expect(rail).not.toContain("rounded");
      expect(rail).toContain(PANEL_GROUND);
      expect(rail).toContain("shadow-[inset_1px_0_0_rgba(255,255,255,0.1)]");
      expect(rail).not.toContain(PANEL_SHADOW);
      expect(rail).not.toContain("bg-[var(--surface-dark)]");
      expect(rail).not.toContain("overflow-hidden");
      expect(rail).toContain("width:700px");
      const railBox = tagOf(film, "data-label-film-rail-box");
      expect(railBox).toMatch(/class="[^"]*\boverflow-hidden\b/);
      expect(railBox).not.toContain("rounded");
      expect(count(html, /role="separator"/g)).toBe(1);
      const separator = tagOf(film, 'role="separator"');
      expect(separator).toContain('aria-label="Resize the points list"');
      expect(separator).toContain('aria-valuenow="700"');
      expect(separator).toContain('aria-valuemin="520"');
      expect(separator).toContain('aria-valuemax="880"');
      const railHtml = railOf(html);
      const header = railHtml.slice(
        railHtml.indexOf("data-label-rail-header"),
        railHtml.indexOf("data-label-rail-scroller"),
      );
      expect(text(header)).toContain("Jordan Lee vs Elena Vargas");
      expect(header).toContain("data-save-status");
      expect(header).toContain('aria-label="Hide the points list"');
      expect(header).toContain("lucide-panel-right-close");
      expect(header).toContain('aria-label="Exit full screen"');
      expect(header.indexOf("data-label-rail-hide")).toBeLessThan(
        header.indexOf("data-label-black-exit"),
      );
      expect(count(railHtml, /data-row="point"/g)).toBe(3);
      expect(count(railHtml, /data-shots-well/g)).toBe(1);
      expect(railHtml).toContain("data-label-rail-scroller");

      // The court: a card over the film, the same ground, at the default
      // spot and size before it is measured, invisible until it is — its
      // header the drag handle, with the grip and the hide button.
      const court = tagOf(film, "data-label-film-court=");
      expect(court).toContain('role="group"');
      expect(court).toContain('aria-label="Court"');
      expect(court).toContain('data-dock-anchor="top-left"');
      expect(court).toContain('data-court-placing="false"');
      expect(court).toMatch(/class="[^"]*\babsolute\b/);
      expect(court).toMatch(/class="[^"]*\binvisible\b/);
      expect(court).toContain(PANEL_GROUND);
      expect(court).toContain(PANEL_SHADOW);
      expect(court).toContain(
        'style="left:20px;top:20px;width:214px;height:392px"',
      );
      const courtHtml = courtOf(html);
      expect(courtHtml).toContain("data-court-handle");
      expect(courtHtml).toContain("lucide-grip-vertical");
      expect(courtHtml).toContain('aria-label="Hide the court"');
      expect(courtHtml).toContain("data-court-panel");
      expect(courtHtml).toContain('data-court-view="whole"');
      expect(courtHtml).toContain("data-court-legend");
      expect(tagOf(courtHtml, "data-court-box")).toMatch(
        /class="[^"]*\[container-type:size\][^"]*\bflex-1\b/,
      );
      expect(tagOf(courtHtml, "data-court-handle")).toMatch(
        /class="[^"]*\bcursor-grab\b/,
      );

      // Nothing docked, nothing of the overlay, nothing of the black view,
      // no light table and no light header.
      expect(html).not.toMatch(/data-label-dock\b/);
      expect(html).not.toContain("data-label-dock-layer");
      expect(html).not.toContain("data-label-court-layer");
      expect(html).not.toContain("data-label-court-dock");
      expect(html).not.toContain('data-label-black=""');
      expect(html).not.toContain("data-label-black-stage");
      expect(html).not.toContain("data-label-black-video");
      expect(html).not.toContain("data-label-black-court");
      expect(html).not.toContain("data-label-scroller");
      expect(html).not.toContain("data-label-point-header");
      expect(html).not.toContain("data-console-header");
      expect(html).not.toContain("<h1");
      expect(html).not.toContain("data-label-divider");
      expect(html).not.toContain("data-label-film-rail-pill");
      expect(html).not.toContain("data-label-film-court-pill");
    });

    test("the transport's inset follows the rail's width: 640 by default", () => {
      const byDefault = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode: "film",
      });
      expect(tagOf(byDefault, 'data-label-rail=""')).toContain("width:640px");
      expect(byDefault).toContain('style="right:640px"');
      const widest = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode: "film",
        initialRailWidth: 5000,
      });
      expect(tagOf(widest, 'data-label-rail=""')).toContain("width:880px");
      expect(widest).toContain('style="right:880px"');
    });

    test("the rail hidden: a Points pill and the way out, no rail, the transport across the film", () => {
      const html = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode: "film",
        initialFilmRailHidden: true,
      });
      const film = filmOf(html);
      expect(html).not.toContain('data-label-rail=""');
      expect(html).not.toContain('role="separator"');
      expect(html).not.toContain("data-label-rail-scroller");
      expect(html).not.toContain("data-label-rail-hide");
      // The pills, top-right, 18px down.
      expect(tagOf(film, "data-label-film-rail-pills")).toMatch(
        /class="[^"]*\babsolute\b[^"]*\btop-\[18px\][^"]*\bright-6\b/,
      );
      const pill = tagOf(film, 'data-label-film-rail-pill=""');
      expect(pill).toContain("<button");
      for (const cls of [
        "h-7",
        "rounded-[var(--radius-button)]",
        "bg-[rgba(13,13,13,0.72)]",
        "px-2.5",
        "text-[11px]",
        "font-medium",
        "text-white/90",
      ]) {
        expect(pill, cls).toContain(cls);
      }
      const pills = film.slice(film.indexOf("data-label-film-rail-pills"));
      expect(pills).toContain("lucide-list");
      expect(text(pills)).toMatch(/Points · \d+ \/ \d+/);
      // The way out stays reachable: the rail's own exit went with the rail.
      expect(count(html, /aria-label="Exit full screen"/g)).toBe(1);
      const exit = tagOf(film, "data-label-film-exit");
      expect(exit).toContain('aria-label="Exit full screen"');
      expect(pills).toContain("lucide-minimize-2");
      // Full width for the transport.
      expect(film).not.toContain('style="right:');
      expect(film).toContain('aria-label="Previous point"');
      // The court is still there.
      expect(film).toContain("data-label-film-court=");
    });

    test("the court hidden: a Court pill top-left and no card; both hidden: two pills", () => {
      const html = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode: "film",
        initialFilmCourtHidden: true,
      });
      const film = filmOf(html);
      expect(html).not.toContain("data-label-film-court=");
      expect(html).not.toContain("data-court-panel");
      expect(html).not.toContain("data-court-handle");
      const pill = tagOf(film, "data-label-film-court-pill");
      expect(pill).toContain('aria-label="Show the court"');
      expect(pill).toMatch(
        /class="[^"]*\babsolute\b[^"]*\btop-\[18px\][^"]*\bleft-6\b/,
      );
      expect(pill).toContain("bg-[rgba(13,13,13,0.72)]");
      expect(film).toContain("lucide-rectangle-vertical");
      // The rail stays.
      expect(film).toContain('data-label-rail=""');
      expect(film).toContain('style="right:640px"');

      const both = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode: "film",
        initialFilmRailHidden: true,
        initialFilmCourtHidden: true,
      });
      expect(both).toContain("data-label-film-court-pill");
      expect(both).toContain("data-label-film-rail-pill");
      expect(both).not.toContain('data-label-rail=""');
      expect(both).not.toContain("data-label-film-court=");
      expect(both).toContain('data-testid="label-video"');
    });

    test("a selected shot zooms the card's court to its half and outlines the card", () => {
      const html = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode: "film",
        initialExpandedPointId: FIXTURE_POINT_IDS.P1,
        initialSelectedShotId: "s-return",
        ...SAVES,
      });
      const courtHtml = courtOf(html);
      expect(courtHtml).toMatch(/data-court-view="(near|far)"/);
      expect(courtHtml).toMatch(/<button[^>]*data-court-target/);
      expect(courtHtml).toContain("data-court-steps");
      expect(courtHtml).toContain("data-court-flip");
      const court = tagOf(html, "data-label-film-court=");
      expect(court).toContain('data-court-placing="true"');
      expect(court).toContain("shadow-[0_0_0_1.5px_var(--blue)");
      // The selected row mounts its editors, and only that row.
      const rail = railOf(html);
      expect(rail).toMatch(
        /data-row="shot" data-shot-id="s-return" data-selected=""/,
      );
      expect(count(rail, /data-selected=""/g)).toBe(1);
      expect(rail).toMatch(EDITORS);
    });

    test("held while a point plays, the Now playing pill sits inside the rail", () => {
      const html = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode: "film",
        initialPointFocus: { mode: "held", pointId: FIXTURE_POINT_IDS.P1 },
        initialVideoTime: 2490.5,
      });
      const rail = railOf(html);
      const pill = tagOf(rail, "data-label-follow-pill");
      expect(pill).toContain(
        'aria-label="Now playing: point 2 — follow playback"',
      );
      expect(pill).toMatch(/class="[^"]*\babsolute\b[^"]*\bleft-1\/2\b/);
      expect(rail.indexOf("data-label-follow-pill")).toBeGreaterThan(
        rail.indexOf("data-label-rail-scroller"),
      );
      expect(rail).toContain(`data-shots-for="${FIXTURE_POINT_IDS.P2}"`);
      expect(rail).toMatch(/data-point-id="[^"]*"[^>]*data-playing="true"/);
    });

    test("the black view draws none of it, and keeps its opaque rail", () => {
      const html = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode: "black",
        initialExpandedPointId: FIXTURE_POINT_IDS.P1,
      });
      expect(html).not.toContain("data-label-film");
      expect(html).not.toContain("data-label-rail-hide");
      expect(html).not.toContain("data-label-film-court");
      expect(html).not.toContain('aria-label="Hide the points list"');
      expect(html).not.toContain("data-court-handle");
      expect(html).not.toContain('style="right:');
      expect(tagOf(html, 'data-label-rail=""')).toContain(
        "bg-[var(--surface-dark)]",
      );
      expect(tagOf(html, 'data-label-rail=""')).not.toContain(PANEL_GROUND);
      expect(tagOf(html, "data-label-video-frame")).toContain("aspect-video");
    });
  });
});
