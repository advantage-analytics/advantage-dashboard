import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { runReviewAnswer } from "@/components/admin/labels/review-answer";
import {
  fromCourt,
  fromCourtInHalf,
} from "@/components/admin/labels/court-geometry";
import {
  LABEL_MARK_META,
  type LabelMark,
  type LabelMarkCode,
  type LabelMarks,
} from "@/lib/services/labels/marks";
import type {
  LabelPoint,
  LabelSession,
  LabelVideo,
} from "@/lib/services/labels/session";
import { count, tag as tagOf, text } from "./fixtures/html-probe";
import {
  FIXTURE_POINT_IDS,
  editContext,
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
  initialLayoutMode?: "overview" | "black";
  initialReviewMode?: boolean;
  marks?: LabelMarks | null;
  upload?: unknown;
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

test("the overview is the match's data, read: no film, no court, no rail, one way in", () => {
  const html = render({
    session: labelSessionFixture(),
    video: null,
    initialLayoutMode: "overview",
    ...SAVES,
  });
  expect(html).toContain('data-label-layout-mode="overview"');
  expect(html).toContain("data-label-dashboard");
  // Nothing to label with: the film, the court and the points rail are not
  // mounted, and neither is the Layout menu that used to offer them.
  expect(html).not.toContain("<video");
  expect(html).not.toContain("data-label-rail-header");
  expect(html).not.toContain('data-row="point"');
  expect(html).not.toContain("data-label-layout=");
  expect(html).not.toContain("data-undo-last");
  // One primary, which opens full screen.
  expect(html.match(/data-open-labelling=""/g)).toHaveLength(1);
  // No upload was handed in, and the page says so rather than leaving the
  // card out.
  expect(text(html)).toContain("The upload’s inputs could not be read.");
});

test("the overview is six cards, with the upload's inputs and a publish checklist", () => {
  const upload = {
    playedAt: "2026-08-27T19:10:00Z",
    event: "vs Columbia University",
    round: null,
    matchType: "singles",
    courtType: "Indoor Hard Court",
    bestOf: 3,
    adScoring: false,
    playOnLets: true,
    enteredScore: "4–6, 6–0, 5–2",
    player1: { hand: "right", backhand: "two-handed" },
    player2: { hand: null, backhand: null },
    fixedCamera: true,
    topPlayerIsPlayer1: false,
    trim: { start: 26.3, end: 7044.2 },
    submittedAt: "2026-08-29T19:02:36Z",
    analysedAt: "2026-08-29T20:14:18Z",
    uploadedBy: "Sam Uploader",
    program: "Dartmouth College · Women’s",
    programCrestUrl: null,
    confidence: "low",
  };
  const html = render({
    session: labelSessionFixture(),
    video: null,
    initialLayoutMode: "overview",
    upload,
    ...SAVES,
  } as ConsoleProps);
  // One card a reading, the work on the left and the facts on the right.
  expect(
    [...html.matchAll(/data-dashboard-card="([^"]*)"/g)].map((m) => m[1]),
  ).toEqual([
    "Left to check",
    "Statistics from the labels",
    "Progress",
    "Before you publish",
    "Score",
    "Entered at upload",
  ]);
  // No design switch any more: one layout.
  expect(html).not.toContain("data-dashboard-design");
  // The inputs, as entered: the side that decides who every stroke is by,
  // the raw style values in words, and what was left blank said so.
  const out = text(html);
  expect(out).toContain("Starts on the far side");
  expect(out).toContain("Elena Vargas");
  expect(out).toContain("Right-handed, two-handed backhand");
  expect(out).toContain("Best of 3, no-ad scoring, lets played on");
  expect(out).toContain("0:26 to 1:57:24");
  expect(out).toContain("Not entered");
  expect(out).toContain("Uploaded by Sam Uploader on Aug 29, 2026");
  // The header names the program beside both players.
  expect(
    html.slice(
      html.indexOf("data-console-header"),
      html.indexOf("data-label-dashboard"),
    ),
  ).toContain("Dartmouth College · Women’s");
  // The checklist: five things, each done, open or blocking, in words.
  const states = [...html.matchAll(/data-publish-check="([^"]*)"/g)].map(
    (m) => m[1],
  );
  expect(states).toHaveLength(5);
  for (const state of states) {
    expect(["done", "open", "blocking"]).toContain(state);
  }
  expect(out).toContain("Every point checked");
  expect(out).toContain("2 of 3 still to check.");
});

test("a video that ends early holds no set to the record", () => {
  const html = render({
    session: { ...labelSessionFixture(), videoEndsEarly: true },
    video: null,
    initialLayoutMode: "overview",
    ...SAVES,
  } as ConsoleProps);
  const out = text(html);
  expect(out).toContain("The video ends before the match does");
  expect(out).not.toContain("against a record of");
});

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

test("a wide position is in the markup whole — as text, and on its court button", () => {
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
  expect(editing).toContain(
    'aria-label="Shot 1 hit at: -3.21, 18.40 — place on the court"',
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
  // A read or a key, not the word: prose and copy may say "flags".
  const dir = path.resolve("src/components/admin/labels");
  for (const file of readdirSync(dir)) {
    const source = readFileSync(path.join(dir, file), "utf8");
    expect(source, file).not.toMatch(
      /\.flags\b|\bflags\s*[:=?]|\[\s*["'`]flags["'`]\s*\]|\{[^}]*\bflags\b[^}]*\}\s*=/,
    );
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
    // The page's own header is the overview's.
    const overview = render({
      session: { ...labelSessionFixture(), status: "complete" },
      video: null,
      initialLayoutMode: "overview",
      ...SAVES,
    });
    expect(text(overview)).toContain("· Complete");
  });

  test("the header carries the progress and the save line, and no Save button", () => {
    const html = render({
      session: labelSessionFixture(),
      video: null,
      initialLayoutMode: "overview",
      ...SAVES,
    });
    const out = text(html);
    expect(out).toContain("Jordan Lee vs Elena Vargas");
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

  test.describe("the rail header", () => {
    test("the rail header's format tail follows adScoring and playOnLets", () => {
      const tail = (adScoring: boolean, playOnLets: boolean) => {
        const html = render({
          session: { ...labelSessionFixture(), adScoring, playOnLets },
          video: VIDEO,
          initialLayoutMode: "black",
        });
        // Off the header's face, full screen being for the data alone: the
        // format is the progress count's tooltip, and an attribute here.
        return /data-match-format="([^"]*)"/.exec(html)?.[1] ?? "";
      };
      expect(tail(true, false)).toBe("Ad scoring · Lets replayed");
      expect(tail(true, true)).toBe("Ad scoring · Lets: play on");
      expect(tail(false, false)).toBe("No-ad scoring · Lets replayed");
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
      // The progress leads; the match is its name for a reader, not a title.
      expect(text(header)).toMatch(/\d+ \/ \d+/);
      expect(header).toMatch(
        /aria-label="\d+ of \d+ points checked\. Jordan Lee vs Elena Vargas"/,
      );
      expect(header).not.toContain("data-label-rail-title");
      expect(header).toContain("data-save-status");
      expect(count(html, /data-save-status=/g)).toBe(1);
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

test.describe("a flag jump lands on the point's review step", () => {
  const consoleSource = readFileSync(
    "src/components/admin/labels/label-console.tsx",
    "utf8",
  );
  /** `landOnStep`'s body, up to `findGap`'s comment after it. */
  const landSource = consoleSource.slice(
    consoleSource.indexOf("  function landOnStep("),
    consoleSource.indexOf('"Find the gap": navigation only.'),
  );
  /** `findGap`'s body, up to the jump effect after it. */
  const findGapSource = consoleSource.slice(
    consoleSource.indexOf("  function findGap("),
    consoleSource.indexOf("const pointId = jumpToPointId.current;"),
  );

  test("a court click answers the step only on its own stroke, once both ends are placed", () => {
    const placeSource = consoleSource.slice(
      consoleSource.indexOf("  function place(point: CourtPoint)"),
      consoleSource.indexOf("  function setTarget("),
    );
    // Only in review mode, only on the inline block's stroke, only once both
    // ends are placed: the step's own stroke notes the step, a stroke with no
    // step about it (the one an answer added) forces the move on.
    expect(placeSource).toMatch(
      /if \(\n\s+reviewMode &&\n\s+inlineAnchor\?\.strokeId === shot\.id &&\n\s+placesBothEnds\(shot, next\.patch\)\n\s+\) \{/,
    );
    expect(placeSource).toContain(
      "if (step?.target.shotId === shot.id) noteAnswered();",
    );
    expect(placeSource).toContain("else notePlaced();");
    expect(placeSource.match(/noteAnswered\(\)/g)).toHaveLength(1);
    expect(placeSource.match(/notePlaced\(\)/g)).toHaveLength(1);
  });

  test("`]` and the header's flag rows are the only jumps that arm", () => {
    expect(consoleSource).toMatch(
      /stepToFlag\.current\(key === "\]" \? 1 : -1, "score"\)/,
    );
    expect(consoleSource).toContain(
      "if (flag) findGap(flag.pointId, { arm: true });",
    );
    expect(consoleSource).toContain(
      "goToFlag: (pointId: string) => findGap(pointId, { arm: true }),",
    );
    expect(consoleSource).toContain("onGoToPoint={railHandlers.goToFlag}");
    // "Find the gap", the overview's open-on-point and a clicked row do not.
    expect(consoleSource).toContain(
      "onFindGap={operable ? railHandlers.findGap : undefined}",
    );
    expect(consoleSource).toContain(
      "jumpAfterOpen.current = (pointId) => findGap(pointId);",
    );
    // The third is the auto-advance's own jump to the next flagged point.
    expect(consoleSource.match(/arm: true/g)).toHaveLength(3);
    expect(consoleSource).toMatch(
      /if \(stop && stop\.pointId !== fromPointId\)\s+findGap\(stop\.pointId, \{ arm: true \}\);/,
    );
    // The old block focus and the older target are gone.
    expect(consoleSource).not.toContain("reviewFocusTarget");
    expect(consoleSource).not.toContain("focusItem");
    expect(consoleSource).not.toContain("reviewItemTarget");
    expect(consoleSource).not.toContain("currentReviewItem");
  });

  test("the jump lands on `reviewStep`'s target: a stroke on its end, or a slot", () => {
    // Only where a click may write; the point opens unfolded so ↓ steps on.
    expect(findGapSource).toMatch(/arm && editable && point && liveMarks/);
    expect(findGapSource).toContain("if (arm) setFoldedPointId(null);");
    expect(findGapSource).toMatch(
      /landOnStep\(\s*point,\s*reviewStep\(point, liveMarks, points, names, drawsGhosts\(liveMarks\)\),\s*\)/,
    );
    // With no step the point opens as before, at its first stroke.
    expect(findGapSource).toContain("seekToPointStart(point);");
    // The placement is cleared before the step is landed on, never after.
    expect(findGapSource.indexOf("setPlacement(NO_PLACEMENT);")).toBeLessThan(
      findGapSource.indexOf("landOnStep("),
    );
    // A coordinate item: its stroke, on the end the step names.
    expect(landSource).toMatch(
      /selectShot\(target\.shotId, target\.place, \{\n\s+seek: film === null,\n\s+review: true,\n\s+\}\);/,
    );
    // An item with nothing to place: the film at its stroke, the court not
    // armed (no selection, the placement cleared).
    expect(landSource).toContain("} else if (target?.shotId) {");
    expect(landSource).toContain("player.current?.seekTo(shot.videoTime);");
    // A missing stroke: the slot armed, nothing selected, nothing written —
    // the film at the stroke it follows.
    expect(landSource).toContain("if (target?.slot) {");
    expect(landSource).toContain(
      "setArmedSlot({ pointId: point.id, afterShotId: target.slot.afterShotId });",
    );
    expect(landSource).toContain(
      "if (after?.videoTime != null) player.current?.seekTo(after.videoTime);",
    );
    expect(landSource).not.toContain("addShot(");
    // No target: the point at its first stroke, as a plain open.
    expect(landSource).toContain("if (film === null) seekToPointStart(point);");
    // The rail asks the point's review step, inline, and draws the slot.
    expect(consoleSource).toContain("reviewInline={reviewInline}");
    expect(consoleSource).toContain("step={step}");
    expect(consoleSource).toContain("anchor={inlineAnchor}");
    expect(consoleSource).toContain(
      "armedSlotAfterShotId={armedSlot?.afterShotId ?? null}",
    );
  });

  test("an end-of-point step replays the last strokes: one seek, paused after the last ball", () => {
    expect(landSource).toContain(
      "replayWindow(point, step.replay, points, drawsGhosts(liveMarks))",
    );
    // The replay's seek is the one that wins: selectShot's is skipped.
    expect(landSource).toMatch(/seek: film === null/);
    expect(landSource).toContain("replay.current = runReplay(film, {");
    expect(landSource).toContain("pause: () => handle.pause(),");
    // Let go when the labeller moves the film, jumps, selects or answers.
    expect(consoleSource).toContain("onPause={cancelReplay}");
    const keys = consoleSource.slice(
      consoleSource.indexOf('if (key === "Enter") checkOpenPoint.current();'),
      consoleSource.indexOf('window.addEventListener("keydown", onKeyDown);'),
    );
    expect(keys.match(/cancelReplayRef\.current\(\);/g)).toHaveLength(2);
    // A row click lets the replay go; a jump or an answer also stops the
    // film, so a replay never plays on into the next point.
    const togglePoint = consoleSource.slice(
      consoleSource.indexOf("function togglePoint("),
    );
    expect(togglePoint.slice(0, togglePoint.indexOf("\n  }\n"))).toContain(
      "cancelReplay();",
    );
    const findGap = consoleSource.slice(
      consoleSource.indexOf("function findGap("),
    );
    expect(findGap.slice(0, findGap.indexOf("\n  }\n"))).toContain(
      "stopReplay();",
    );
    expect(consoleSource).toMatch(
      /function answerReview\(answer: ReviewAnswer\) \{\n {4}if \(!expanded\) return;\n {4}stopReplay\(\);/,
    );
    expect(consoleSource).toContain(
      "if (replay.current && player.current?.isPlaying()) player.current.pause();",
    );
    const selectShot = consoleSource.slice(
      consoleSource.indexOf("  function selectShot("),
      consoleSource.indexOf(
        "  // An editor opening on a point row's own cells",
      ),
    );
    expect(selectShot).toContain("if (seek) cancelReplay();");
    expect(selectShot).toContain("if (seek && shot?.videoTime != null) {");
  });

  test("auto-advance: after a write made here the point's next step lands; never from a refresh", () => {
    const effect = consoleSource.slice(
      consoleSource.indexOf("const landOnStepRef = useRef(landOnStep);"),
      consoleSource.indexOf("// The armed slot belongs to the open point"),
    );
    // Only a write of the console's own arms it (`noteAnswered`).
    expect(effect).toContain("const pending = pendingAdvance.current;");
    expect(effect).toContain(
      "if (!pending || !expanded || pending.pointId !== expanded.id) return;",
    );
    expect(effect).toContain(": advanceAfterAnswer(pending.key, stepKey);");
    // A forced advance (a stroke placed with no step about it) lands
    // whatever is next, the key unchanged or not.
    expect(effect).toMatch(
      /const verdict = pending\.force\n\s+\? stepKey === ""\n\s+\? "done"\n\s+: "advance"\n\s+: advanceAfterAnswer/,
    );
    expect(effect).toContain('if (verdict === "stay") return;');
    expect(effect).toContain("pendingAdvance.current = null;");
    // Only in review mode; not under a confirm, a menu or a dialog.
    expect(effect).toContain("if (!reviewMode || confirm) return;");
    expect(effect).toContain(
      "\"[role='menu'], [role='dialog'], [role='alertdialog']\"",
    );
    // Another item on the point lands; none goes on to the next flagged point.
    expect(effect).toContain(
      'if (verdict === "advance") landOnStepRef.current(expanded, step);',
    );
    expect(effect).toContain("else reviewJumpRef.current(expanded.id);");
    expect(effect).toContain(
      "const stop = nextReviewStop(points, liveMarks, fromPointId, 1);",
    );
    expect(effect).toContain("}, [stepKey, points, confirm, reviewMode]);");
    // The writes that arm it: an answer (not one that adds a stroke — that
    // stroke is the one to place next), a court placement, a dismiss.
    const answerSource = consoleSource.slice(
      consoleSource.indexOf("  function answerReview("),
      consoleSource.indexOf("  function setEstimate("),
    );
    // "Looks right" notes the step and empties the queue, so the tick's
    // settling moves on to the next flagged point; an added stroke closes
    // its item without landing anywhere; every other answer notes the step.
    expect(answerSource).toContain('write.write === "check"');
    expect(answerSource).toContain("keep: []");
    expect(answerSource.match(/noteAnswered\(\);/g)).toHaveLength(2);
    expect(answerSource).toContain('write.write === "addShot"');
    expect(answerSource).toContain("closeQueuedItem();");
    expect(answerSource).toContain("noteAnswered();");
    const place = consoleSource.slice(
      consoleSource.indexOf("  function place(point: CourtPoint) {"),
      consoleSource.indexOf("  // The court panel's Contact / Landing switch"),
    );
    expect(place).toContain("noteAnswered();");
    expect(consoleSource).toContain(
      "if (pointId === currentPointId) noteAnswered();",
    );
    // A jump clears it: the next flagged point is `]`'s to reach, not the
    // console's own.
    expect(findGapSource).toContain("pendingAdvance.current = null;");
    expect(consoleSource.match(/noteAnswered\(\);/g)).toHaveLength(4);
  });

  test("↓ and ] still step after a jump that selected a stroke", () => {
    // ↓ walks from the selected stroke of the unfolded point; ] steps flags
    // from the current point. Neither reads anything the jump leaves behind.
    const stepShot = consoleSource.slice(
      consoleSource.indexOf("stepShot.current = (direction) => {"),
      consoleSource.indexOf("undoLastRef.current = () =>"),
    );
    expect(stepShot).toContain("unfoldedPointId !== expanded.id");
    expect(stepShot).toContain(
      "shots.findIndex((shot) => shot.id === placement.shotId)",
    );
    const stepFlag = consoleSource.slice(
      consoleSource.indexOf("stepToFlag.current = (direction, kind) => {"),
      consoleSource.indexOf("stepShot.current = (direction) => {"),
    );
    expect(stepFlag).toContain(
      "stepFlag(flagStops[kind], points, currentPointId, direction)",
    );
  });

  test("a landing lets go of a focused text field, and only of one — a jump's and an advance's alike", async ({
    page,
  }) => {
    const selector = /const JUMP_BLURS_SELECTOR =\s*"([^"]+)";/.exec(
      consoleSource,
    )?.[1];
    expect(selector).toBeTruthy();
    // Blurred in landOnStep, before anything is selected or armed — the one
    // road both a flag jump and the auto-advance take.
    expect(landSource).toContain(
      "if (active?.closest?.(JUMP_BLURS_SELECTOR)) active.blur();",
    );
    expect(landSource.indexOf("active.blur()")).toBeLessThan(
      landSource.indexOf("if (target?.slot) {"),
    );
    expect(consoleSource.match(/active\.blur\(\)/g)).toHaveLength(1);
    await page.setContent(`
      <input id="input" />
      <textarea id="textarea"></textarea>
      <select id="select"><option>a</option></select>
      <div id="editable" contenteditable="true" tabindex="0">x</div>
      <div data-select-editor=""><button id="editor" type="button">Forehand</button></div>
      <button id="plain" type="button">Point</button>
    `);
    const blurred = await page.evaluate((selector) => {
      const out: Record<string, boolean> = {};
      for (const id of [
        "input",
        "textarea",
        "select",
        "editable",
        "editor",
        "plain",
      ]) {
        const el = document.getElementById(id) as HTMLElement;
        el.focus();
        // What the landing does with the focused element.
        const active = document.activeElement as HTMLElement | null;
        if (active?.closest?.(selector)) active.blur();
        out[id] = document.activeElement !== el;
      }
      return out;
    }, selector!);
    expect(blurred).toEqual({
      input: true,
      textarea: true,
      select: true,
      editable: true,
      editor: true,
      plain: false,
    });
  });

  test("the armed slot's row is drawn solid in the rail", () => {
    const row = readFileSync(
      "src/components/admin/labels/label-black-shot-row.tsx",
      "utf8",
    );
    expect(row).toContain(
      "const armed = edit.armedSlotAfterShotId === suggestion.afterShotId;",
    );
    expect(row).toContain('data-slot-armed={armed ? "" : undefined}');
    expect(row).toContain('armed ? "outline-solid" : "outline-dashed"');
  });
});

test.describe("review mode: the step asked inline in the rail", () => {
  const consoleSource = readFileSync(
    "src/components/admin/labels/label-console.tsx",
    "utf8",
  );
  const between = (from: string, to: string) =>
    consoleSource.slice(
      consoleSource.indexOf(from),
      consoleSource.indexOf(to, consoleSource.indexOf(from)),
    );

  test("a flag jump enters it; the labeller's own selection ends it", () => {
    expect(consoleSource).toContain(
      "const [reviewMode, setReviewMode] = useState(initialReviewMode);",
    );
    // `findGap` with `arm` (] [ ' ; and the header's flag rows) enters;
    // without it ("Find the gap", the overview's open) leaves.
    const findGap = between(
      "  function findGap(",
      "const pointId = jumpToPointId.current;",
    );
    expect(findGap).toContain(
      "setReviewMode(Boolean(arm && editable && point && liveMarks));",
    );
    // A point row, a stroke row or cell, ↑ / ↓: the user's choice wins.
    const togglePoint = between("  function togglePoint(", "\n  }\n");
    expect(togglePoint).toContain("setReviewMode(false);");
    const selectShot = between(
      "  function selectShot(",
      "  // An editor opening on a point row's own cells",
    );
    expect(selectShot).toContain("if (!review) setReviewMode(false);");
    // Only a step's landing selects without leaving.
    expect(consoleSource.match(/review: true/g)).toHaveLength(1);
    // The inline block, the auto-advance and the left panel's hand-off all
    // read the one anchor, which is null outside review mode.
    expect(consoleSource).toMatch(
      /const inlineAnchor =\n\s+reviewMode && expanded\n\s+\? inlineReviewAnchor\(expanded, step, placement, drawsGhosts\(liveMarks\)\)\n\s+: null;/,
    );
    expect(consoleSource).toContain(
      "const reviewActive = inlineAnchor !== null;",
    );
    expect(consoleSource).toContain(
      "const panelPlacement = reviewActive ? NO_PLACEMENT : placement;",
    );
    expect(consoleSource).toContain("placement={panelPlacement}");
    // The old column's props are gone from the panel.
    expect(consoleSource).not.toContain(
      "onAnswer={operable ? answerReview : undefined}\n      onEstimate={editable ? setEstimate : undefined}\n      clock=",
    );
  });

  /** The fixture's ace stored as the receiver's winner: item 4 asks about it. */
  function reviewSession(): LabelSession {
    const session = labelSessionFixture();
    return {
      ...session,
      points: session.points.map((point) =>
        point.id === FIXTURE_POINT_IDS.P2
          ? {
              ...point,
              checkedAt: null,
              ending: "winner" as const,
              endedBy: "p2" as const,
              shots: point.shots.map((s) => ({
                ...s,
                contactX: -1,
                contactY: -0.4,
                landingX: 0.6,
                landingY: 17.79,
              })),
            }
          : point,
      ),
    };
  }
  const EMPTY_MARKS = {
    points: {},
    shots: {},
    suggestions: [],
    serveSides: {},
  } as unknown as LabelMarks;

  test("in review mode the step sits under its stroke's row and owns the one placing court; the left panel follows the film", () => {
    const html = render({
      session: reviewSession(),
      marks: EMPTY_MARKS,
      video: null,
      initialExpandedPointId: FIXTURE_POINT_IDS.P2,
      initialSelectedShotId: "s-ace",
      initialReviewMode: true,
      initialVideoTime: 2490.2,
      ...SAVES,
    });
    const block = html.indexOf('data-review-inline="4"');
    expect(block).toBeGreaterThan(html.indexOf('data-shot-id="s-ace"'));
    // Inside the point's own well, under its one stroke.
    expect(shotPanel(html, FIXTURE_POINT_IDS.P2)).toContain(
      'data-review-inline="4"',
    );
    expect(count(html, /data-review-inline=/g)).toBe(1);
    // One placing court, the block's; the left panel is a picture of the
    // whole court with nothing selected, and its info line.
    expect(count(html, /data-court-target=""/g)).toBe(1);
    expect(html.indexOf("data-court-target")).toBeGreaterThan(block);
    const panel = html.slice(
      html.indexOf("data-court-panel"),
      html.indexOf("data-court-box"),
    );
    expect(panel).not.toContain("data-court-steps");
    expect(tagOf(html, "data-court-panel")).not.toContain("review");
    expect(html).toMatch(/data-court-panel=""[\s\S]*?data-court-view="whole"/);
    // The film is on the ace: the line counts the rally so far.
    expect(html).toMatch(
      /data-court-info=""[^>]*>0–15 · Lee serving · shot 1 of 1 · 1 to review</,
    );
    // The block's court is zoomed to the selected end's half with the
    // stroke's own marks — an initial selection opens on the contact; a
    // flag jump's landing would pick the step's end (`landOnStep`).
    const inline = html.slice(block);
    expect(inline).toContain('data-court-view="near"');
    expect(inline).toContain('data-selected-ring="contact"');
    expect(inline).toMatch(
      /data-review-question=""[^>]*>How did the last ball end\?</,
    );
    // The answers need the console's operations (`operable`), which this
    // render has none of: the question stands, its answers do not.
    expect(inline).not.toContain("data-review-answers");
    expect(consoleSource).toContain(
      "onAnswer={operable ? answerReview : undefined}",
    );
  });

  test("outside review mode the same selection is the left panel's: no block, the panel zoomed", () => {
    const html = render({
      session: reviewSession(),
      marks: EMPTY_MARKS,
      video: null,
      initialExpandedPointId: FIXTURE_POINT_IDS.P2,
      initialSelectedShotId: "s-ace",
      initialVideoTime: 2490.2,
      ...SAVES,
    });
    expect(html).not.toContain("data-review-inline");
    expect(count(html, /data-court-target=""/g)).toBe(1);
    expect(html).toMatch(/data-court-panel=""[\s\S]*?data-court-steps/);
    expect(html).not.toContain("data-court-info");
    // Read-only: no block either way.
    const readOnly = render({
      session: reviewSession(),
      marks: EMPTY_MARKS,
      video: null,
      initialExpandedPointId: FIXTURE_POINT_IDS.P2,
      initialReviewMode: true,
    });
    expect(readOnly).not.toContain("data-court-target");
    expect(readOnly).toContain('data-review-inline="4"');
    expect(readOnly).not.toContain("data-review-answers");
  });
});

test.describe("a review answer's writes go through the console's own handlers", () => {
  const consoleSource = readFileSync(
    "src/components/admin/labels/label-console.tsx",
    "utf8",
  );

  test("each ReviewWrite kind is one call of the handler it names", async () => {
    const calls: unknown[][] = [];
    const record =
      (name: string) =>
      (...args: unknown[]) =>
        calls.push([name, ...args]);
    const handlers = {
      patchShot: record("patchShot"),
      patchPoint: record("patchPoint"),
      splitPoint: record("splitPoint"),
      removeShotsAfter: record("removeShotsAfter"),
      dismissSuggestion: record("dismissSuggestion"),
      setChecked: record("setChecked"),
      addShot: record("addShot"),
    };
    await runReviewAnswer(
      {
        writes: [
          { write: "shot", shotId: "s1", patch: { result: "net" } },
          { write: "point", patch: { ending: "error", ended_by: "p1" } },
          { write: "split", shotId: "s2" },
          { write: "removeAfter", shotId: "s3" },
          { write: "dismiss", keys: ["hint:a", "hint:b"] },
          { write: "check" },
          {
            write: "addShot",
            slot: { afterShotId: "s4", hitter: "p1", kind: "second_serve" },
          },
          {
            write: "addShot",
            slot: { afterShotId: "s5", hitter: null, kind: null },
          },
        ],
      },
      "pt",
      handlers,
    );
    expect(calls).toEqual([
      ["patchShot", "s1", { result: "net" }],
      ["patchPoint", "pt", { ending: "error", ended_by: "p1" }],
      ["splitPoint", "pt", "s2"],
      ["removeShotsAfter", "pt", "s3"],
      ["dismissSuggestion", "pt", "hint:a"],
      ["dismissSuggestion", "pt", "hint:b"],
      ["setChecked", "pt", true],
      // The slot's hitter and stroke follow the add, once it has saved.
      ["addShot", "pt", "s4", { hitter: "p1", stroke: "second_serve" }],
      ["addShot", "pt", "s5", undefined],
    ]);
  });

  test("a write in flight is waited on before the next", async () => {
    const order: string[] = [];
    let release = () => {};
    const shot = new Promise<void>((resolve) => {
      release = () => {
        order.push("shot saved");
        resolve();
      };
    });
    const noop = () => {};
    const run = runReviewAnswer(
      {
        writes: [
          { write: "shot", shotId: "s1", patch: { result: "out" } },
          { write: "point", patch: { winner: "p2" } },
        ],
      },
      "pt",
      {
        patchShot: () => shot,
        patchPoint: () => order.push("point"),
        splitPoint: noop,
        removeShotsAfter: noop,
        dismissSuggestion: noop,
        setChecked: noop,
        addShot: noop,
      },
    );
    await Promise.resolve();
    expect(order).toEqual([]);
    release();
    await run;
    expect(order).toEqual(["shot saved", "point"]);
  });

  test("the console hands each kind its own handler, the add-shot path included", () => {
    const wiring = consoleSource.slice(
      consoleSource.indexOf("const reviewWrites: ReviewWriteHandlers = {"),
      consoleSource.indexOf("function answerReview("),
    );
    for (const line of [
      "patchShot: railHandlers.saveShot,",
      "patchPoint: railHandlers.patchPoint,",
      "splitPoint: rowOperations.onSplitPoint,",
      "removeShotsAfter: railHandlers.removeShotsAfter,",
      "dismissSuggestion: rowOperations.onDismissSuggestion,",
      "setChecked: rowOperations.onSetChecked,",
      "addShot: railHandlers.addShot,",
    ]) {
      expect(wiring, line).toContain(line);
    }
    // `saveShot` is the awaited shot write; `addShot` the console's own,
    // which selects the saved stroke for placement.
    expect(consoleSource).toContain("saveShot: patchShot,");
    expect(consoleSource).toMatch(/\n {4}addShot,\n/);
    expect(consoleSource).toContain(
      "onAnswer={operable ? answerReview : undefined}",
    );
    // The estimate box writes `unclear` through the rail's shot edit.
    expect(consoleSource).toContain(
      "estimatePatch(shot.unclear, placement.target, estimate)",
    );
    // The old view-model is gone.
    expect(consoleSource).not.toContain("courtReview");
  });
});

test("several dismisses at once settle by merging, so none of them flickers back", () => {
  const source = readFileSync(
    "src/components/admin/labels/label-console.tsx",
    "utf8",
  );
  const body = source.slice(
    source.indexOf(
      "  function dismissSuggestion(pointId: string, key: string) {",
    ),
  );
  const fn = body.slice(0, body.indexOf("\n  }\n"));
  expect(fn).toContain("...new Set([...p.dismissed, ...result.dismissed])");
  expect(fn).toContain("p.dismissed.filter((k) => k !== key)");
  expect(fn).not.toContain("dismissed: result.dismissed,");
});
