import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { advButton } from "@/lib/ui/adv-button";
import {
  LABEL_MARK_META,
  type LabelMark,
  type LabelMarkCode,
  type LabelMarks,
} from "@/lib/services/labels/marks";
import {
  firstAmberStop,
  labellerSession,
} from "@/lib/services/labels/labeller-view";
import type { LabelSession } from "@/lib/services/labels/session";
import { text } from "./fixtures/html-probe";
import { labelPoint, labelSessionFixture } from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The labeller's console (`/label/[sessionId]`), rendered offline: what a
 * labeller sees and does not, the admin header left exactly as it was, and
 * the point the page opens on. No database.
 */

type Props = Record<string, unknown>;

function render(props: Props): string {
  const { LabelConsole } = createLoader().load(
    "src/components/admin/labels/label-console.tsx",
  ) as { LabelConsole: React.ComponentType<Props> };
  return renderToStaticMarkup(React.createElement(LabelConsole, props));
}

/** The whole element (a `<div>`) carrying `attr`, matched to its close. */
function divAt(html: string, attr: string): string {
  const at = html.indexOf(attr);
  expect(at, attr).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<div", at);
  const tags = /<div\b|<\/div>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    depth += m[0] === "</div>" ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  throw new Error(`unbalanced <div> at ${attr}`);
}

const save = async () => ({ ok: true });
/** Every operation, never called by a static render. */
const OPERATIONS = new Proxy({}, { get: () => save });

/** What the uploader entered: the program the admin header names. */
const UPLOAD = {
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

function consoleProps(overrides: Props = {}): Props {
  return {
    session: labelSessionFixture(),
    video: null,
    initialLayoutMode: "overview",
    onSaveShot: save,
    onSavePoint: save,
    operations: OPERATIONS,
    ...overrides,
  };
}

const NAMES = ["Jordan Lee", "Elena Vargas", "Lee", "Vargas"];

test.describe("viewerKind=labeller", () => {
  for (const mode of ["overview", "black"] as const) {
    test(`no player, program, admin link or derivation; Near and Far player; Submit for review (${mode})`, () => {
      const html = render(
        consoleProps({
          viewerKind: "labeller",
          initialLayoutMode: mode,
          // Even handed the upload, the labeller header names no program.
          upload: mode === "overview" ? null : UPLOAD,
        }),
      );
      for (const name of NAMES) expect(html).not.toContain(name);
      expect(html).not.toContain("/admin");
      expect(html).not.toContain("derivation");
      expect(html).not.toContain("Dartmouth");
      if (mode === "overview") {
        expect(html).toContain("data-submit-review");
        expect(text(divAt(html, "data-console-header"))).toContain(
          "Submit for review",
        );
      }
      expect(html).not.toContain("data-mark-complete");
      expect(html).not.toContain("data-reopen-session");
    });
  }

  test("the rail and the tray say Near player and Far player", () => {
    const html = render(
      consoleProps({ viewerKind: "labeller", initialLayoutMode: "black" }),
    );
    expect(html).toContain("Near player");
    expect(html).toContain("Far player");
  });

  test("the session the page passes carries no identifying field", () => {
    const stripped = labellerSession(labelSessionFixture());
    const json = JSON.stringify(stripped);
    for (const name of NAMES) expect(json).not.toContain(name);
    expect(json).not.toContain(labelSessionFixture().matchId);
    expect(json).not.toContain(labelSessionFixture().jobId as string);
    expect(json).not.toContain(labelSessionFixture().derivationVersion);
    expect(stripped.points).toEqual(labelSessionFixture().points);
  });

  test("a submitted session is read-only and waits for review", () => {
    const html = render(
      consoleProps({
        viewerKind: "labeller",
        session: { ...labelSessionFixture(), status: "submitted" },
      }),
    );
    const header = divAt(html, "data-console-header");
    expect(text(header)).toContain("Submitted — waiting for review");
    expect(header).not.toContain("data-submit-review");
    expect(header).not.toContain("data-mark-complete");
    expect(header).not.toContain("data-reopen-session");
    // Read-only: the rail offers no editors and no Undo.
    const black = render(
      consoleProps({
        viewerKind: "labeller",
        initialLayoutMode: "black",
        session: { ...labelSessionFixture(), status: "submitted" },
      }),
    );
    expect(black).not.toContain("data-select-editor");
  });
});

test.describe("viewerKind=admin", () => {
  const OUTLINE = advButton("outline", "sm");
  const PRIMARY = advButton("primary", "sm");
  /**
   * The admin header for the fixture's labelling session, as it rendered
   * before `viewerKind` existed (captured from the commit before it). Byte
   * for byte: the labeller work must not move a thing in the admin's header.
   */
  const BEFORE = [
    `<div data-console-header="" class="flex shrink-0 items-end justify-between gap-8">`,
    `<div class="flex min-w-0 items-center gap-4">`,
    `<span class="flex shrink-0">`,
    `<span aria-hidden="true" class="flex shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] font-medium text-[var(--ink-700)] relative size-10 text-[12px]">JL`,
    `</span>`,
    `<span aria-hidden="true" class="flex shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] font-medium text-[var(--ink-700)] -ml-2.5 size-10 text-[12px] shadow-[0_0_0_2px_var(--surface-card)]">EV`,
    `</span>`,
    `</span>`,
    `<div class="flex min-w-0 flex-col gap-1.5">`,
    `<h1 class="text-display truncate">Jordan Lee vs Elena Vargas`,
    `</h1>`,
    `<p class="flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--ink-600)]">`,
    `<span aria-hidden="true" class="size-[26px] rounded-[8px] text-[9px] font-medium tracking-[0.2px] text-[var(--ink-600)] flex flex-none items-center justify-center overflow-hidden bg-[var(--surface-subtle)] leading-none whitespace-nowrap">DW`,
    `</span>`,
    `<span>Dartmouth College · Women’s`,
    `</span>`,
    `<span aria-hidden="true">·`,
    `</span>`,
    `<span class="tabular">1 of 3 points checked`,
    `</span>`,
    `<span aria-hidden="true">·`,
    `</span>`,
    `<span class="mono text-[11px] text-[var(--ink-500)]">derivation 0.3.2`,
    `</span>`,
    `</p>`,
    `</div>`,
    `</div>`,
    `<div class="flex shrink-0 items-center gap-5">`,
    `<span data-save-status="idle" role="status" aria-live="polite">`,
    `</span>`,
    `<button type="button" data-mark-complete="" class="${OUTLINE}">Mark complete`,
    `</button>`,
    `<button type="button" data-open-labelling="" class="${PRIMARY}">Open labelling`,
    `</button>`,
    `<a href="/admin/labels">Back to Labels`,
    `</a>`,
    `</div>`,
    `</div>`,
  ].join("");

  test("the header is byte-identical to before for a labelling session", () => {
    const props = consoleProps({
      upload: UPLOAD,
      headerAction: React.createElement(
        "a",
        { href: "/admin/labels" },
        "Back to Labels",
      ),
    });
    expect(divAt(render(props), "data-console-header")).toBe(BEFORE);
    expect(
      divAt(render({ ...props, viewerKind: "admin" }), "data-console-header"),
    ).toBe(BEFORE);
  });

  test("a submitted session says so, with Reopen and Mark complete", () => {
    const html = render(
      consoleProps({
        session: { ...labelSessionFixture(), status: "submitted" },
      }),
    );
    const header = divAt(html, "data-console-header");
    expect(header).toContain("data-session-submitted");
    expect(text(header)).toContain("· Submitted for review");
    expect(header).toContain("data-reopen-session");
    expect(header).toContain("data-mark-complete");
    expect(header).not.toContain("data-submit-review");
  });
});

test.describe("the point the labeller page opens on", () => {
  const mark = (code: LabelMarkCode): LabelMark => {
    const meta = LABEL_MARK_META[code];
    return {
      code,
      tier: meta.tier,
      scope: meta.scope,
      params: {},
    } as LabelMark;
  };

  /**
   * One finished game, four points won by the server on its alternating
   * sides, only the first checked, and no score entered — so nothing between
   * the rows is amber, and the console's own default is point 2.
   */
  function session(): LabelSession {
    const ids = ["q-1", "q-2", "q-3", "q-4"];
    return {
      ...labelSessionFixture(),
      matchScore: null,
      finalScore: null,
      points: ids.map((id, index) =>
        labelPoint(id, index, {
          serveSide: index % 2 === 0 ? "deuce" : "ad",
          winner: "p1",
          ending: "ace",
          endedBy: "p1",
          checkedAt: index === 0 ? "2026-09-28T10:00:00Z" : null,
        }),
      ),
    };
  }
  const marks = (byPoint: Record<string, LabelMarkCode[]>): LabelMarks => ({
    points: Object.fromEntries(
      Object.entries(byPoint).map(([id, codes]) => [id, codes.map(mark)]),
    ),
    shots: {},
    suggestions: [],
    serveSides: {},
  });

  test("nothing open: no stop, so the console keeps its own default", () => {
    expect(firstAmberStop(session(), marks({}))).toBeNull();
    expect(firstAmberStop(session(), null)).toBeNull();
  });

  test("a grey flag is not a stop", () => {
    expect(
      firstAmberStop(
        session(),
        marks({ "q-2": ["winner_to_error_by_bounce"] }),
      ),
    ).toBeNull();
  });

  test("the only amber stop is point 3: the console opens on point 3", () => {
    const s = labellerSession(session());
    const m = marks({ "q-3": ["pick_winner"] });
    const first = firstAmberStop(s, m);
    expect(first).toBe("q-3");
    const html = render(
      consoleProps({
        viewerKind: "labeller",
        initialLayoutMode: "black",
        session: s,
        marks: m,
        initialExpandedPointId: first,
      }),
    );
    expect(html).toContain('data-shots-for="q-3"');
    expect(html).not.toContain('data-shots-for="q-2"');
    // Without it the console would open on the first point to check.
    const plain = render(
      consoleProps({
        viewerKind: "labeller",
        initialLayoutMode: "black",
        session: s,
        marks: m,
      }),
    );
    expect(plain).toContain('data-shots-for="q-2"');
  });
});
