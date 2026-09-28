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
      /<circle[^>]*fill="none"[^>]*r="4"|<circle[^>]*r="4"[^>]*fill="none"/g,
    ),
  ).toBe(3);
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
