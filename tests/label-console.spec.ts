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
import { count, tag as tagOf, text } from "./fixtures/html-probe";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * `/admin/labels/[sessionId]`'s console (T5, editing T6), rendered offline
 * from a fixture session through `fixtures/vm-modules` — the real points
 * rail, court and player, nothing stubbed. The console has two layouts
 * (`label-layout.ts`): docked side, the default every render here is in
 * unless it asks for the other, and the full screen (`black`).
 */

type ConsoleProps = {
  session: LabelSession;
  video: LabelVideo | null;
  initialExpandedPointId?: string | null;
  initialSelectedShotId?: string | null;
  initialVideoTime?: number | null;
  initialPointFocus?:
    { mode: "follow" } | { mode: "held"; pointId: string | null };
  initialLayoutMode?: "docked-side" | "black";
  initialRailWidth?: number;
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

/** The markup of the expanded point's shot panel, up to the next point. */
function shotPanel(html: string, pointId: string): string {
  const start = html.indexOf(`data-shots-for="${pointId}"`);
  expect(start).toBeGreaterThan(-1);
  const next = html.indexOf('data-row="point"', start);
  const deleted = html.indexOf('data-row="deleted-point"', start);
  const ends = [next, deleted].filter((i) => i > -1);
  return html.slice(start, ends.length ? Math.min(...ends) : undefined);
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
  // Number · time · player's name · stroke · spin · hit at · landed at ·
  // placement · result — no header row, and no Type or Speed.
  expect(panelText).toContain(
    "1 41:12.0 Lee First serve Flat -0.80 -0.32 0.60 17.79 T In 2 ",
  );
  expect(panelText).toContain(
    "2 41:13.1 Vargas Backhand Topspin 1.80 24.49 -2.10 3.49 Crosscourt In",
  );
  // The added stroke has no spin yet: an em dash, named.
  expect(panelText).toContain(
    "3 41:14.4 Lee Forehand — Not set -2.30 -1.02 4.20 24.90 Crosscourt Out",
  );
  for (const gone of ["Type", "Speed"]) {
    expect(panelText).not.toContain(gone);
  }
  expect(panelText.indexOf("Deleted shot")).toBeLessThan(
    panelText.indexOf("41:14.4"),
  );
});

test("a wide position is in the markup whole — as text, and in the editor", () => {
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
  expect(text(rowMarkup(asText, 'data-shot-id="s-serve"'))).toContain(
    " -3.21 18.40 ",
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

test("a point row's winner chip and score, and its note", () => {
  const html = render({
    session: labelSessionFixture(),
    video: null,
    initialExpandedPointId: null,
    ...SAVES,
  });
  const cell = (row: string, attr: string) =>
    row.match(new RegExp(`${attr}[^>]*>([^<]*)<`))?.[1];

  // Point 1: Vargas (p2) won it; Lee serves the first point of the game.
  const first = rowMarkup(html, `data-point-id="${FIXTURE_POINT_IDS.P1}"`);
  expect(cell(first, 'data-winner-mark="p2"')).toBe("V");
  expect(cell(first, "data-point-score")).toBe("0–0");
  // Editable, the chip is the menu's trigger.
  expect(first).toMatch(
    /<button[^>]*aria-label="Point 1 won by Vargas"[^>]*aria-haspopup="menu"/,
  );
  // No note control on the row, with a note stored or without.
  expect(html).not.toContain("data-note-action");

  // Point 2: Lee (p1) on blue, at 0–15 after losing the first point.
  const second = rowMarkup(html, `data-point-id="${FIXTURE_POINT_IDS.P2}"`);
  expect(cell(second, 'data-winner-mark="p1"')).toBe("L");
  expect(second).toMatch(/data-winner-mark="p1"[^>]*bg-\[var\(--blue\)\]/);
  expect(cell(second, "data-point-score")).toBe("0–15");

  // Read-only: the winner is a picture, not a menu.
  const readOnly = render({
    session: labelSessionFixture(),
    video: null,
    initialExpandedPointId: null,
  });
  expect(readOnly).toContain('role="img" aria-label="Point 1 won by Vargas"');
  expect(readOnly).not.toMatch(
    /<button[^>]*aria-label="Point 1 won by Vargas"/,
  );
});

test("the rally counts from the last serve, tombstones left out", () => {
  const { pointSummary } = createLoader().load(
    "src/components/admin/labels/label-format.ts",
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
  // No list of shots in or beside the card — the rail is the list — and
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

test.describe("the player", () => {
  const VIDEO = {
    url: "https://example.test/v.mp4?sig=x",
    startTimeSeconds: 0,
  };

  test("one frame, one video element", () => {
    const html = render({
      session: labelSessionFixture(),
      video: VIDEO,
      initialVideoTime: 2473.4,
    });

    // One frame, one element.
    expect(count(html, /data-label-video-frame/g)).toBe(1);
    expect(count(html, /<video/g)).toBe(1);
  });
});

test.describe("viewport fit (T19)", () => {
  test("the rail is the one scroller, down its length and never sideways", () => {
    const html = render({ session: labelSessionFixture(), video: null });
    expect(count(html, /data-label-rail-scroller/g)).toBe(1);
    // Every row is inside it, and nothing else in the console scrolls.
    expect(html.indexOf('data-row="point"')).toBeGreaterThan(
      html.indexOf("data-label-rail-scroller"),
    );
    expect(count(html, /overflow-y-auto/g)).toBe(1);
  });
});

test.describe("the Now playing pill", () => {
  /** The pill's opening tag. */
  function pill(html: string): string {
    const at = html.indexOf("data-label-follow-pill");
    expect(at).toBeGreaterThan(-1);
    return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
  }

  test("held while a point plays: the film room's words, over the rail's top-centre", () => {
    const html = render({
      session: labelSessionFixture(),
      video: null,
      initialPointFocus: { mode: "held", pointId: FIXTURE_POINT_IDS.P1 },
      initialVideoTime: 2490.5,
    });
    const tag = pill(html);
    expect(tag).toContain('type="button"');
    // The list's own number, as the transport prints it.
    expect(tag).toContain(
      'aria-label="Now playing: point 2 — follow playback"',
    );
    expect(text(html.slice(html.indexOf("data-label-follow-pill")))).toContain(
      "Now playing · Point 2",
    );
    expect(html.indexOf("data-label-follow-pill")).toBeGreaterThan(
      html.indexOf("data-label-rail-scroller"),
    );
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
    expect(html).toContain('aria-label="Shot 2 stroke: Backhand"');
    expect(html).toContain('aria-label="Shot 2 spin: Topspin"');
    expect(html).toContain('aria-label="Shot 3 spin: Not set"');
    expect(html).toContain('aria-label="Shot 1 hit at: -0.80, -0.32"');
    // Six stops per stroke — time, player, stroke, spin, hit at, landed at.
    // Placement and Result are calculated: text, never a stop.
    expect(count(html, /role="button" tabindex="0"/g)).toBe(3 * 6);
    expect(html).not.toMatch(/data-calculated="[^"]*"[^>]*role="button"/);
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
    expect(selected).toMatch(/data-calculated="result"[^>]*><span[^>]*>In</);
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
    expect(count(html, /data-point-go=""/g)).toBe(3);
    expect(html).not.toMatch(/data-point-go=""[^>]*aria-expanded/);
    // The control is a button named by the point's own two lines.
    expect(tagOf(html, 'data-point-go=""')).toContain('<button type="button"');
    expect(tagOf(html, 'data-point-go=""')).not.toContain("aria-label");
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
      expect(html).not.toContain(", playing");
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
    const RULE = /data-playing-rule=""/g;
    const ruleOf = (row: string) =>
      row.match(
        /<span aria-hidden="true" data-playing-rule="" class="([^"]*)" style="width:([^"]*)"/,
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
      const rule = ruleOf(row);
      expect(rule).not.toBeNull();
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
  });
});

test.describe("the two layouts", () => {
  const VIDEO = {
    url: "https://example.test/v.mp4?sig=x",
    startTimeSeconds: 0,
  };

  /** From `attr`'s tag to `until` (or the end of the render). */
  function from(html: string, attr: string, until?: string): string {
    const start = html.indexOf(attr);
    expect(start, attr).toBeGreaterThan(-1);
    const stop = until === undefined ? -1 : html.indexOf(until, start);
    return html.slice(
      html.lastIndexOf("<", start),
      stop === -1 ? undefined : html.lastIndexOf("<", stop),
    );
  }

  /** The rail's markup, from its `<aside>` to the end of the render. */
  const railOf = (html: string) => from(html, 'data-label-rail=""');

  /** The rail's header, up to its scroller. */
  const railHeader = (html: string) =>
    from(html, "data-label-rail-header", "data-label-rail-scroller");

  test("the header carries one Layout menu trigger, beside the save line", () => {
    const html = render({ session: labelSessionFixture(), video: VIDEO });
    expect(count(html, /data-label-layout=""/g)).toBe(1);
    // Beside the save line, in the header's trailing cluster.
    expect(html.indexOf('data-label-layout=""')).toBeGreaterThan(
      html.indexOf("data-save-status"),
    );
    expect(html.indexOf('data-label-layout=""')).toBeLessThan(
      html.indexOf("data-label-side"),
    );
  });

  test.describe("docked side, the default", () => {
    test("inside the page under the header: the film card over the court card, the rail on the right", () => {
      for (const initialLayoutMode of [undefined, "docked-side"] as const) {
        const html = render({
          session: labelSessionFixture(),
          video: VIDEO,
          initialLayoutMode,
          initialRailWidth: 700,
          initialExpandedPointId: FIXTURE_POINT_IDS.P1,
          initialVideoTime: 2473.4,
        });
        expect(tagOf(html, "data-label-console")).toContain(
          'data-label-layout-mode="docked-side"',
        );
        // The console's own header, then the view — a column of the page,
        // not a layer over it.
        expect(count(html, /data-console-header/g)).toBe(1);
        expect(html.indexOf("data-console-header")).toBeLessThan(
          html.indexOf('data-label-side=""'),
        );
        expect(html).not.toContain("data-label-black");

        // The stage, then the rail: film, court, points.
        const order = [
          "data-label-side-stage",
          "data-label-side-video",
          "data-label-video-frame",
          "data-label-side-court",
          "data-court-panel",
          'data-label-rail=""',
          "data-label-rail-scroller",
        ].map((needle) => html.indexOf(needle));
        expect(order.every((at) => at > -1)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        expect(count(html, /data-label-video-frame/g)).toBe(1);
        expect(count(html, /data-court-panel/g)).toBe(1);

        // The transport stays with the player, and reads the playing point.
        const stage = from(html, "data-label-side-stage", 'data-label-rail=""');
        expect(stage).toContain('aria-label="Previous point"');
        expect(stage).toContain('role="slider"');
        expect(text(stage)).toContain("Error · Forehand");
        expect(text(stage)).toContain("Point 1 / 4");
        // The court header reads the playing stroke.
        expect(stage).toMatch(/data-court-title="[^"]*"[^>]*>Point 1</);
        expect(stage).toMatch(
          /data-court-subtitle="[^"]*"[^>]*>Shot 2 of 3 · /,
        );
        // The rail: a white card as wide as asked, its handle on its left
        // edge — the one separator in the console.
        const rail = tagOf(html, 'data-label-rail=""');
        expect(rail).toContain("<aside");
        expect(rail).toContain('aria-label="Points"');
        expect(rail).toContain('data-rail-tone="light"');
        expect(rail).toContain("width:700px");
        expect(count(html, /role="separator"/g)).toBe(1);
        const separator = tagOf(railOf(html), 'role="separator"');
        expect(separator).toContain('aria-label="Resize the points list"');
        expect(separator).toContain('aria-orientation="vertical"');
        expect(separator).toContain('aria-valuenow="700"');
        expect(separator).toContain('aria-valuemin="520"');
        expect(separator).toContain('aria-valuemax="880"');
      }
    });

    test("with no width asked for the rail is its default", () => {
      const html = render({ session: labelSessionFixture(), video: VIDEO });
      expect(tagOf(html, 'data-label-rail=""')).toContain("width:640px");
      expect(tagOf(html, 'role="separator"')).toContain('aria-valuenow="640"');
    });

    test("the rail is in its light tone: “Points”, a way into the full screen, and no way out", () => {
      const html = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialExpandedPointId: FIXTURE_POINT_IDS.P1,
        ...SAVES,
      });
      expect(count(html, /data-rail-tone=/g)).toBe(1);
      expect(html).toContain('data-rail-tone="light"');
      expect(html).not.toContain('data-rail-tone="dark"');
      const header = railHeader(html);
      // The page's header says who is playing, how far along the session is
      // and whether it saved: the rail's says only what it is.
      expect(text(header)).toBe("Points");
      expect(header).not.toContain("data-label-rail-progress");
      expect(header).not.toContain("data-save-status");
      expect(count(html, /data-save-status=/g)).toBe(1);
      expect(html.indexOf("data-save-status=")).toBeLessThan(
        html.indexOf('data-label-side=""'),
      );
      // Into the full screen: a button, once, in the rail's header.
      expect(count(html, /data-label-rail-full-screen/g)).toBe(1);
      const button = tagOf(header, "data-label-rail-full-screen");
      expect(button).toContain('<button type="button"');
      expect(button).toContain('aria-label="Full screen"');
      // No exit and no whole-screen control: this is not a full screen.
      expect(html).not.toContain("data-label-black-exit");
      expect(html).not.toContain("Exit full screen");
      expect(html).not.toContain("data-label-whole-screen");
      // The same rows as the full screen draws.
      const rail = railOf(html);
      expect(count(rail, /data-row="point"/g)).toBe(3);
      expect(count(rail, /data-row="deleted-point"/g)).toBe(1);
      expect(count(rail, /data-game-band="/g)).toBeGreaterThan(0);
      expect(rail).toContain(`data-shots-for="${FIXTURE_POINT_IDS.P1}"`);
      expect(count(rail, /data-shots-well/g)).toBe(1);
      expect(rail).toContain("data-point-sentence");
    });

    test("a selected shot zooms the court to its half and outlines the court card", () => {
      const html = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialExpandedPointId: FIXTURE_POINT_IDS.P1,
        initialSelectedShotId: "s-return",
        ...SAVES,
      });
      const card = from(html, "data-label-side-court", 'data-label-rail=""');
      expect(card).toMatch(/data-court-view="(near|far)"/);
      expect(card).toMatch(/<button[^>]*data-court-target/);
      expect(card).toContain("data-court-steps");
      expect(card).toMatch(/data-court-title="[^"]*"[^>]*>Shot 2 · contact</);
      // The card wears the blue outline while placing.
      expect(tagOf(card, "data-label-side-court")).toContain(
        'data-court-placing="true"',
      );
      // And not otherwise: nothing selected, or a console that cannot write.
      for (const other of [
        render({
          session: labelSessionFixture(),
          video: VIDEO,
          initialExpandedPointId: FIXTURE_POINT_IDS.P1,
          ...SAVES,
        }),
        render({
          session: labelSessionFixture(),
          video: VIDEO,
          initialExpandedPointId: FIXTURE_POINT_IDS.P1,
          initialSelectedShotId: "s-return",
        }),
      ]) {
        const tag = tagOf(other, "data-label-side-court");
        expect(tag).toContain('data-court-placing="false"');
      }
    });

    test("without a video, the film card still frames the quiet placeholder", () => {
      const html = render({ session: labelSessionFixture(), video: null });
      const card = from(html, "data-label-side-video", "data-label-side-court");
      expect(card).not.toContain("<video");
      expect(text(card)).toContain("No video for this job");
      expect(html).toContain("data-court-art");
    });
  });

  test("the court scales to its panel in both layouts", () => {
    for (const initialLayoutMode of ["docked-side", "black"] as const) {
      const html = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode,
      });

      const court = tagOf(html, 'data-court-view="whole"');
      expect(court, initialLayoutMode).toContain(
        "width:min(100cqw, calc(100cqh * 0.4434))",
      );
      expect(court, initialLayoutMode).toMatch(/aspect-ratio:98\.43 ?\/ ?222/);
      // Placing: the half's own 276 × 222 proportions, still a button.
      const placing = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode,
        initialExpandedPointId: FIXTURE_POINT_IDS.P1,
        initialSelectedShotId: "s-return",
        ...SAVES,
      });
      const target = tagOf(placing, "data-court-target");
      expect(target, initialLayoutMode).toContain(
        "width:min(100cqw, calc(100cqh * 1.2432))",
      );
      expect(target, initialLayoutMode).toMatch(
        /aspect-ratio:276\.00 ?\/ ?222/,
      );
    }
  });

  test.describe("the full-screen black view (T33)", () => {
    /** The black layer's markup: from its marker to the confirm dialog or the end. */
    const blackOf = (html: string) => from(html, 'data-label-black=""');

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
      expect(black).toContain("data-court-legend");
      // The transport stays with the player.
      expect(black).toContain('aria-label="Previous point"');
      expect(black).toContain('role="slider"');
      expect(count(html, /data-label-video-frame/g)).toBe(1);

      // The rail, as wide as asked, its handle on its left edge.
      const rail = railOf(html);
      expect(tagOf(rail, 'data-label-rail=""')).toContain("width:700px");
      expect(tagOf(rail, 'data-label-rail=""')).toContain(
        'data-rail-tone="dark"',
      );
      expect(count(html, /role="separator"/g)).toBe(1);
      const separator = tagOf(rail, 'role="separator"');
      expect(separator).toContain('aria-label="Resize the points list"');
      expect(separator).toContain('aria-orientation="vertical"');
      expect(separator).toContain('aria-valuenow="700"');
      expect(separator).toContain('aria-valuemin="520"');
      expect(separator).toContain('aria-valuemax="880"');

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

      // One view or the other, never both.
      expect(html).not.toContain("data-label-side");
      expect(count(html, /data-label-rail=""/g)).toBe(1);
      expect(count(html, /data-label-rail-scroller/g)).toBe(1);
    });

    test("the rail: a header with the match, the progress, the save line and the way out, over one scroller", () => {
      const html = render({
        session: labelSessionFixture(),
        video: VIDEO,
        initialLayoutMode: "black",
        initialExpandedPointId: FIXTURE_POINT_IDS.P1,
      });
      const rail = railOf(html);
      const header = railHeader(html);
      expect(text(header)).toContain("Jordan Lee vs Elena Vargas");
      expect(text(header)).toMatch(/\d+ \/ \d+ checked/);
      expect(header).toContain("data-save-status");
      expect(count(html, /data-save-status=/g)).toBe(1);
      expect(header).toContain('aria-label="Exit full screen"');
      expect(tagOf(header, "data-label-black-exit")).toContain(
        '<button type="button"',
      );
      expect(count(html, /data-label-black-exit/g)).toBe(1);
      expect(header).toContain("lucide-minimize-2");
      // Already full screen: no way in.
      expect(html).not.toContain("data-label-rail-full-screen");
      // The rows: one per live point, the tombstone's marker, the bands,
      // and the well under the open point only.
      expect(count(rail, /data-row="point"/g)).toBe(3);
      expect(count(rail, /data-row="deleted-point"/g)).toBe(1);
      // The tombstone is the rail's own one line. (Its Undo is
      // label-black-rows.spec.ts's.)
      const gone = rail.slice(rail.indexOf('data-row="deleted-point"'));
      const line = gone.slice(0, gone.indexOf("</div>"));
      expect(line).toContain("Deleted point");
      expect(line).not.toContain("aria-expanded");
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

    test("a selected shot zooms the court to its half and outlines the court", () => {
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

    test("the same rows in both layouts: only the ground changes", () => {
      const rows = (initialLayoutMode: "docked-side" | "black") => {
        const html = render({
          session: labelSessionFixture(),
          video: VIDEO,
          initialLayoutMode,
          initialExpandedPointId: FIXTURE_POINT_IDS.P1,
          initialSelectedShotId: "s-return",
          initialVideoTime: 2473.4,
          ...SAVES,
        });
        const scroller = from(html, "data-label-rail-scroller");
        return {
          rows: [...scroller.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]),
          points: [...scroller.matchAll(/data-point-id="([^"]+)"/g)].map(
            (m) => m[1],
          ),
          shots: [...scroller.matchAll(/data-shot-id="([^"]+)"/g)].map(
            (m) => m[1],
          ),
          playing: count(scroller, /data-playing="true"/g),
          selected: count(scroller, /data-selected=""/g),
          editors: count(scroller, EDITORS),
          sentences: [
            ...scroller.matchAll(/data-point-sentence=""[^>]*>([^<]*)</g),
          ].map((m) => m[1]),
        };
      };
      const docked = rows("docked-side");
      expect(docked.rows.length).toBeGreaterThan(4);
      expect(docked.playing).toBe(2);
      expect(docked.selected).toBe(1);
      expect(docked.editors).toBe(6);
      expect(rows("black")).toEqual(docked);
    });
  });
});

/**
 * The film crosses into another stroke every second or two, and each
 * crossing renders the console. The rail's rows must not all render with it:
 * they are `memo` components, handed one `edit` and callbacks that keep
 * their identity.
 *
 * A static render has no second commit, so a row's bail-out cannot be
 * counted here. What is pinned instead is each piece of the mechanism: the
 * components are `memo`, the proxies keep one identity across renders of one
 * mount (a render-phase update re-runs a component with its hooks kept).
 */
test.describe("the rail's rows hold still while the film moves", () => {
  const MEMO = Symbol.for("react.memo");
  const LABELS = "src/components/admin/labels";

  test("the rows and the band are memo components; the well under the open row is not", () => {
    const loader = createLoader();
    const rows = loader.load(`${LABELS}/label-black-point-row.tsx`);
    for (const name of [
      "BlackPointRow",
      "BlackDeletedPoint",
      "BlackSuggestedPoint",
      "BlackGameOverflow",
    ]) {
      expect((rows[name] as { $$typeof?: symbol }).$$typeof, name).toBe(MEMO);
    }
    const { LabelGameBand } = loader.load(`${LABELS}/label-game-band.tsx`);
    expect((LabelGameBand as { $$typeof?: symbol }).$$typeof).toBe(MEMO);
    // The open point's well renders with the playing stroke: a plain function.
    const { BlackShotsWell } = loader.load(
      `${LABELS}/label-black-shot-row.tsx`,
    );
    expect(typeof BlackShotsWell).toBe("function");
  });

  test("useLatestHandlers: one identity per name across renders, calling through to the handler", () => {
    type Handlers = { a: (n: number) => number; b: () => string };
    const { useLatestHandlers } = createLoader().load(
      `${LABELS}/label-console.tsx`,
    ) as { useLatestHandlers: (handlers: Handlers) => Handlers };
    const seen: Handlers[] = [];
    const given: Handlers[] = [];
    function Probe() {
      const [pass, setPass] = React.useState(0);
      // Fresh closures on every render, as the console's handlers are.
      const handlers: Handlers = { a: (n) => n + pass, b: () => `b${pass}` };
      given.push(handlers);
      seen.push(useLatestHandlers(handlers));
      // A render-phase update: the same mount renders again, hooks kept.
      if (pass < 2) setPass(pass + 1);
      return null;
    }
    renderToStaticMarkup(React.createElement(Probe));
    expect(seen).toHaveLength(3);
    expect(given[1].a).not.toBe(given[0].a);
    for (const later of seen.slice(1)) {
      expect(later).toBe(seen[0]);
      expect(later.a).toBe(seen[0].a);
      expect(later.b).toBe(seen[0].b);
    }
    // A proxy, not the handler itself, and it calls through. (No effect runs
    // in a static render, so it is the first render's handler that answers.)
    expect(seen[0].a).not.toBe(given[0].a);
    expect(Object.keys(seen[0])).toEqual(["a", "b"]);
    expect(seen[0].a(40)).toBe(40);
    expect(seen[0].b()).toBe("b0");
  });
});
