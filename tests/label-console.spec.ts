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
  initialLayoutMode?: "overlay" | "docked-top" | "docked-side";
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

const EDITORS = /<select|<input|<textarea/g;

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
  // Shot · time · player chip and name · stroke · hit at · landed at ·
  // placement · result · status. There is no Type, Spin or Speed column.
  expect(panelText).toContain(
    "Shot Time Player Stroke Hit at Landed at Placement Result Status 1 ",
  );
  expect(panelText).toContain(
    "1 41:12.0 L Lee First serve -0.80, -0.32 0.60, 17.79 T In 2 ",
  );
  expect(panelText).toContain(
    "2 41:13.1 V Vargas Backhand 1.80, 24.49 -2.10, 3.49 Crosscourt In Edited",
  );
  expect(panelText).toContain(
    "3 41:14.4 L Lee Forehand -2.30, -1.02 4.20, 24.90 Crosscourt Out Added",
  );
  expect(panelText.indexOf("Deleted shot")).toBeLessThan(
    panelText.indexOf("41:14.4"),
  );
});

test("shot columns: the two positions, whole, and nothing typed for Result", () => {
  const { SHOT_COLUMNS, SHOT_TRACKS } = createLoader().load(
    "src/components/admin/labels/label-table-layout.ts",
  ) as { SHOT_COLUMNS: readonly string[]; SHOT_TRACKS: string };
  // The last, unlabelled track is the row's ✕.
  expect(SHOT_COLUMNS).toEqual([
    "Shot",
    "Time",
    "Player",
    "Stroke",
    "Hit at",
    "Landed at",
    "Placement",
    "Result",
    "Status",
    "",
  ]);
  for (const gone of ["Type", "Spin", "Speed"]) {
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

test("shot rows: a card of strokes, the hitter's chip, calculated cells, faults", () => {
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

  // The player chip is the winner mark at 22px, in the same two grounds —
  // and is not counted as a winner mark.
  const serve = rowMarkup(html, 'data-shot-id="s-serve"');
  expect(serve).toMatch(
    /data-player-mark="p1"[^>]*size-\[22px\][^>]*bg-\[var\(--blue\)\]/,
  );
  expect(rowMarkup(html, 'data-shot-id="s-return"')).toMatch(
    /data-player-mark="p2"[^>]*bg-\[var\(--surface-subtle\)\]/,
  );
  expect(count(panel, /data-winner-mark/g)).toBe(0);

  // A serve that did not go in is muted, and says so.
  expect(serve).toContain("data-fault");
  expect(serve).toContain("text-[var(--ink-500)]");
  expect(text(serve)).toMatch(/T Out Fault/);
  expect(rowMarkup(html, 'data-shot-id="s-added"')).not.toContain("data-fault");

  // Unplaced: Placement and Result are an em dash, never a guess.
  const unplaced = rowMarkup(html, 'data-shot-id="s-return"');
  expect(unplaced).toMatch(/data-calculated="placement"[^>]*><span[^>]*>—</);
  expect(unplaced).toMatch(/data-calculated="result"[^>]*><span[^>]*>—</);
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
  // Nothing labelled and no strokes yet: each gap is a dash, named for
  // assistive technology — and a new game starts at 0–0.
  expect(out).toMatch(
    /— 4 — No timed shot 0–0 — Not labelled — No shot 0 — No note To check/,
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
  expect(shotLabels).toHaveLength(9);
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
      /class="[^"]*\babsolute\b[^"]*\btop-3\b[^"]*\bleft-1\/2\b/,
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
    expect(html).toContain('aria-label="Shot 1 hit at: -0.80, -0.32"');
    expect(count(html, /role="button" tabindex="0"/g)).toBeGreaterThanOrEqual(
      // Two per point (ending, note); five per stroke — time, player,
      // stroke, hit at, landed at. Placement and Result are not stops.
      3 * 2 + 3 * 5,
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
    // Player and stroke as selects; time, hit at, landed at as inputs. The
    // result follows the coordinates: it is text, never a select.
    expect(count(selected, /<select/g)).toBe(2);
    expect(count(selected, /<input/g)).toBe(3);
    expect(selected).not.toContain('aria-label="Shot 2 result"');
    expect(selected).toMatch(/data-calculated="result"[^>]*>In</);
    expect(selected).toMatch(/data-calculated="placement"[^>]*>Crosscourt</);
    expect(selected).toContain('aria-label="Shot 2 stroke"');
    expect(selected).toMatch(/<option value="backhand" selected="">/);

    expect(count(rowMarkup(html, 'data-shot-id="s-serve"'), EDITORS)).toBe(0);
    expect(count(rowMarkup(html, 'data-shot-id="s-added"'), EDITORS)).toBe(0);
    expect(
      count(
        rowMarkup(html, `data-point-id="${FIXTURE_POINT_IDS.P1}"`),
        EDITORS,
      ),
    ).toBe(0);
    expect(count(html, EDITORS)).toBe(5);
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
    expect(text(playing)).toContain("2 , playing 41:13.1 V Vargas");
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

  test("held, it marks a closed point without opening it", () => {
    const html = render({
      session: labelSessionFixture(),
      video: null,
      initialExpandedPointId: FIXTURE_POINT_IDS.P1,
      initialPointFocus: { mode: "held", pointId: FIXTURE_POINT_IDS.P1 },
      // Point 2's ace.
      initialVideoTime: 2490.5,
    });
    expect(count(html, PLAYING)).toBe(1);
    expect(
      rowMarkup(html, `data-point-id="${FIXTURE_POINT_IDS.P2}"`),
    ).toContain('data-playing="true"');
    // Point 1 stays the open one; point 2's strokes stay folded away.
    expect(html).toContain(`data-shots-for="${FIXTURE_POINT_IDS.P1}"`);
    expect(html).not.toContain(`data-shots-for="${FIXTURE_POINT_IDS.P2}"`);
    expect(html).toMatch(/data-court-title="[^"]*"[^>]*>Point 1</);
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

  test("held with nothing open, the playing point stays folded (T25)", () => {
    const html = render({
      session: labelSessionFixture(),
      video: null,
      initialPointFocus: { mode: "held", pointId: null },
      initialVideoTime: 2490.5,
    });
    expect(count(html, PLAYING)).toBe(1);
    expect(html).not.toContain("data-shots-for=");
    expect(html).toMatch(/data-court-title="[^"]*"[^>]*>Court</);
    expect(html).toMatch(/data-court-subtitle="[^"]*"[^>]*>No point open</);
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
    expect(open).toMatch(/class="[^"]*\bmax-w-\[45%\]/);
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
});
