import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AdminClient } from "@/lib/supabase/admin";
import {
  LABEL_MARK_META,
  type LabelMark,
  type LabelMarks,
} from "@/lib/services/labels/marks";
import { labelScores } from "@/lib/services/labels/score";
import type {
  LabelPoint,
  LabelSession,
  LabelShot,
} from "@/lib/services/labels/session";
import {
  applySiteRemovalRestore,
  planSiteRemovalRestore,
} from "@/lib/services/labels/site-removal";
import {
  restoreLabelSiteRemoval,
  writeLabelSiteRemovalRestore,
} from "@/lib/services/labels/site-removal-session";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * A ghost (T38, board 08m §3): a stroke the SITE removed before the
 * transcript was built, drawn by the black rail as one quiet line, shown
 * struck through on request, and put back with Restore — the one new write,
 * `label_shots.site_removal_restored_at`.
 *
 * The pure plan and the console's row rule; the service over a fake client,
 * for what its ONE update matches on and what it refuses; and the well and
 * point row rendered offline through `fixtures/vm-modules`, with the
 * session's marks on, off and absent.
 */

const WELL = "src/components/admin/labels/label-black-shot-row.tsx";
const ROW = "src/components/admin/labels/label-black-point-row.tsx";
const CONSOLE = "src/components/admin/labels/label-console.tsx";

const SHOT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const AT = "2026-10-05T12:00:00.000Z";
const GHOST = "s-p4-ghost";
const { P4 } = FIXTURE_POINT_IDS;

/** The fixture session's two players, as the console's `sideNames` has them. */
const NAMES = { p1: "Lee", p2: "Vargas" };

function point4(): LabelPoint {
  return labelSessionFixture().points.find((p) => p.id === P4)!;
}

function ghostOf(point: LabelPoint): LabelShot {
  return point.shots.find((s) => s.id === GHOST)!;
}

// ── The pure rules ─────────────────────────────────────────────────────────

test.describe("planSiteRemovalRestore", () => {
  const ghost = { status: "kept", siteRemoval: "hit_after_fault" } as const;

  test("a ghost plans the one column", () => {
    expect(
      planSiteRemovalRestore({ ...ghost, siteRemovalRestoredAt: null }, AT),
    ).toEqual({ ok: true, write: { site_removal_restored_at: AT } });
  });

  test("refuses a stroke the site never removed, one already restored, and a tombstone", () => {
    expect(
      planSiteRemovalRestore(
        { status: "kept", siteRemoval: null, siteRemovalRestoredAt: null },
        AT,
      ),
    ).toEqual({ error: "The site did not remove this shot." });
    expect(
      planSiteRemovalRestore({ ...ghost, siteRemovalRestoredAt: AT }, AT),
    ).toEqual({ error: "This shot is already restored." });
    expect(
      planSiteRemovalRestore(
        { ...ghost, status: "deleted", siteRemovalRestoredAt: null },
        AT,
      ),
    ).toEqual({ error: "Undo this shot's delete first." });
  });

  test("applySiteRemovalRestore sets the moment on a ghost and leaves any other row alone", () => {
    const ghost = ghostOf(point4());
    const restored = applySiteRemovalRestore(ghost, AT);
    expect(restored).toEqual({ ...ghost, siteRemovalRestoredAt: AT });
    expect(restored.status).toBe("kept");
    // Not a ghost any more: the same object comes back.
    expect(applySiteRemovalRestore(restored, "later")).toBe(restored);
    const plain = point4().shots.find((s) => s.id === "s-p4-serve")!;
    expect(applySiteRemovalRestore(plain, AT)).toBe(plain);
  });
});

// ── The service, over a fake client ─────────────────────────────────────────

interface Call {
  table: string;
  op: "select" | "update";
  values?: Record<string, unknown>;
  filters: Record<string, unknown>;
  /** `.not(column, "is", null)` — the column must be set. */
  notNull: string[];
  /** `.is(column, null)` — the column must be unset. */
  isNull: string[];
}

function fakeClient(rows: {
  shot?: Record<string, unknown> | null;
  session?: Record<string, unknown> | null;
  /** The compare-and-set matched nothing — another tab got there first. */
  raced?: boolean;
}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = {
        table,
        op: "select",
        filters: {},
        notNull: [],
        isNull: [],
      };
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
        if (table === "label_shots") {
          return { data: rows.shot ?? null, error: null };
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
        not: (column: string, operator: string, value: unknown) => {
          expect(operator).toBe("is");
          expect(value).toBeNull();
          call.notNull.push(column);
          return builder;
        },
        is: (column: string, value: unknown) => {
          expect(value).toBeNull();
          call.isNull.push(column);
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

const GHOST_ROW = {
  id: SHOT_ID,
  session_id: SESSION_ID,
  status: "kept",
  site_removal: "hit_after_fault",
  site_removal_restored_at: null,
};

const updates = (fake: ReturnType<typeof fakeClient>) =>
  fake.calls.filter((c) => c.op === "update");

test.describe("writeLabelSiteRemovalRestore", () => {
  test("ONE update on label_shots: the moment, matched on the id and the two columns read", async () => {
    const fake = fakeClient({ shot: GHOST_ROW });
    const result = await writeLabelSiteRemovalRestore({
      supabase: fake.supabase,
      shotId: SHOT_ID,
      at: AT,
    });
    expect(result).toEqual({ ok: true, siteRemovalRestoredAt: AT });
    expect(updates(fake)).toEqual([
      {
        table: "label_shots",
        op: "update",
        values: { site_removal_restored_at: AT },
        filters: { id: SHOT_ID },
        notNull: ["site_removal"],
        isNull: ["site_removal_restored_at"],
      },
    ]);
    // It read the session's gate — status AND marks_enabled — first.
    const session = fake.calls.find((c) => c.table === "label_sessions");
    expect(session).toMatchObject({
      op: "select",
      filters: { id: SESSION_ID },
    });
    for (const call of fake.calls) {
      expect(call.table).toMatch(/^label_(shots|sessions)$/);
    }
  });

  test("now is written when no moment is given", async () => {
    const fake = fakeClient({ shot: GHOST_ROW });
    const result = await writeLabelSiteRemovalRestore({
      supabase: fake.supabase,
      shotId: SHOT_ID,
    });
    expect(result).toMatchObject({ ok: true });
    const at = (result as { siteRemovalRestoredAt: string })
      .siteRemovalRestoredAt;
    expect(Number.isNaN(Date.parse(at))).toBe(false);
    expect(updates(fake)[0].values).toEqual({ site_removal_restored_at: at });
  });

  test("a session labelled without marks is refused before anything is written", async () => {
    const fake = fakeClient({
      shot: GHOST_ROW,
      session: { status: "labelling", marks_enabled: false },
    });
    expect(
      await writeLabelSiteRemovalRestore({
        supabase: fake.supabase,
        shotId: SHOT_ID,
      }),
    ).toEqual({
      error:
        "This session is labelled without the site's marks, so there is nothing to restore.",
    });
    expect(updates(fake)).toEqual([]);
  });

  test("a complete session, a missing row and a race are refused", async () => {
    const frozen = fakeClient({
      shot: GHOST_ROW,
      session: { status: "complete", marks_enabled: true },
    });
    expect(
      await writeLabelSiteRemovalRestore({
        supabase: frozen.supabase,
        shotId: SHOT_ID,
      }),
    ).toEqual({
      error: "This session is complete, so its labels can no longer change.",
    });
    expect(updates(frozen)).toEqual([]);

    const missing = fakeClient({ shot: null });
    expect(
      await writeLabelSiteRemovalRestore({
        supabase: missing.supabase,
        shotId: SHOT_ID,
      }),
    ).toEqual({ error: "Shot not found." });

    const raced = fakeClient({ shot: GHOST_ROW, raced: true });
    expect(
      await writeLabelSiteRemovalRestore({
        supabase: raced.supabase,
        shotId: SHOT_ID,
      }),
    ).toEqual({ error: "This row changed in another tab. Reload to see it." });

    expect(
      await writeLabelSiteRemovalRestore({
        supabase: fakeClient({}).supabase,
        shotId: "not-a-uuid",
      }),
    ).toEqual({ error: "Invalid shot id." });
  });

  test("the plan's refusals reach the caller with nothing written", async () => {
    for (const [row, error] of [
      [
        { ...GHOST_ROW, site_removal: null },
        "The site did not remove this shot.",
      ],
      [
        { ...GHOST_ROW, site_removal_restored_at: AT },
        "This shot is already restored.",
      ],
      [{ ...GHOST_ROW, status: "deleted" }, "Undo this shot's delete first."],
    ] as const) {
      const fake = fakeClient({ shot: row });
      expect(
        await writeLabelSiteRemovalRestore({
          supabase: fake.supabase,
          shotId: SHOT_ID,
        }),
      ).toEqual({ error });
      expect(updates(fake)).toEqual([]);
    }
  });

  test("the entry point refuses without an admin, before a client is built", async () => {
    let built = 0;
    const result = await restoreLabelSiteRemoval(SHOT_ID, {
      requireAdmin: async () => null,
      createAdminClient: () => {
        built += 1;
        return fakeClient({}).supabase;
      },
    });
    expect(result).toEqual({ error: "Administrator access is required." });
    expect(built).toBe(0);

    const fake = fakeClient({ shot: GHOST_ROW });
    expect(
      await restoreLabelSiteRemoval(SHOT_ID.toUpperCase(), {
        requireAdmin: async () => ({ id: "admin" }),
        createAdminClient: () => fake.supabase,
      }),
    ).toMatchObject({ ok: true });
    expect(updates(fake)[0].filters).toEqual({ id: SHOT_ID });
  });
});

// ── The black rail ─────────────────────────────────────────────────────────

type WellProps = {
  point: LabelPoint;
  edit: Record<string, unknown>;
  marks?: LabelMarks | null;
};
type RowProps = {
  point: LabelPoint;
  open: boolean;
  playing: boolean;
  score: string | null;
  edit: Record<string, unknown>;
  marks?: LabelMarks | null;
};

const noop = () => {};
const OPERATIONS = {
  onAskDeleteShot: noop,
  onAskDeletePoint: noop,
  onRestoreShot: noop,
  onRestorePoint: noop,
  onRestoreSiteRemoval: noop,
  onMovePoint: noop,
  onSetChecked: noop,
  onAddShot: noop,
  onAskResetShot: noop,
  onAskResetPoint: noop,
};

function editContext(overrides: Record<string, unknown> = {}) {
  const session = labelSessionFixture();
  return {
    editable: true,
    names: NAMES,
    selectedShotId: null,
    onPatchPoint: noop,
    onPatchShot: noop,
    operations: OPERATIONS,
    openTombstoneIds: new Set<string>(),
    marksEnabled: true,
    openGhostIds: new Set<string>(),
    onToggleGhost: noop,
    points: session.points,
    scores: labelScores(session.points, session.adScoring).points,
    playingShotId: null,
    ...overrides,
  };
}

/** The point's one fix: the site removed its ghost (vendor stroke 402). */
function phantomMark(eventIds: number[] = [402]): LabelMark {
  const meta = LABEL_MARK_META.phantom_strokes_dropped;
  return {
    code: "phantom_strokes_dropped",
    kind: meta.kind,
    scope: meta.scope,
    params: { eventIds, hitter: "p1" },
  } as LabelMark;
}

function marksOf(point: LabelPoint, pointMarks: LabelMark[]): LabelMarks {
  return { points: { [point.id]: pointMarks }, shots: {}, suggestions: [] };
}

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

/** The opening tag carrying `attr`. */
function tag(html: string, attr: string): string {
  const at = html.indexOf(attr);
  expect(at, attr).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
}

/** The inner text of the element carrying `attr`. */
function inner(html: string, attr: string): string {
  const at = html.indexOf(attr);
  expect(at, attr).toBeGreaterThan(-1);
  const start = html.indexOf(">", at) + 1;
  return html.slice(start, html.indexOf("<", start));
}

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
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

/** Everything from one marker to the next row of any kind. */
function block(html: string, marker: string): string {
  const at = html.indexOf(marker);
  expect(at, marker).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<div", at);
  const next = html.indexOf("data-row=", html.indexOf(">", at));
  return html.slice(
    start,
    next === -1 ? undefined : html.lastIndexOf("<", next),
  );
}

test.describe("a ghost in the black well", () => {
  test("at rest: one quiet line where the stroke was, no number, no row", () => {
    const point = point4();
    const html = renderWell(point, marksOf(point, [phantomMark()]));

    const line = block(html, `data-shot-ghost="${GHOST}"`);
    const open = tag(line, "data-shot-ghost");
    expect(open).toContain('data-row="ghost-shot"');
    expect(open).toContain("h-[26px]");
    expect(open).toContain("text-[11px]");
    expect(open).toContain("rgba(255,255,255,0.45)");
    expect(open).toContain("pl-[44px]");
    expect(text(line)).toBe("1 shot removed: Lee hit the fault back Show");
    expect(tag(line, "data-ghost-toggle")).toContain('aria-expanded="false"');
    // The fix's own icon, and nothing of a stroke row.
    expect(line).toContain("lucide-wand-sparkles");
    expect(line).not.toContain('data-row="shot"');
    expect(html).not.toContain("data-shot-ghost-row");
    expect(html).not.toContain("Hit after the fault");

    // It sits between the two serves, and takes no number: the second serve
    // is shot 2, not 3.
    expect(html.indexOf('data-shot-id="s-p4-fault"')).toBeLessThan(
      html.indexOf(`data-shot-ghost="${GHOST}"`),
    );
    expect(html.indexOf(`data-shot-ghost="${GHOST}"`)).toBeLessThan(
      html.indexOf('data-shot-id="s-p4-serve"'),
    );
    expect(numberOf(html, "s-p4-fault")).toBe("1");
    expect(numberOf(html, "s-p4-serve")).toBe("2");
    expect(html.match(/data-row="shot"/g)).toHaveLength(2);
    expect(html).not.toContain(`data-shot-id="${GHOST}"`);
  });

  test("shown: the struck-through row under the line, its reason and Restore", () => {
    const point = point4();
    const html = renderWell(
      point,
      marksOf(point, [phantomMark()]),
      editContext({ openGhostIds: new Set([GHOST]) }),
    );
    const line = block(html, `data-shot-ghost="${GHOST}"`);
    expect(text(line)).toBe("1 shot removed: Lee hit the fault back Hide");
    expect(tag(line, "data-ghost-toggle")).toContain('aria-expanded="true"');

    const row = block(html, `data-shot-ghost-row="${GHOST}"`);
    const open = tag(row, "data-shot-ghost-row");
    expect(open).toContain('data-row="ghost-shot-row"');
    expect(open).toContain("h-[34px]");
    expect(open).toContain("bg-white/[0.03]");
    // The number's dash, then the struck values.
    expect(text(row)).toMatch(/^– /);
    expect(text(row)).toContain("Lee Forehand Topspin");
    expect(text(row)).toContain("1.92 24.60");
    expect(text(row)).toContain("Hit after the fault Restore");
    for (const value of ["Lee", "Forehand", "Topspin", "1.92", "24.60"]) {
      const at = row.indexOf(`>${value}<`);
      expect(at, value).toBeGreaterThan(-1);
      const cell = row.slice(row.lastIndexOf("<", at), at + 1);
      expect(cell, value).toContain("line-through");
      expect(cell, value).toContain("rgba(255,255,255,0.32)");
    }
    // The em dashes — the untimed time, the result-less landing — are not.
    const dashes = [...row.matchAll(/<span[^>]*>—<\/span>/g)].map((m) => m[0]);
    expect(dashes.length).toBeGreaterThanOrEqual(2);
    for (const dash of dashes) expect(dash).not.toContain("line-through");
    // Nothing struck wraps a dash either.
    const dashAt = row.indexOf(">—<");
    expect(
      row.slice(row.lastIndexOf("<span", dashAt - 1), dashAt),
    ).not.toContain("line-through");

    const restore = tag(row, "data-restore-site-removal");
    expect(restore).toContain('aria-label="Restore the shot"');
    expect(row).toContain("lucide-undo-2");
    // Still no number and no stroke row of its own.
    expect(numberOf(html, "s-p4-serve")).toBe("2");
    expect(row).not.toContain('data-row="shot"');
  });

  test("Show, Hide and Restore are the console's requests", () => {
    const toggled: string[] = [];
    const restored: string[] = [];
    const { BlackGhostShot } = createLoader().load(WELL) as {
      BlackGhostShot: (props: Record<string, unknown>) => React.ReactElement;
    };
    const tree = BlackGhostShot({
      shot: ghostOf(point4()),
      edit: editContext({
        openGhostIds: new Set([GHOST]),
        onToggleGhost: (id: string) => toggled.push(id),
        operations: {
          ...OPERATIONS,
          onRestoreSiteRemoval: (id: string) => restored.push(id),
        },
      }),
    });
    const click = (attr: string) => {
      const button = find(tree, attr)!;
      expect(button, attr).toBeDefined();
      let stopped = 0;
      (button.props.onClick as (e: unknown) => void)({
        stopPropagation: () => (stopped += 1),
      });
      expect(stopped).toBe(1);
    };
    click("data-ghost-toggle");
    expect(toggled).toEqual([GHOST]);
    click("data-restore-site-removal");
    expect(restored).toEqual([GHOST]);
  });

  test("read-only: the line and the row, no Restore", () => {
    const point = point4();
    for (const edit of [
      editContext({ editable: false, operations: undefined }),
      editContext({ operations: undefined }),
    ]) {
      const html = renderWell(point, marksOf(point, [phantomMark()]), {
        ...edit,
        openGhostIds: new Set([GHOST]),
      });
      expect(html).toContain(`data-shot-ghost="${GHOST}"`);
      expect(html).toContain("Hit after the fault");
      expect(html).not.toContain("data-restore-site-removal");
    }
  });

  test("with marks off, or none built, the ghost is an ordinary numbered row", () => {
    const point = point4();
    const marks = marksOf(point, [phantomMark()]);
    for (const html of [
      renderWell(point, marks, editContext({ marksEnabled: false })),
      renderWell(point, marks, editContext({ marksEnabled: undefined })),
      renderWell(point, null),
    ]) {
      expect(html).not.toContain("data-shot-ghost");
      expect(html).not.toContain("1 shot removed");
      expect(html.match(/data-row="shot"/g)).toHaveLength(3);
      expect(numberOf(html, "s-p4-fault")).toBe("1");
      expect(numberOf(html, GHOST)).toBe("2");
      expect(numberOf(html, "s-p4-serve")).toBe("3");
    }
  });

  test("a labeller's own delete of a ghost is a tombstone, not a ghost", () => {
    const point = point4();
    const deleted: LabelPoint = {
      ...point,
      shots: point.shots.map((s) =>
        s.id === GHOST
          ? {
              ...s,
              status: "deleted",
              statusBeforeDelete: "kept",
              deleteReason: "not_a_stroke",
            }
          : s,
      ),
    };
    const html = renderWell(deleted, marksOf(deleted, [phantomMark()]));
    expect(html).not.toContain("data-shot-ghost");
    expect(html).toContain(`data-tombstone-id="${GHOST}"`);
    expect(numberOf(html, "s-p4-serve")).toBe("2");
  });
});

test.describe("the point row over a ghost", () => {
  /**
   * Point 4 with its serves relabelled as groundstrokes, so the rally count
   * runs over every live stroke and the ghost would be counted or not.
   */
  function noServes(): LabelPoint {
    const point = point4();
    return {
      ...point,
      shots: point.shots.map((s) =>
        s.stroke === "first_serve" || s.stroke === "second_serve"
          ? { ...s, stroke: "backhand" as const, result: "in" as const }
          : s,
      ),
    };
  }

  test("the rally count, the deciding stroke and the sentence skip a drawn ghost", () => {
    const point = noServes();
    const marks = marksOf(point, [phantomMark()]);
    // Drawn as a ghost: two strokes in the rally.
    expect(inner(renderRow(point, marks), "data-point-detail")).toBe(
      "2 shot rally",
    );
    // An ordinary row — marks off, or none — and it counts.
    expect(
      inner(
        renderRow(point, marks, editContext({ marksEnabled: false })),
        "data-point-detail",
      ),
    ).toBe("3 shot rally");
    expect(inner(renderRow(point, null), "data-point-detail")).toBe(
      "3 shot rally",
    );

    // The sentence reads the last live stroke: Vargas's backhand — and so
    // does the settled hover line of a mark.
    const ended: LabelPoint = {
      ...point,
      ending: "error",
      endedBy: "p2",
      status: "edited",
      shots: point.shots.map((s) =>
        s.id === "s-p4-serve" ? { ...s, result: "out" as const } : s,
      ),
    };
    const html = renderRow(ended, marksOf(ended, [phantomMark()]));
    expect(inner(html, "data-point-sentence")).toBe("Backhand error by Vargas");
    expect(inner(html, "data-point-detail")).toBe("2 shot rally");
    expect(html).toContain("Changed by you");
  });

  test("the removed-shot chip stands while the ghost does, and goes with Restore", () => {
    const point = point4();
    const marks = marksOf(point, [phantomMark()]);
    const before = renderRow(point, marks);
    const chip = tag(before, 'data-mark-kind="fix"');
    expect(chip).toContain('data-mark-state="settled"');
    expect(before).toContain(">1 shot removed<");
    expect(before).not.toContain("Changed by you");

    const restored: LabelPoint = {
      ...point,
      shots: point.shots.map((s) =>
        s.id === GHOST ? applySiteRemovalRestore(s, AT) : s,
      ),
    };
    const after = renderRow(restored, marksOf(restored, [phantomMark()]));
    expect(after).not.toContain("data-mark-kind");
    expect(after).not.toContain("1 shot removed");
    // Restore is a change the labeller made: the pencil shows.
    expect(after).toContain("Changed by you");
    // And the well numbers the stroke again.
    const well = renderWell(restored, marksOf(restored, [phantomMark()]));
    expect(well).not.toContain("data-shot-ghost");
    expect(numberOf(well, GHOST)).toBe("2");
    expect(numberOf(well, "s-p4-serve")).toBe("3");
  });

  test("a fix for two removed strokes counts the ghosts still live", () => {
    const point = point4();
    const twin: LabelShot = {
      ...ghostOf(point),
      id: "s-p4-ghost-2",
      eventId: 404,
      siteRemovalRestoredAt: AT,
    };
    const two: LabelPoint = { ...point, shots: [...point.shots, twin] };
    const html = renderRow(two, marksOf(two, [phantomMark([402, 404])]));
    // One of the two is back: the chip reads one.
    expect(html).toContain(">1 shot removed<");
    expect(html).toContain("Changed by you");
  });
});

test.describe("the console", () => {
  type ConsoleProps = {
    session: LabelSession;
    video: null;
    marks?: LabelMarks | null;
    initialLayoutMode?: "black";
    initialExpandedPointId?: string | null;
    initialOpenGhostIds?: readonly string[];
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

  const SAVES = {
    onSaveShot: async () => ({ ok: true, status: "edited" }),
    onSavePoint: async () => ({ ok: true, status: "edited" }),
  };

  test("the black view draws the ghost only on a session with marks on", () => {
    const session = labelSessionFixture();
    const marks = marksOf(point4(), [phantomMark()]);
    const on = renderConsole({
      session,
      video: null,
      marks,
      initialLayoutMode: "black",
      initialExpandedPointId: P4,
      initialOpenGhostIds: [GHOST],
      ...SAVES,
    });
    expect(on).toContain(`data-shot-ghost="${GHOST}"`);
    expect(on).toContain(`data-shot-ghost-row="${GHOST}"`);
    expect(on).toContain("Hit after the fault");

    const off = renderConsole({
      session: { ...session, marksEnabled: false },
      video: null,
      marks,
      initialLayoutMode: "black",
      initialExpandedPointId: P4,
      ...SAVES,
    });
    expect(off).not.toContain("data-shot-ghost");
    expect(off).toContain(`data-shot-id="${GHOST}"`);

    const none = renderConsole({
      session,
      video: null,
      marks: null,
      initialLayoutMode: "black",
      initialExpandedPointId: P4,
      ...SAVES,
    });
    expect(none).not.toContain("data-shot-ghost");
  });

  test("the light layouts never draw a ghost", () => {
    const session = labelSessionFixture();
    const html = renderConsole({
      session,
      video: null,
      marks: marksOf(point4(), [phantomMark()]),
      initialExpandedPointId: P4,
      ...SAVES,
    });
    expect(html).not.toContain("data-shot-ghost");
    expect(html).toContain(`data-shot-id="${GHOST}"`);
  });
});

test("the light table files know nothing of a site-removed stroke", () => {
  for (const file of [
    "src/components/admin/labels/label-point-row.tsx",
    "src/components/admin/labels/label-shot-row.tsx",
    "src/components/admin/labels/label-points-table.tsx",
    "src/components/admin/labels/label-game-band.tsx",
  ]) {
    const source = readFileSync(file, "utf8");
    expect(source, file).not.toMatch(
      /isGhostShot|siteRemoval|data-shot-ghost|withoutGhosts|drawsGhosts/,
    );
  }
});

/** The first element in a React tree whose props carry `attr`. */
function find(
  node: React.ReactNode,
  attr: string,
): React.ReactElement<Record<string, unknown>> | null {
  if (!React.isValidElement(node)) return null;
  const element = node as React.ReactElement<Record<string, unknown>>;
  if (attr in element.props) return element;
  if (typeof element.type === "function") {
    const rendered = (element.type as (p: unknown) => React.ReactNode)(
      element.props,
    );
    return find(rendered, attr);
  }
  for (const child of React.Children.toArray(
    element.props.children as React.ReactNode,
  )) {
    const found = find(child, attr);
    if (found) return found;
  }
  return null;
}
