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

/** The labelling console, rendered offline from the fixture session: docked side unless a render asks for `black`. */

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
  // placement · result.
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
  expect(still).toContain('data-court-view="whole"');
  expect(still).not.toContain("data-court-target");
  expect(still).toContain('aria-label="Court with no strokes placed"');
  expect(courtMarks(still)).not.toContain("<circle");
  // No switch until something is being placed.
  expect(still).not.toContain("data-court-steps");

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
  expect(serve).toMatch(/data-court-hit=""[^>]*style="opacity:1;/);
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
});

test("no labels component reads a flags field", () => {
  const dir = path.resolve("src/components/admin/labels");
  for (const file of readdirSync(dir)) {
    const source = readFileSync(path.join(dir, file), "utf8");
    expect(source, file).not.toMatch(/\bflags\b/i);
  }
});

test.describe("editing (T6)", () => {
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

  test("the docked header carries one Layout menu trigger", () => {
    const html = render({ session: labelSessionFixture(), video: VIDEO });
    expect(count(html, /data-label-layout=""/g)).toBe(1);
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
        // The rail: as wide as asked, with the one separator in the console.
        const rail = tagOf(html, 'data-label-rail=""');
        expect(rail).toContain('aria-label="Points"');
        expect(rail).toContain('data-rail-tone="light"');
        expect(rail).toContain("width:700px");
        expect(count(html, /role="separator"/g)).toBe(1);
        expect(tagOf(railOf(html), 'role="separator"')).toContain(
          'aria-valuenow="700"',
        );
      }
    });

    test("the rail header's format tail follows adScoring and playOnLets", () => {
      const tail = (adScoring: boolean, playOnLets: boolean) => {
        const html = render({
          session: { ...labelSessionFixture(), adScoring, playOnLets },
          video: VIDEO,
          initialLayoutMode: "black",
        });
        const tag = from(html, "data-match-format", "data-save-status");
        return text(tag);
      };
      expect(tail(true, false)).toContain("· Ad scoring · Lets replayed");
      expect(tail(true, true)).toContain("· Ad scoring · Lets: play on");
      expect(tail(false, false)).toContain("· No-ad scoring · Lets replayed");
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
      expect(header).not.toContain("data-match-format");
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
      // No exit: this is not a full screen.
      expect(html).not.toContain("data-label-black-exit");
      expect(html).not.toContain("Exit full screen");
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

      // The rail, as wide as asked, with its handle.
      const rail = railOf(html);
      expect(tagOf(rail, 'data-label-rail=""')).toContain("width:700px");
      expect(tagOf(rail, 'data-label-rail=""')).toContain(
        'data-rail-tone="dark"',
      );
      expect(count(html, /role="separator"/g)).toBe(1);

      // Nothing under the layer to Tab through: the console's own light
      // header is not drawn at all (the rail's header carries its facts and
      // the way out), and the page's chrome is made inert on mount.
      expect(html).not.toContain("data-console-header");
      expect(html).not.toContain("<h1");
      expect(html).not.toContain('data-label-layout=""');
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
      expect(text(header)).toMatch(/checked\s*· Ad scoring · Lets replayed/);
      expect(header).toContain('aria-label="Exit full screen"');
      expect(tagOf(header, "data-label-black-exit")).toContain(
        '<button type="button"',
      );
      expect(count(html, /data-label-black-exit/g)).toBe(1);
      // Already full screen: no way in.
      expect(html).not.toContain("data-label-rail-full-screen");
      // The rows: one per live point, the tombstone's marker, the bands,
      // and the well under the open point only.
      expect(count(rail, /data-row="point"/g)).toBe(3);
      expect(count(rail, /data-row="deleted-point"/g)).toBe(1);
      expect(count(rail, /data-game-band="/g)).toBeGreaterThan(0);
      expect(rail).toContain(`data-shots-for="${FIXTURE_POINT_IDS.P1}"`);
      expect(count(rail, /data-shots-well/g)).toBe(1);
      expect(rail).toContain("data-point-sentence");
      expect(rail).toContain('data-row="shot"');
      // The default width, when none is asked for.
      expect(tagOf(rail, 'data-label-rail=""')).toContain("width:640px");
      expect(tagOf(rail, 'role="separator"')).toContain('aria-valuenow="640"');
    });
  });
});

/** Each film crossing renders the console; the rows are `memo`, handed callbacks that keep their identity. */
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
