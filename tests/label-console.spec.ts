import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
  expect(panelText).toMatch(
    /1 41:12\.0 Lee First serve In -0\.80, -0\.32 0\.60, 17\.79/,
  );
  expect(panelText).toMatch(/2 41:13\.1 Vargas Backhand In .* Edited/);
  expect(panelText).toMatch(/3 41:14\.4 Lee Forehand Out .* Added/);
  expect(panelText.indexOf("Deleted shot")).toBeLessThan(
    panelText.indexOf("41:14.4"),
  );
});

test("point rows: calculated on the left, labels and status on the right", () => {
  const html = render({
    session: labelSessionFixture(),
    video: null,
    initialExpandedPointId: null,
  });
  const out = text(html);
  expect(out).toContain(
    "Point Set · game Server Shots Won by Ending Ended by Status",
  );
  expect(out).toMatch(/1 1 · 1 Lee 3 Vargas Error Lee To check/);
  expect(out).toMatch(/2 1 · 1 Lee 1 Lee Ace Lee Checked/);
  // Nothing labelled yet: three dashes, each named for assistive technology.
  expect(out).toMatch(/4 1 · 2 Vargas 0 (— Not labelled ){3}To check/);
});

test("defaults to the first point still to check", () => {
  const html = render({ session: labelSessionFixture(), video: null });
  expect(html).toContain(`data-shots-for="${FIXTURE_POINT_IDS.P1}"`);
  expect(text(html)).toContain("Court · point 1");
});

test("the court is board 08's art, with the open point's strokes on it", () => {
  const html = render({
    session: labelSessionFixture(),
    video: null,
    initialExpandedPointId: FIXTURE_POINT_IDS.P1,
  });
  expect(html).toContain('viewBox="-6.2 -2.1 12.4 27.97"');
  expect(html).toContain('fill="#86AC91"');
  expect(html).toContain('fill="#6092CE"');
  // Three live strokes, each with a hit ring and a landing dot; the
  // tombstone draws nothing.
  expect(text(html)).toContain("3 strokes placed");
  expect(
    count(
      html,
      /<circle[^>]*fill="none"[^>]*r="3"|<circle[^>]*r="3"[^>]*fill="none"/g,
    ),
  ).toBe(3);
});

test("the band holds only the court card, at the video's old height", () => {
  const html = render({
    session: labelSessionFixture(),
    video: { url: "https://example.test/v.mp4?sig=x", startTimeSeconds: 0 },
  });
  // The court keeps the art's 12.4 × 27.97 m proportions (86 / 194 = 0.4433).
  const bandStart = html.indexOf('data-label-band=""');
  expect(bandStart).toBeGreaterThan(-1);
  expect(html).toMatch(/aria-label="Court"[^>]*class="[^"]*h-\[216px\]/);
  expect(html).toContain("h-[194px] w-[86px]");
  expect(html).not.toContain("h-[430px]");
  // The video left the band for the dock.
  expect(html).not.toContain("w-[384px]");
  expect(html.indexOf("<video")).toBeGreaterThan(
    html.indexOf('data-label-dock=""'),
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

  test("is the film tab's player, minus bookmarks and the film room", () => {
    const html = dock(render({ session: labelSessionFixture(), video: VIDEO }));
    expect(html).toContain('data-testid="film-player-video"');
    expect(html).toContain('src="https://example.test/v.mp4?sig=x"');
    expect(html).toContain('preload="metadata"');
    expect(html).toContain('aria-label="Previous point"');
    expect(html).toContain('aria-label="Next point"');
    expect(html).toContain('aria-label="Playback speed, 1×"');
    expect(html).not.toContain("Save point");
    expect(html).not.toContain("Open the film room fullscreen");
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
    expect(html).toContain('data-testid="film-player-video"');

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
    expect(html).toContain('aria-label="Point 1 won by: Vargas"');
    expect(html).toContain('aria-label="Shot 2 stroke: Backhand"');
    expect(html).toContain('aria-label="Shot 1 hit at: -0.80, -0.32"');
    expect(count(html, /role="button" tabindex="0"/g)).toBeGreaterThanOrEqual(
      3 * 3 + 3 * 6,
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
    // Player, stroke, result as selects; time, hit at, landed at as inputs.
    expect(count(selected, /<select/g)).toBe(3);
    expect(count(selected, /<input/g)).toBe(3);
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
    expect(count(html, EDITORS)).toBe(6);
  });

  test("the court asks where the selected stroke was hit", () => {
    const html = render({
      session: labelSessionFixture(),
      video: null,
      initialExpandedPointId: FIXTURE_POINT_IDS.P1,
      initialSelectedShotId: "s-return",
      ...SAVES,
    });
    // The art box is the control; the line under it is the prompt.
    expect(html).toMatch(/<button[^>]*data-court-target/);
    expect(html).toMatch(
      /data-court-prompt="[^"]*"[^>]*>Click where shot 2 was hit</,
    );
    // Its marks are ringed: a hit and a landing.
    expect(count(html, /data-selected-ring/g)).toBe(2);

    const none = render({
      session: labelSessionFixture(),
      video: null,
      initialExpandedPointId: FIXTURE_POINT_IDS.P1,
      ...SAVES,
    });
    expect(none).not.toContain("data-court-target");
    expect(text(none)).not.toContain("Click where");
    expect(text(none)).toContain("3 strokes placed");
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
    expect(html).not.toContain("data-court-target");
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

  test("marks a closed point without opening it", () => {
    const html = render({
      session: labelSessionFixture(),
      video: null,
      initialExpandedPointId: FIXTURE_POINT_IDS.P1,
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
    expect(text(html)).toContain("Court · point 1");
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
