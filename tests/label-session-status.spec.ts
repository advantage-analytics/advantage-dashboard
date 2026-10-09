import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { labelConfirmCopy } from "@/components/admin/labels/label-confirm";
import type { AdminClient } from "@/lib/supabase/admin";
import type { LabelMarks } from "@/lib/services/labels/marks";
import { withLiveScoreMarks } from "@/lib/services/labels/score-marks";
import type { LabelSession } from "@/lib/services/labels/session";
import { completeWarnings } from "@/lib/services/labels/session-status";
import {
  ANOTHER_SESSION_OPEN,
  completeLabelSession,
  reopenLabelSession,
  writeLabelSessionComplete,
  writeLabelSessionReopen,
} from "@/lib/services/labels/session-status-session";
import { tag } from "./fixtures/html-probe";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * "Mark complete" and "Reopen": the service over a fake client, what the
 * confirm warns is still open, and the console header's two buttons.
 */

const CONSOLE = "src/components/admin/labels/label-console.tsx";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const NAMES = { p1: "Lee", p2: "Vargas" };
const { P1, P2 } = FIXTURE_POINT_IDS;

// ── The service ────────────────────────────────────────────────────────────

interface Call {
  table: string;
  op: "select" | "update";
  values?: Record<string, unknown>;
  filters: Record<string, unknown>;
}

function fakeClient(rows: {
  session?: Record<string, unknown> | null;
  /** The compare-and-set matched nothing — another tab got there first. */
  raced?: boolean;
  /** The update is refused with this Postgres code. */
  failCode?: string;
}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: {} };
      calls.push(call);
      const answer = () => {
        if (call.op === "update") {
          if (rows.failCode) {
            return {
              data: null,
              error: { message: "duplicate key", code: rows.failCode },
            };
          }
          return {
            data: rows.raced ? [] : [{ id: call.filters.id }],
            error: null,
          };
        }
        return {
          data:
            rows.session === undefined
              ? { status: "labelling", marks_enabled: true }
              : rows.session,
          error: null,
        };
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

const updates = (fake: ReturnType<typeof fakeClient>) =>
  fake.calls.filter((c) => c.op === "update");

test.describe("writeLabelSessionComplete", () => {
  test("the gate, then ONE update of status and completed_at, matched on the id and an open status", async () => {
    const fake = fakeClient({});
    const before = Date.now();
    expect(
      await writeLabelSessionComplete({
        supabase: fake.supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({ ok: true, status: "complete" });
    const [write] = updates(fake);
    expect(write).toMatchObject({
      table: "label_sessions",
      values: { status: "complete" },
      filters: { id: SESSION_ID, status: "labelling" },
    });
    expect(Object.keys(write.values ?? {}).sort()).toEqual([
      "completed_at",
      "status",
    ]);
    expect(
      Date.parse(write.values?.completed_at as string),
    ).toBeGreaterThanOrEqual(before - 1000);
    for (const call of fake.calls) expect(call.table).toBe("label_sessions");
  });

  test("a session labelled without marks completes like any other", async () => {
    const blind = fakeClient({
      session: { status: "labelling", marks_enabled: false },
    });
    expect(
      await writeLabelSessionComplete({
        supabase: blind.supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({ ok: true, status: "complete" });
  });

  test("refused: a bad id, a missing or complete session, and a race", async () => {
    const none = fakeClient({});
    expect(
      await writeLabelSessionComplete({
        supabase: none.supabase,
        sessionId: "nope",
      }),
    ).toEqual({ error: "Invalid session id." });
    expect(none.calls).toEqual([]);

    expect(
      await writeLabelSessionComplete({
        supabase: fakeClient({ session: null }).supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({ error: "Session not found." });

    const frozen = fakeClient({
      session: { status: "complete", marks_enabled: true },
    });
    expect(
      await writeLabelSessionComplete({
        supabase: frozen.supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({
      error: "This session is complete, so its labels can no longer change.",
    });
    expect(updates(frozen)).toEqual([]);

    expect(
      await writeLabelSessionComplete({
        supabase: fakeClient({ raced: true }).supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({
      error: "This session changed in another tab. Reload to see it.",
    });
  });
});

test.describe("writeLabelSessionReopen", () => {
  test("a complete session back to labelling, completed_at cleared, matched on the complete status", async () => {
    const fake = fakeClient({ session: { status: "complete" } });
    expect(
      await writeLabelSessionReopen({
        supabase: fake.supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({ ok: true, status: "labelling" });
    expect(updates(fake)).toEqual([
      {
        table: "label_sessions",
        op: "update",
        values: { status: "labelling", completed_at: null },
        filters: { id: SESSION_ID, status: "complete" },
      },
    ]);
  });

  test("refused: an open session, another open session of the match, a race", async () => {
    const open = fakeClient({});
    expect(
      await writeLabelSessionReopen({
        supabase: open.supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({ error: "This session is already open for labelling." });
    expect(updates(open)).toEqual([]);

    expect(
      await writeLabelSessionReopen({
        supabase: fakeClient({
          session: { status: "complete" },
          failCode: "23505",
        }).supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({ error: ANOTHER_SESSION_OPEN });
    expect(ANOTHER_SESSION_OPEN).toContain(
      "Another labelling session is open for this match",
    );

    expect(
      await writeLabelSessionReopen({
        supabase: fakeClient({ session: { status: "complete" }, raced: true })
          .supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({
      error: "This session changed in another tab. Reload to see it.",
    });
    expect(
      await writeLabelSessionReopen({
        supabase: fakeClient({ session: null }).supabase,
        sessionId: SESSION_ID,
      }),
    ).toEqual({ error: "Session not found." });
  });
});

test("both entry points refuse without an admin, before a client is built", async () => {
  for (const entry of [completeLabelSession, reopenLabelSession]) {
    let built = 0;
    const result = await entry(SESSION_ID, {
      requireAdmin: async () => null,
      createAdminClient: () => {
        built += 1;
        return fakeClient({}).supabase;
      },
    });
    expect(result).toEqual({ error: "Administrator access is required." });
    expect(built).toBe(0);
  }
});

// ── What the confirm warns of ──────────────────────────────────────────────

const EMPTY_MARKS: LabelMarks = {
  points: {},
  shots: {},
  suggestions: [],
  serveSides: {},
};

function warningsOf(session: LabelSession, marks: LabelMarks | null) {
  return completeWarnings({
    points: session.points,
    adScoring: session.adScoring,
    marks,
    finalScore: session.finalScore,
    videoEndsEarly: session.videoEndsEarly,
    matchScore: session.matchScore,
  });
}

test.describe("completeWarnings", () => {
  test("the points left to check, each game left short or run over, and the entered score the sets disagree with", () => {
    expect(warningsOf(labelSessionFixture(), EMPTY_MARKS)).toEqual([
      "2 points of 3 not checked",
      "Game 1 unfinished (15–15)",
      "Game 2 unfinished (0–0)",
      "Set 1 labelled 0–0, entered 6–3",
    ]);
  });

  test("no score line once the video ends early, and none with nothing entered", () => {
    const early = { ...labelSessionFixture(), videoEndsEarly: true };
    expect(warningsOf(early, EMPTY_MARKS)).not.toContainEqual(
      expect.stringContaining("entered"),
    );
    const unscored = { ...labelSessionFixture(), matchScore: null };
    expect(warningsOf(unscored, EMPTY_MARKS)).not.toContainEqual(
      expect.stringContaining("entered"),
    );
  });

  test("the open marks, counted as the rail counts them; none on a session without marks", () => {
    // Point 2 unchecked, served from the wrong side for its labelled score:
    // two score flags open on it, as the rail reads them live.
    const fixture = labelSessionFixture();
    const session = {
      ...fixture,
      points: fixture.points.map((p) =>
        p.id === P2 ? { ...p, checkedAt: null } : p,
      ),
    };
    const marks = withLiveScoreMarks(
      { ...EMPTY_MARKS, serveSides: { [P1]: "deuce", [P2]: "deuce" } },
      session.points,
      true,
    );
    expect(warningsOf(session, marks)).toContain(
      "2 marks still open on 1 point",
    );
    expect(warningsOf(session, null)).not.toContainEqual(
      expect.stringContaining("mark"),
    );
  });

  test("nothing at all on a session with nothing left", () => {
    const empty = {
      ...labelSessionFixture(),
      points: [],
      matchScore: null,
      finalScore: null,
    };
    expect(warningsOf(empty, EMPTY_MARKS)).toEqual([]);
  });

  test("the confirm's copy: warn, then allow", () => {
    expect(
      labelConfirmCopy({ kind: "complete-session", warnings: [] }, NAMES),
    ).toEqual({
      title: "Mark this session complete?",
      description:
        "Every point is checked and the score adds up. The console becomes read-only; Reopen brings it back.",
      confirmLabel: "Mark complete",
      pendingLabel: "Completing…",
      tone: "primary",
    });
    expect(
      labelConfirmCopy(
        { kind: "complete-session", warnings: ["Game 1 unfinished (15–15)"] },
        NAMES,
      ),
    ).toMatchObject({
      description:
        "Some things are still open. You can complete it anyway, and Reopen brings it back to fix them.",
      confirmLabel: "Mark complete",
    });
  });
});

// ── The console header ─────────────────────────────────────────────────────

function renderConsole(
  session: LabelSession,
  operations: Record<string, unknown> | undefined,
): { html: string; called: string[] } {
  const { LabelConsole } = createLoader().load(CONSOLE) as {
    LabelConsole: React.ComponentType<Record<string, unknown>>;
  };
  const html = renderToStaticMarkup(
    React.createElement(LabelConsole, {
      session,
      video: null,
      marks: null,
      operations,
      onSaveShot: async () => ({ ok: true, status: "edited" }),
      onSavePoint: async () => ({ ok: true, status: "edited" }),
    }),
  );
  return { html, called: [] };
}

/** The console's operations, each counting a call; a render makes none. */
function counting(names: readonly string[]) {
  const called: string[] = [];
  const operations = Object.fromEntries(
    names.map((name) => [
      name,
      async () => {
        called.push(name);
        return { error: "not in a render" };
      },
    ]),
  );
  return { called, operations };
}

/** The docked header: from its marker to the console's view. */
function headerOf(html: string): string {
  const at = html.indexOf("data-console-header");
  expect(at).toBeGreaterThan(-1);
  return html.slice(at, at + 4000);
}

test.describe("the console header", () => {
  const BOTH = ["completeSession", "reopenSession", "updateSessionFields"];

  test("a labelling session offers Mark complete, not Reopen — and a render writes nothing", () => {
    const { called, operations } = counting(BOTH);
    const head = headerOf(
      renderConsole(labelSessionFixture(), operations).html,
    );
    expect(called).toEqual([]);
    const button = tag(head, 'data-mark-complete=""');
    expect(button).toContain('type="button"');
    expect(head).toContain(">Mark complete<");
    expect(head).not.toContain("data-reopen-session");
    expect(head).not.toContain("data-session-complete");
  });

  test("a complete session reads Complete and offers Reopen, outside the editable gate", () => {
    const { operations } = counting(BOTH);
    const complete = { ...labelSessionFixture(), status: "complete" as const };
    const head = headerOf(renderConsole(complete, operations).html);
    expect(head).toContain("data-session-complete");
    expect(head).toContain(">Reopen<");
    expect(head).not.toContain("data-mark-complete");
  });

  test("neither without its action", () => {
    const { operations } = counting(["updateSessionFields"]);
    for (const status of ["labelling", "complete"] as const) {
      const head = headerOf(
        renderConsole({ ...labelSessionFixture(), status }, operations).html,
      );
      expect(head).not.toContain("data-mark-complete");
      expect(head).not.toContain("data-reopen-session");
    }
    // Read-only, with no operations at all: neither.
    const head = headerOf(renderConsole(labelSessionFixture(), undefined).html);
    expect(head).not.toContain("data-mark-complete");
  });
});
