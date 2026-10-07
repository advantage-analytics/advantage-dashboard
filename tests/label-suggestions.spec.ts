import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AdminClient } from "@/lib/supabase/admin";
import {
  LABEL_MARK_META,
  type LabelMark,
  type LabelMarks,
  type LabelSuggestion,
} from "@/lib/services/labels/marks";
import { planAddedShot } from "@/lib/services/labels/operations";
import type {
  LabelPoint,
  LabelSession,
  LabelShot,
} from "@/lib/services/labels/session";
import {
  applyDismiss,
  planDismiss,
  suggestionState,
} from "@/lib/services/labels/suggestions";
import {
  dismissLabelSuggestion,
  writeLabelSuggestionDismiss,
} from "@/lib/services/labels/suggestions-session";
import { inner, tag, text } from "./fixtures/html-probe";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
  editContext as sharedEditContext,
  noop,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * A suggested shot (T39, board 08m §4): two strokes in a row by one player,
 * so the black rail proposes the other's between them as a dashed row with
 * two answers. "Add shot" is the existing add operation; "Dismiss" is the one
 * new write, a key appended to `label_points.dismissed`. Nothing is added
 * until a click.
 *
 * The pure rules; the service over a fake client, for what its ONE update
 * sets and matches on and what it refuses; and the well, the point row and
 * the console rendered offline through `fixtures/vm-modules`.
 */

const WELL = "src/components/admin/labels/label-black-shot-row.tsx";
const ROW = "src/components/admin/labels/label-black-point-row.tsx";
const CONSOLE = "src/components/admin/labels/label-console.tsx";

const POINT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const { P4 } = FIXTURE_POINT_IDS;
const KEY = "missing_shot:502";

/**
 * The fixture's fourth point with the frame's rally in place of its own:
 * Lee's serve, Vargas's backhand, Vargas's forehand — the pair — and Lee's
 * backhand. The vendor never saw Lee's stroke between the pair.
 */
function pairPoint(): LabelPoint {
  const point = labelSessionFixture().points.find((p) => p.id === P4)!;
  const blank: LabelShot = {
    ...point.shots[0],
    status: "kept",
    siteRemoval: null,
    siteRemovalRestoredAt: null,
    contactX: null,
    contactY: null,
    landingX: null,
    landingY: null,
    seed: null,
  };
  const shot = (id: string, fields: Partial<LabelShot>): LabelShot => ({
    ...blank,
    id,
    result: "in",
    ...fields,
  });
  return {
    ...point,
    server: "p1",
    shots: [
      shot("s-a", {
        eventId: 501,
        hitter: "p1",
        stroke: "first_serve",
        spin: "flat",
        videoTime: 1679.4,
      }),
      shot("s-b", {
        eventId: 502,
        hitter: "p2",
        stroke: "backhand",
        spin: "backspin",
        videoTime: 1680.3,
      }),
      shot("s-c", {
        eventId: 503,
        hitter: "p2",
        stroke: "forehand",
        spin: "topspin",
        videoTime: 1682.7,
      }),
      shot("s-d", {
        eventId: 504,
        hitter: "p1",
        stroke: "backhand",
        spin: "flat",
        videoTime: 1684.0,
      }),
    ],
  };
}

const SUGGESTION: Extract<LabelSuggestion, { kind: "missing_shot" }> = {
  kind: "missing_shot",
  key: KEY,
  pointId: P4,
  afterShotId: "s-b",
  hitter: "p1",
  videoTime: 1681.5,
};

/**
 * The mark the derivation raises beside the suggestion. Its CHIP is hidden
 * (marks.ts `LABEL_MARK_META`): the console is never handed it, and a row
 * handed it anyway draws nothing for it — the dashed slot is the question.
 */
function pairMark(): LabelMark {
  const meta = LABEL_MARK_META.same_player_consecutive;
  return {
    code: "same_player_consecutive",
    tier: meta.tier,
    scope: meta.scope,
    params: { hitter: "p2" },
  } as LabelMark;
}

function marksOf(point: LabelPoint): LabelMarks {
  return {
    points: { [point.id]: [pairMark()] },
    shots: {},
    suggestions: [SUGGESTION],
    serveSides: {},
  };
}

/** The point after "Add shot": the row the existing operation plans. */
function withAdded(point: LabelPoint): LabelPoint {
  const plan = planAddedShot(point, SUGGESTION.afterShotId);
  if ("error" in plan) throw new Error(plan.error);
  const added: LabelShot = {
    ...point.shots[0],
    id: "s-new",
    eventId: null,
    afterEventId: plan.write.after_event_id,
    status: plan.write.status,
    hitter: plan.write.hitter,
    stroke: null,
    result: null,
    spin: null,
    videoTime: plan.write.video_time,
  };
  const [a, b, c, d] = point.shots;
  return { ...point, shots: [a, b, added, c, d] };
}

// ── The pure rules ─────────────────────────────────────────────────────────

test.describe("the existing add operation is what Add shot runs", () => {
  test("planAddedShot times the new row at the pair's midpoint and credits the opponent", () => {
    const plan = planAddedShot(pairPoint(), SUGGESTION.afterShotId);
    expect(plan).toEqual({
      ok: true,
      write: {
        event_id: null,
        after_event_id: 502,
        status: "added",
        // Vargas hit both of the pair: the missing stroke is Lee's.
        hitter: "p1",
        // (1680.3 + 1682.7) / 2 — what the marks proposed.
        video_time: SUGGESTION.videoTime,
      },
    });
    expect(SUGGESTION.hitter).toBe("p1");
  });
});

test.describe("suggestionState", () => {
  test("open, then done once a live added stroke follows the pair's first", () => {
    const point = pairPoint();
    expect(suggestionState(SUGGESTION, point)).toBe("open");

    const added = withAdded(point);
    expect(suggestionState(SUGGESTION, added)).toBe("done");

    // A stroke added somewhere else in the rally answers nothing.
    const elsewhere: LabelPoint = {
      ...added,
      shots: added.shots.map((s) =>
        s.id === "s-new" ? { ...s, afterEventId: 504 } : s,
      ),
    };
    expect(suggestionState(SUGGESTION, elsewhere)).toBe("open");

    // The labeller deletes what they added: the question is open again.
    const undone: LabelPoint = {
      ...added,
      shots: added.shots.map((s) =>
        s.id === "s-new"
          ? { ...s, status: "deleted", statusBeforeDelete: "added" }
          : s,
      ),
    };
    expect(suggestionState(SUGGESTION, undone)).toBe("open");
  });

  test("dismissed by its own key only, and done outranks dismissed", () => {
    const point = pairPoint();
    expect(suggestionState(SUGGESTION, { ...point, dismissed: [KEY] })).toBe(
      "dismissed",
    );
    expect(
      suggestionState(SUGGESTION, {
        ...point,
        dismissed: ["missing_shot:999", "missing_point"],
      }),
    ).toBe("open");
    expect(
      suggestionState(SUGGESTION, { ...withAdded(point), dismissed: [KEY] }),
    ).toBe("done");
    // A missing point is dismissed by its key and has no `done` here.
    const missingPoint = {
      kind: "missing_point",
      key: "missing_point",
    } as const;
    expect(suggestionState(missingPoint, withAdded(point))).toBe("open");
    expect(
      suggestionState(missingPoint, { ...point, dismissed: ["missing_point"] }),
    ).toBe("dismissed");
  });
});

test.describe("planDismiss", () => {
  test("appends the key to the array read", () => {
    expect(planDismiss({ dismissed: [] }, KEY)).toEqual({
      ok: true,
      write: { dismissed: [KEY] },
    });
    expect(planDismiss({ dismissed: [KEY] }, "missing_point")).toEqual({
      ok: true,
      write: { dismissed: [KEY, "missing_point"] },
    });
  });

  test("refuses a key of any other shape, and one already there", () => {
    for (const key of [
      "",
      "missing_shot:",
      "missing_shot:abc",
      "missing_shot:502 ",
      "missing_shot:-1",
      "missing_points",
      "phantom_strokes_dropped",
      502,
      null,
      undefined,
    ]) {
      expect(planDismiss({ dismissed: [] }, key), String(key)).toEqual({
        error: "That is not a suggestion this point can dismiss.",
      });
    }
    expect(planDismiss({ dismissed: [KEY] }, KEY)).toEqual({
      error: "This suggestion is already dismissed.",
    });
  });

  test("applyDismiss is the plan on the console's row, and a no-op when it refuses", () => {
    const point = pairPoint();
    const after = applyDismiss(point, KEY);
    expect(after).toEqual({ ...point, dismissed: [KEY] });
    expect(point.dismissed).toEqual([]);
    expect(applyDismiss(after, KEY)).toBe(after);
    expect(applyDismiss(point, "nonsense")).toBe(point);
  });
});

// ── The service ────────────────────────────────────────────────────────────

interface Call {
  table: string;
  op: "select" | "update";
  values?: Record<string, unknown>;
  filters: Record<string, unknown>;
}

function fakeClient(rows: {
  point?: Record<string, unknown> | null;
  session?: Record<string, unknown> | null;
  /** The compare-and-set matched nothing — another tab got there first. */
  raced?: boolean;
}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: {} };
      calls.push(call);
      const answer = () => {
        if (call.op === "update") {
          return {
            data: rows.raced ? [] : [{ id: call.filters.id }],
            error: null,
          };
        }
        if (table === "label_sessions") {
          return {
            data:
              rows.session === undefined
                ? { status: "labelling", marks_enabled: true }
                : rows.session,
            error: null,
          };
        }
        if (table === "label_points") {
          return { data: rows.point ?? null, error: null };
        }
        return { data: null, error: { message: `unexpected ${table}` } };
      };
      const builder = {
        select: () => builder,
        update: (values: Record<string, unknown>) => {
          call.op = "update";
          call.values = values;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          call.filters[column] = value;
          return builder;
        },
        maybeSingle: async () => answer(),
        then: (
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) => Promise.resolve(answer()).then(resolve, reject),
      };
      return builder;
    },
  };
  return { calls, supabase: client as unknown as AdminClient };
}

const POINT_ROW = {
  id: POINT_ID,
  session_id: SESSION_ID,
  status: "unchanged",
  dismissed: ["missing_point"],
};

const updates = (fake: ReturnType<typeof fakeClient>) =>
  fake.calls.filter((c) => c.op === "update");

test.describe("writeLabelSuggestionDismiss", () => {
  test("ONE update on label_points: the array read plus the key, matched on the id and the status read", async () => {
    const fake = fakeClient({ point: POINT_ROW });
    const result = await writeLabelSuggestionDismiss({
      supabase: fake.supabase,
      pointId: POINT_ID,
      key: KEY,
    });
    expect(result).toEqual({ ok: true, dismissed: ["missing_point", KEY] });
    expect(updates(fake)).toEqual([
      {
        table: "label_points",
        op: "update",
        values: { dismissed: ["missing_point", KEY] },
        filters: { id: POINT_ID, status: "unchanged" },
      },
    ]);
    // It read the session's gate — status AND marks_enabled — first.
    expect(fake.calls.find((c) => c.table === "label_sessions")).toMatchObject({
      op: "select",
      filters: { id: SESSION_ID },
    });
    for (const call of fake.calls) {
      expect(call.table).toMatch(/^label_(points|sessions)$/);
    }
  });

  test("a row older than the column reads as nothing dismissed", async () => {
    const fake = fakeClient({ point: { ...POINT_ROW, dismissed: null } });
    expect(
      await writeLabelSuggestionDismiss({
        supabase: fake.supabase,
        pointId: POINT_ID,
        key: KEY,
      }),
    ).toEqual({ ok: true, dismissed: [KEY] });
  });

  test("a session labelled without marks, and a complete one, are refused before anything is written", async () => {
    const blind = fakeClient({
      point: POINT_ROW,
      session: { status: "labelling", marks_enabled: false },
    });
    expect(
      await writeLabelSuggestionDismiss({
        supabase: blind.supabase,
        pointId: POINT_ID,
        key: KEY,
      }),
    ).toEqual({
      error:
        "This session is labelled without the site's marks, so there is nothing to dismiss.",
    });
    expect(updates(blind)).toEqual([]);

    const frozen = fakeClient({
      point: POINT_ROW,
      session: { status: "complete", marks_enabled: true },
    });
    expect(
      await writeLabelSuggestionDismiss({
        supabase: frozen.supabase,
        pointId: POINT_ID,
        key: KEY,
      }),
    ).toEqual({
      error: "This session is complete, so its labels can no longer change.",
    });
    expect(updates(frozen)).toEqual([]);
  });

  test("a missing row, a bad id, a race and the plan's refusals", async () => {
    expect(
      await writeLabelSuggestionDismiss({
        supabase: fakeClient({ point: null }).supabase,
        pointId: POINT_ID,
        key: KEY,
      }),
    ).toEqual({ error: "Point not found." });

    expect(
      await writeLabelSuggestionDismiss({
        supabase: fakeClient({}).supabase,
        pointId: "not-a-uuid",
        key: KEY,
      }),
    ).toEqual({ error: "Invalid point id." });

    const raced = fakeClient({ point: POINT_ROW, raced: true });
    expect(
      await writeLabelSuggestionDismiss({
        supabase: raced.supabase,
        pointId: POINT_ID,
        key: KEY,
      }),
    ).toEqual({ error: "This row changed in another tab. Reload to see it." });

    for (const [key, error] of [
      ["site_removal", "That is not a suggestion this point can dismiss."],
      ["missing_point", "This suggestion is already dismissed."],
    ] as const) {
      const fake = fakeClient({ point: POINT_ROW });
      expect(
        await writeLabelSuggestionDismiss({
          supabase: fake.supabase,
          pointId: POINT_ID,
          key,
        }),
      ).toEqual({ error });
      expect(updates(fake)).toEqual([]);
    }
  });

  test("the entry point refuses without an admin, before a client is built", async () => {
    let built = 0;
    const result = await dismissLabelSuggestion(POINT_ID, KEY, {
      requireAdmin: async () => null,
      createAdminClient: () => {
        built += 1;
        return fakeClient({}).supabase;
      },
    });
    expect(result).toEqual({ error: "Administrator access is required." });
    expect(built).toBe(0);

    const fake = fakeClient({ point: POINT_ROW });
    expect(
      await dismissLabelSuggestion(POINT_ID.toUpperCase(), KEY, {
        requireAdmin: async () => ({ id: "admin" }),
        createAdminClient: () => fake.supabase,
      }),
    ).toMatchObject({ ok: true });
    expect(updates(fake)[0].filters).toMatchObject({ id: POINT_ID });
  });
});

// ── The black rail ─────────────────────────────────────────────────────────

type WellProps = {
  point: LabelPoint;
  edit: Record<string, unknown>;
  marks?: LabelMarks | null;
};
type RowProps = WellProps & {
  open: boolean;
  playing: boolean;
  score: string | null;
};

/** Row operations that record every request made of them. */
function recordingOperations() {
  const calls: Array<[string, ...unknown[]]> = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
    };
  const operations = Object.fromEntries(
    [
      "onAskDeleteShot",
      "onAskDeletePoint",
      "onRestoreShot",
      "onRestorePoint",
      "onRestoreSiteRemoval",
      "onDismissSuggestion",
      "onMovePoint",
      "onSetChecked",
      "onAddShot",
      "onAskResetShot",
      "onAskResetPoint",
    ].map((name) => [name, record(name)]),
  );
  return { calls, operations };
}

const editContext = (overrides: Record<string, unknown> = {}) =>
  sharedEditContext({
    operations: recordingOperations().operations,
    openGhostIds: new Set<string>(),
    onToggleGhost: noop,
    ...overrides,
  });

function renderWell(
  point: LabelPoint,
  marks: LabelMarks | null,
  edit: Record<string, unknown> = editContext(),
): string {
  const { BlackShotsWell } = createLoader().load(WELL) as {
    BlackShotsWell: React.ComponentType<WellProps>;
  };
  return renderToStaticMarkup(
    React.createElement(BlackShotsWell, { point, edit, marks }),
  );
}

function renderRow(
  point: LabelPoint,
  marks: LabelMarks | null,
  edit: Record<string, unknown> = editContext(),
): string {
  const { BlackPointRow } = createLoader().load(ROW) as {
    BlackPointRow: React.ComponentType<RowProps>;
  };
  return renderToStaticMarkup(
    React.createElement(BlackPointRow, {
      point,
      open: false,
      playing: false,
      score: "0–0",
      edit,
      marks,
    }),
  );
}

/** The number drawn in a stroke row's first track. */
function numberOf(html: string, shotId: string): string {
  const at = html.indexOf(`data-shot-id="${shotId}"`);
  expect(at, shotId).toBeGreaterThan(-1);
  const row = html.slice(at);
  const span = row.indexOf("<span");
  const start = row.indexOf(">", span) + 1;
  return row.slice(start, row.indexOf("<", start));
}

/** The dashed row: from its marker to the next row of any kind. */
function suggestionRow(html: string): string {
  const at = html.indexOf("data-shot-suggestion=");
  expect(at).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<div", at);
  const next = html.indexOf("data-row=", html.indexOf(">", at));
  return html.slice(start, html.lastIndexOf("<", next));
}

test.describe("a suggested shot in the black well", () => {
  test("a dashed amber row after the pair's first stroke: plus, midpoint, name, the sentence, two answers", () => {
    const point = pairPoint();
    const html = renderWell(point, marksOf(point));
    const row = suggestionRow(html);

    const open = tag(row, "data-shot-suggestion");
    expect(open).toContain(`data-shot-suggestion="${KEY}"`);
    for (const cls of [
      "outline-dashed",
      "outline-1",
      "outline-[color:var(--rail-amber-line)]",
      "-outline-offset-4",
      "rounded-lg",
      "bg-[var(--rail-amber-wash-faint)]",
    ]) {
      expect(open, cls).toContain(cls);
    }

    // A plus where the number would be; the time and the name in amber.
    expect(row).toContain("lucide-plus");
    expect(row).toContain(">28:01.5<");
    expect(row).toContain(">Lee<");
    expect(
      row.match(
        /color:color-mix\(in oklab, var\(--rail-amber\) 75%, transparent\)/g,
      ),
    ).toHaveLength(3);
    expect(inner(row, "data-suggestion-text")).toBe(
      "A shot by Lee is probably missing here",
    );
    expect(tag(row, "data-suggestion-text")).toContain("text-[11px]");
    expect(tag(row, "data-suggestion-text")).toMatch(
      /color:color-mix\(in oklab, var\(--color-white\) 72%, transparent\)/,
    );
    expect(tag(row, "data-suggestion-text")).toContain("truncate");

    expect(inner(row, "data-suggestion-add")).toBe("Add shot");
    expect(tag(row, "data-suggestion-add")).toContain(
      "text-[var(--rail-amber)]",
    );
    expect(inner(row, "data-suggestion-dismiss")).toBe("Dismiss");
    expect(tag(row, "data-suggestion-dismiss")).toContain("text-white/50");
    // The answers never shrink or wrap: the sentence gives first.
    for (const attr of ["data-suggestion-add", "data-suggestion-dismiss"]) {
      expect(tag(row, attr)).toContain("shrink-0");
      expect(tag(row, attr)).toContain("whitespace-nowrap");
    }

    // Where it would go: after Vargas's backhand, before Vargas's forehand.
    const at = html.indexOf("data-shot-suggestion=");
    expect(html.indexOf('data-shot-id="s-b"')).toBeLessThan(at);
    expect(at).toBeLessThan(html.indexOf('data-shot-id="s-c"'));
    // It is not a stroke: no id, no number, and the next stroke is still 3.
    expect(row).not.toContain("data-shot-id");
    expect(numberOf(html, "s-b")).toBe("2");
    expect(numberOf(html, "s-c")).toBe("3");
    expect(numberOf(html, "s-d")).toBe("4");
    expect(html.match(/data-row="shot"/g)).toHaveLength(4);
  });

  test("it is not counted: the point row reads the same rally with it and without", () => {
    const point = pairPoint();
    const withIt = renderRow(point, marksOf(point));
    const without = renderRow(point, null);
    expect(inner(withIt, "data-point-detail")).toBe(
      inner(without, "data-point-detail"),
    );
    expect(inner(withIt, "data-point-detail")).toContain("4 shot rally");
    // No chip on the row for it: the slot in the well is the whole question.
    expect(withIt).not.toContain("data-mark-chip");
    expect(text(withIt)).not.toContain("Missing shot?");
    expect(renderWell(point, marksOf(point))).toContain(
      "data-shot-suggestion=",
    );
  });

  test("nothing is added until a click; the two buttons are the console's requests", () => {
    const point = pairPoint();
    const { calls, operations } = recordingOperations();
    const edit = editContext({ operations });
    const html = renderWell(point, marksOf(point), edit);
    expect(html).toContain("data-shot-suggestion=");
    // A render asked for nothing.
    expect(calls).toEqual([]);

    const { BlackShotsWell } = createLoader().load(WELL) as {
      BlackShotsWell: (props: WellProps) => React.ReactElement;
    };
    const tree = BlackShotsWell({ point, edit, marks: marksOf(point) });
    const click = (attr: string) => {
      const button = find(tree, attr);
      expect(button, attr).not.toBeNull();
      let stopped = 0;
      (button!.props.onClick as (e: unknown) => void)({
        stopPropagation: () => (stopped += 1),
      });
      expect(stopped).toBe(1);
    };
    expect(calls).toEqual([]);
    click("data-suggestion-add");
    // The EXISTING add request, after the pair's first stroke.
    expect(calls).toEqual([["onAddShot", P4, "s-b"]]);
    click("data-suggestion-dismiss");
    expect(calls).toEqual([
      ["onAddShot", P4, "s-b"],
      ["onDismissSuggestion", P4, KEY],
    ]);
  });

  test("after Add shot: the row is gone, the new stroke is an ordinary added row in its place, and the point row has its pencil", () => {
    const point = withAdded(pairPoint());
    const marks = marksOf(point);
    const well = renderWell(point, marks);
    expect(well).not.toContain("data-shot-suggestion");
    expect(well.match(/data-row="shot"/g)).toHaveLength(5);
    expect(numberOf(well, "s-b")).toBe("2");
    expect(numberOf(well, "s-new")).toBe("3");
    expect(numberOf(well, "s-c")).toBe("4");
    expect(well.indexOf('data-shot-id="s-b"')).toBeLessThan(
      well.indexOf('data-shot-id="s-new"'),
    );
    expect(well.indexOf('data-shot-id="s-new"')).toBeLessThan(
      well.indexOf('data-shot-id="s-c"'),
    );

    const row = renderRow(point, marks);
    expect(row).not.toContain("data-mark-chip");
    expect(row).toContain("data-pencil");
  });

  test("after Dismiss: the row is gone, and the point row is untouched", () => {
    const point: LabelPoint = { ...pairPoint(), dismissed: [KEY] };
    const marks = marksOf(point);
    const well = renderWell(point, marks);
    expect(well).not.toContain("data-shot-suggestion");
    expect(well.match(/data-row="shot"/g)).toHaveLength(4);

    const row = renderRow(point, marks);
    expect(row).not.toContain("data-mark-chip");
    // A dismissal is not a change to the point.
    expect(row).not.toContain("data-pencil");
  });

  test("with marks off, or none built, no suggestion renders", () => {
    const point = pairPoint();
    const marks = marksOf(point);
    expect(renderWell(point, null)).not.toContain("data-shot-suggestion");
    // Another point's suggestion is not this one's.
    expect(
      renderWell(point, {
        ...marks,
        suggestions: [{ ...SUGGESTION, pointId: "p-0001" }],
      }),
    ).not.toContain("data-shot-suggestion");
  });

  test("read-only: the row, no answers; and no row once the stroke it follows is deleted", () => {
    const point = pairPoint();
    for (const edit of [
      editContext({ editable: false, operations: undefined }),
      editContext({ operations: undefined }),
      editContext({ editable: false }),
    ]) {
      const html = renderWell(point, marksOf(point), edit);
      expect(html).toContain(`data-shot-suggestion="${KEY}"`);
      expect(html).not.toContain("data-suggestion-add");
      expect(html).not.toContain("data-suggestion-dismiss");
    }

    const deleted: LabelPoint = {
      ...point,
      shots: point.shots.map((s) =>
        s.id === "s-b"
          ? { ...s, status: "deleted", statusBeforeDelete: "kept" }
          : s,
      ),
    };
    expect(renderWell(deleted, marksOf(deleted))).not.toContain(
      "data-shot-suggestion",
    );
  });
});

// ── The console ────────────────────────────────────────────────────────────

test.describe("the console", () => {
  type ConsoleProps = {
    session: LabelSession;
    video: null;
    marks?: LabelMarks | null;
    initialLayoutMode?: "black";
    initialExpandedPointId?: string | null;
    operations?: Record<string, unknown>;
    onSaveShot?: () => Promise<unknown>;
    onSavePoint?: () => Promise<unknown>;
  };

  function renderConsole(props: ConsoleProps): string {
    const { LabelConsole } = createLoader().load(CONSOLE) as {
      LabelConsole: React.ComponentType<ConsoleProps>;
    };
    return renderToStaticMarkup(React.createElement(LabelConsole, props));
  }

  function sessionWithPair(): LabelSession {
    const session = labelSessionFixture();
    return {
      ...session,
      points: session.points.map((p) => (p.id === P4 ? pairPoint() : p)),
    };
  }

  /** Every console operation, counting the calls a render makes of it. */
  function countingOperations() {
    const called: string[] = [];
    const operations = Object.fromEntries(
      [
        "deleteShot",
        "restoreShot",
        "deletePoint",
        "restorePoint",
        "addShot",
        "movePoint",
        "setChecked",
        "resetShot",
        "resetPoint",
        "setGameServer",
        "setGameType",
        "restoreSiteRemoval",
        "dismissSuggestion",
      ].map((name) => [
        name,
        async () => {
          called.push(name);
          return { error: "not in a render" };
        },
      ]),
    );
    return { called, operations };
  }

  test("the black view draws the suggestion with its answers, and a render writes nothing", () => {
    const { called, operations } = countingOperations();
    const saves: string[] = [];
    const html = renderConsole({
      session: sessionWithPair(),
      video: null,
      marks: marksOf(pairPoint()),
      initialLayoutMode: "black",
      initialExpandedPointId: P4,
      operations,
      onSaveShot: async () => {
        saves.push("shot");
        return { ok: true, status: "edited" };
      },
      onSavePoint: async () => {
        saves.push("point");
        return { ok: true, status: "edited" };
      },
    });
    expect(html).toContain(`data-shot-suggestion="${KEY}"`);
    expect(html).toContain("A shot by Lee is probably missing here");
    expect(html).toContain("data-suggestion-add");
    expect(html).toContain("data-suggestion-dismiss");
    expect(called).toEqual([]);
    expect(saves).toEqual([]);
  });

  test("not on a session with marks off; the default layout draws them with marks on", () => {
    const { operations } = countingOperations();
    const saves = {
      onSaveShot: async () => ({ ok: true, status: "edited" }),
      onSavePoint: async () => ({ ok: true, status: "edited" }),
    };
    const off = renderConsole({
      session: { ...sessionWithPair(), marksEnabled: false },
      video: null,
      marks: null,
      initialLayoutMode: "black",
      initialExpandedPointId: P4,
      operations,
      ...saves,
    });
    expect(off).not.toContain("data-shot-suggestion");
    expect(off).toContain('data-shot-id="s-b"');

    // The default layout (docked side) is the same rail: with marks on it
    // draws the suggestion too.
    const docked = renderConsole({
      session: sessionWithPair(),
      video: null,
      marks: marksOf(pairPoint()),
      initialExpandedPointId: P4,
      operations,
      ...saves,
    });
    expect(docked).toContain('data-label-layout-mode="docked-side"');
    expect(docked).toContain(`data-shot-suggestion="${KEY}"`);
    expect(docked).toContain('data-shot-id="s-b"');
  });
});

/**
 * The first element in a React tree whose props carry `attr`. Only the
 * suggestion's own component is entered: the stroke rows around it hold
 * editors that use hooks and cannot be called outside a render.
 */
function find(
  node: React.ReactNode,
  attr: string,
): React.ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, attr);
      if (found) return found;
    }
    return null;
  }
  if (!React.isValidElement(node)) return null;
  const element = node as React.ReactElement<Record<string, unknown>>;
  if (attr in element.props) return element;
  if (typeof element.type === "function") {
    if (element.type.name !== "BlackSuggestedShot") return null;
    return find(
      (element.type as (p: unknown) => React.ReactNode)(element.props),
      attr,
    );
  }
  for (const child of React.Children.toArray(
    element.props.children as React.ReactNode,
  )) {
    const found = find(child, attr);
    if (found) return found;
  }
  return null;
}
