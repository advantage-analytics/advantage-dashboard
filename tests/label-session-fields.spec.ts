import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AdminClient } from "@/lib/supabase/admin";
import type { LabelMarks } from "@/lib/services/labels/marks";
import type { LabelSession } from "@/lib/services/labels/session";
import {
  applyLabelSessionPatch,
  parseLabelSessionPatch,
} from "@/lib/services/labels/session-fields";
import {
  updateLabelSessionFields,
  writeLabelSessionFields,
} from "@/lib/services/labels/session-fields-session";
import { labelSessionFixture } from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The "Score doesn't add up" writes (T41, board 08m `BANNER`, now the rail
 * header's score chip): the parser that admits ONLY `final_score` and
 * `video_ends_early`, the service over a fake client — ONE update on
 * `label_sessions`, never `matches` — and the chip itself in the black rail's
 * header, rendered offline through `fixtures/vm-modules`: shown on a
 * mismatch, gone when the labeller has said the video ends early, when the
 * scores agree, and when marks are off. The header's two totals ride along.
 */

const CONSOLE = "src/components/admin/labels/label-console.tsx";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";

// ── The parser ─────────────────────────────────────────────────────────────

test.describe("parseLabelSessionPatch", () => {
  test("accepts final_score as pairs of whole games per set, or null", () => {
    expect(
      parseLabelSessionPatch({
        final_score: [
          [6, 3],
          [4, 6],
        ],
      }),
    ).toEqual({
      ok: true,
      patch: {
        final_score: [
          [6, 3],
          [4, 6],
        ],
      },
    });
    expect(parseLabelSessionPatch({ final_score: [] })).toEqual({
      ok: true,
      patch: { final_score: [] },
    });
    expect(parseLabelSessionPatch({ final_score: null })).toEqual({
      ok: true,
      patch: { final_score: null },
    });
    // Pairs are copied, not aliased, and anything past the pair is dropped.
    const sets = [[1, 0]];
    const parsed = parseLabelSessionPatch({ final_score: sets });
    expect(parsed).toEqual({ ok: true, patch: { final_score: [[1, 0]] } });
    if ("ok" in parsed) expect(parsed.patch.final_score).not.toBe(sets);
  });

  test("accepts video_ends_early as a boolean or null, and both keys together", () => {
    expect(parseLabelSessionPatch({ video_ends_early: true })).toEqual({
      ok: true,
      patch: { video_ends_early: true },
    });
    expect(parseLabelSessionPatch({ video_ends_early: null })).toEqual({
      ok: true,
      patch: { video_ends_early: null },
    });
    expect(
      parseLabelSessionPatch({
        final_score: [[2, 1]],
        video_ends_early: false,
      }),
    ).toEqual({
      ok: true,
      patch: { final_score: [[2, 1]], video_ends_early: false },
    });
  });

  test("rejects any other key, a malformed score, a non-boolean, and an empty patch", () => {
    for (const [patch, error] of [
      [{ status: "complete" }, '"status" is not a field the session takes.'],
      [
        { final_score: [[1, 0]], ad_scoring: false },
        '"ad_scoring" is not a field the session takes.',
      ],
      [{ score: [[1, 0]] }, '"score" is not a field the session takes.'],
      [{}, "Nothing to change."],
      [null, "The session patch must be an object."],
      [[[1, 0]], "The session patch must be an object."],
      ["6-3", "The session patch must be an object."],
    ] as const) {
      expect(parseLabelSessionPatch(patch), JSON.stringify(patch)).toEqual({
        error,
      });
    }
    const SCORE =
      "final_score must be null or a list of [games, games] pairs, one per set.";
    for (const final_score of [
      [6, 3],
      [[6]],
      [[6, 3, 1]],
      [[-1, 3]],
      [[6.5, 3]],
      [["6", "3"]],
      [[6, null]],
      "6-3",
      {},
      true,
    ]) {
      expect(
        parseLabelSessionPatch({ final_score }),
        JSON.stringify(final_score),
      ).toEqual({ error: SCORE });
    }
    for (const video_ends_early of ["yes", 1, 0, {}]) {
      expect(parseLabelSessionPatch({ video_ends_early })).toEqual({
        error: "video_ends_early must be true, false or null.",
      });
    }
  });

  test("applyLabelSessionPatch moves only the keys the patch carries", () => {
    const fields = { finalScore: null, videoEndsEarly: null };
    expect(applyLabelSessionPatch(fields, { final_score: [[1, 0]] })).toEqual({
      finalScore: [[1, 0]],
      videoEndsEarly: null,
    });
    expect(
      applyLabelSessionPatch(
        { finalScore: [[1, 0]], videoEndsEarly: null },
        { video_ends_early: true },
      ),
    ).toEqual({ finalScore: [[1, 0]], videoEndsEarly: true });
    expect(
      applyLabelSessionPatch(
        { finalScore: [[1, 0]], videoEndsEarly: true },
        { final_score: null },
      ),
    ).toEqual({ finalScore: null, videoEndsEarly: true });
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
  session?: Record<string, unknown> | null;
  /** The compare-and-set matched nothing — the session closed meanwhile. */
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

const updates = (fake: ReturnType<typeof fakeClient>) =>
  fake.calls.filter((c) => c.op === "update");

test.describe("writeLabelSessionFields", () => {
  test("ONE update on label_sessions with the parsed patch, matched on the id and an open status — never matches", async () => {
    const fake = fakeClient({});
    const result = await writeLabelSessionFields({
      supabase: fake.supabase,
      sessionId: SESSION_ID,
      patch: {
        final_score: [
          [4, 0],
          [2, 1],
        ],
      },
    });
    expect(result).toEqual({
      ok: true,
      fields: {
        final_score: [
          [4, 0],
          [2, 1],
        ],
      },
    });
    expect(updates(fake)).toEqual([
      {
        table: "label_sessions",
        op: "update",
        values: {
          final_score: [
            [4, 0],
            [2, 1],
          ],
        },
        filters: { id: SESSION_ID, status: "labelling" },
      },
    ]);
    // It read the session's gate — status AND marks_enabled — first.
    expect(fake.calls[0]).toMatchObject({
      table: "label_sessions",
      op: "select",
      filters: { id: SESSION_ID },
    });
    for (const call of fake.calls) expect(call.table).toBe("label_sessions");
    // The column's CHECK asks for a jsonb array: pairs per set, nothing else.
    const written = updates(fake)[0].values?.final_score;
    expect(Array.isArray(written)).toBe(true);
    for (const pair of written as unknown[]) {
      expect(Array.isArray(pair)).toBe(true);
      expect((pair as unknown[]).length).toBe(2);
    }
  });

  test("video_ends_early is the other column it may set, alone", async () => {
    const fake = fakeClient({});
    expect(
      await writeLabelSessionFields({
        supabase: fake.supabase,
        sessionId: SESSION_ID,
        patch: { video_ends_early: true },
      }),
    ).toEqual({ ok: true, fields: { video_ends_early: true } });
    expect(updates(fake)[0].values).toEqual({ video_ends_early: true });
  });

  test("a session labelled without marks, and a complete one, are refused before anything is written", async () => {
    const blind = fakeClient({
      session: { status: "labelling", marks_enabled: false },
    });
    expect(
      await writeLabelSessionFields({
        supabase: blind.supabase,
        sessionId: SESSION_ID,
        patch: { video_ends_early: true },
      }),
    ).toEqual({
      error:
        "This session is labelled without the site's marks, so its score is not held against the entered one.",
    });
    expect(updates(blind)).toEqual([]);

    const frozen = fakeClient({
      session: { status: "complete", marks_enabled: true },
    });
    expect(
      await writeLabelSessionFields({
        supabase: frozen.supabase,
        sessionId: SESSION_ID,
        patch: { video_ends_early: true },
      }),
    ).toEqual({
      error: "This session is complete, so its labels can no longer change.",
    });
    expect(updates(frozen)).toEqual([]);
  });

  test("a bad id, a bad patch, a missing session and a race", async () => {
    expect(
      await writeLabelSessionFields({
        supabase: fakeClient({}).supabase,
        sessionId: "not-a-uuid",
        patch: { video_ends_early: true },
      }),
    ).toEqual({ error: "Invalid session id." });

    // The patch is refused before the session is even read.
    const other = fakeClient({});
    expect(
      await writeLabelSessionFields({
        supabase: other.supabase,
        sessionId: SESSION_ID,
        patch: { status: "complete" },
      }),
    ).toEqual({ error: '"status" is not a field the session takes.' });
    expect(other.calls).toEqual([]);

    expect(
      await writeLabelSessionFields({
        supabase: fakeClient({ session: null }).supabase,
        sessionId: SESSION_ID,
        patch: { video_ends_early: true },
      }),
    ).toEqual({ error: "Session not found." });

    const raced = fakeClient({ raced: true });
    expect(
      await writeLabelSessionFields({
        supabase: raced.supabase,
        sessionId: SESSION_ID,
        patch: { video_ends_early: true },
      }),
    ).toEqual({
      error: "This session changed in another tab. Reload to see it.",
    });
  });

  test("the entry point refuses without an admin, before a client is built", async () => {
    let built = 0;
    const result = await updateLabelSessionFields(
      SESSION_ID,
      { video_ends_early: true },
      {
        requireAdmin: async () => null,
        createAdminClient: () => {
          built += 1;
          return fakeClient({}).supabase;
        },
      },
    );
    expect(result).toEqual({ error: "Administrator access is required." });
    expect(built).toBe(0);

    const fake = fakeClient({});
    expect(
      await updateLabelSessionFields(
        SESSION_ID.toUpperCase(),
        { video_ends_early: true },
        {
          requireAdmin: async () => ({ id: "admin" }),
          createAdminClient: () => fake.supabase,
        },
      ),
    ).toEqual({ ok: true, fields: { video_ends_early: true } });
    expect(updates(fake)[0].filters.id).toBe(SESSION_ID);
  });
});

// ── The score chip and the totals in the rail header ───────────────────────

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
      "insertPoint",
      "updateSessionFields",
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

const SAVES = {
  onSaveShot: async () => ({ ok: true, status: "edited" }),
  onSavePoint: async () => ({ ok: true, status: "edited" }),
};

/** Marks built, with nothing on any row: enough for the chip's gate. */
const EMPTY_MARKS: LabelMarks = {
  points: {},
  shots: {},
  suggestions: [],
  serveSides: {},
};

/** `operations: null` renders a console that cannot be written. */
function black(
  session: LabelSession,
  marks: LabelMarks | null,
  operations: Record<string, unknown> | null = countingOperations().operations,
): string {
  return renderConsole({
    session,
    video: null,
    marks,
    initialLayoutMode: "black",
    initialExpandedPointId: null,
    operations: operations ?? undefined,
    ...SAVES,
  });
}

/** The opening tag carrying `attr`. */
function tag(html: string, attr: string): string {
  const at = html.indexOf(attr);
  expect(at, attr).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
}

/** The rail header's markup: from its marker to the scroller. */
function header(html: string): string {
  const at = html.indexOf("data-label-rail-header");
  expect(at).toBeGreaterThan(-1);
  return html.slice(at, html.indexOf("data-label-rail-scroller"));
}

/** The score chip's text, as a screen reader hears the chip or a hover reads it. */
const CHIP_TEXT = (html: string) =>
  /data-label-score-chip-text=""[^>]*>([^<]*)</.exec(html)?.[1];

test.describe("the score chip in the rail header", () => {
  /**
   * The fixture: one game of set 1 counted for Lee (its last counted point,
   * the ace), a second game with no counted point, and a match record of
   * 6–3 4–6. The rows make 1–0 in set 1; the record says 6–3.
   */
  test("the labelled pair against the entered one, in the header, amber, as a dark menu of the three answers — and a render writes nothing", () => {
    const { called, operations } = countingOperations();
    const html = black(labelSessionFixture(), EMPTY_MARKS, operations);
    expect(called).toEqual([]);

    // No banner anywhere: the chip is the score's one home.
    expect(html).not.toContain("data-label-score-banner");
    expect(html).not.toContain("Stats are estimates until");

    const head = header(html);
    const chip = tag(head, 'data-label-score-chip=""');
    expect(chip).toContain('type="button"');
    expect(chip).toContain('aria-label="Score doesn’t add up"');
    expect(chip).toContain('aria-haspopup="menu"');
    expect(chip).toContain('aria-expanded="false"');
    for (const cls of [
      "rounded-full",
      "bg-[rgba(253,230,138,0.14)]",
      "text-[rgba(252,211,77,1)]",
      "text-[10px]",
      "h-[18px]",
      "shrink-0",
    ]) {
      expect(chip, cls).toContain(cls);
    }
    expect(CHIP_TEXT(head)).toBe("1–0 · entered 6–3");
    // The words give way under 600px of header; the dot stays.
    expect(tag(head, "data-label-score-chip-text")).toMatch(
      /class="[^"]*\bhidden\b[^"]*@min-\[600px\]:inline/,
    );
    expect(tag(html, 'data-label-rail-header=""')).toMatch(
      /class="[^"]*@container\b/,
    );
    // After the checked count, before the save line and the way out.
    expect(head.indexOf("data-label-score-chip")).toBeGreaterThan(
      head.indexOf("data-label-rail-progress"),
    );
    expect(head.indexOf("data-label-score-chip")).toBeLessThan(
      head.indexOf("data-save-status"),
    );
    expect(head.indexOf("data-label-score-chip")).toBeLessThan(
      head.indexOf('aria-label="Exit full screen"'),
    );
    // A closed menu renders no rows; the answers are the menu's, not the
    // header's. Nothing of the old banner's words is drawn in the header.
    expect(head).not.toContain("Fix the entered score");
    expect(head).not.toContain("Find the gap");
  });

  test("gone once the labeller has said the video ends early", () => {
    const session = { ...labelSessionFixture(), videoEndsEarly: true };
    expect(black(session, EMPTY_MARKS)).not.toContain("data-label-score-chip");
  });

  test("gone when the labelled points agree with the score — final_score first", () => {
    // The labeller's reading matches the rows: no chip, whatever the record says.
    const agreed = { ...labelSessionFixture(), finalScore: [[1, 0]] };
    expect(black(agreed, EMPTY_MARKS)).not.toContain("data-label-score-chip");
    // The record agrees and nothing was entered on the session.
    const record = {
      ...labelSessionFixture(),
      matchScore: { player1: [1], player2: [0] },
    };
    expect(black(record, EMPTY_MARKS)).not.toContain("data-label-score-chip");
    // Nothing entered anywhere: nothing to hold the rows against.
    const none = { ...labelSessionFixture(), matchScore: null };
    expect(black(none, EMPTY_MARKS)).not.toContain("data-label-score-chip");
    // A reading that differs from the rows shows, with the reading's numbers.
    const differs = { ...labelSessionFixture(), finalScore: [[4, 0]] };
    expect(CHIP_TEXT(header(black(differs, EMPTY_MARKS)))).toBe(
      "1–0 · entered 4–0",
    );
  });

  test("never without marks: a session labelled blind shows no chip and no totals", () => {
    for (const html of [
      black(labelSessionFixture(), null),
      black({ ...labelSessionFixture(), marksEnabled: false }, null),
    ]) {
      expect(html).not.toContain("data-label-score-chip");
      expect(html).not.toContain("data-label-rail-to-check");
      expect(html).not.toContain("data-label-rail-fixes");
    }
  });

  test("words alone on a session that cannot be written: not a control", () => {
    const html = black(labelSessionFixture(), EMPTY_MARKS, null);
    const head = header(html);
    const chip = tag(head, 'data-label-score-chip=""');
    expect(chip).not.toContain("<button");
    expect(chip).toContain('role="img"');
    expect(chip).toContain(
      "These points make 1–0 in set 1. The score entered was 6–3.",
    );
    expect(chip).not.toContain("aria-haspopup");
    expect(CHIP_TEXT(head)).toBe("1–0 · entered 6–3");
  });

  test("the answers' words live in marks-copy, each with what it does", () => {
    const copy = readFileSync("src/lib/services/labels/marks-copy.ts", "utf8");
    for (const words of [
      "Fix the entered score",
      "Video ends early",
      "Find the gap",
      "Make the entered score what these points say.",
      "The points stop before the match did; the score stands.",
    ]) {
      expect(copy).toContain(words);
    }
    const rail = readFileSync(
      "src/components/admin/labels/label-black-rail.tsx",
      "utf8",
    );
    expect(rail).toContain('tone="dark"');
    expect(rail).toContain(
      "findGapDescription(setNumber, firstPointId !== null)",
    );
    expect(rail).toContain("onFindGap(firstPointId)");
  });
});

test.describe("the header's totals", () => {
  test("a flag and a wand with the match's counts, named for a reader; nothing with no marks", () => {
    const html = black(labelSessionFixture(), EMPTY_MARKS);
    const head = header(html);
    // Nothing on any row: both read zero, in the quiet inks.
    const toCheck = tag(head, 'data-label-rail-to-check=""');
    expect(toCheck).toContain('role="img"');
    expect(toCheck).toContain('aria-label="Nothing left to check"');
    expect(toCheck).toContain("text-white/45");
    expect(head).toContain("lucide-flag");
    const fixes = tag(head, 'data-label-rail-fixes=""');
    expect(fixes).toContain('aria-label="No automatic fixes"');
    expect(fixes).toContain("text-white/55");
    expect(head).toContain("lucide-wand-sparkles");
    // After the checked count, before the save line.
    expect(head.indexOf("data-label-rail-to-check")).toBeGreaterThan(
      head.indexOf("data-label-rail-progress"),
    );
    expect(head.indexOf("data-label-rail-fixes")).toBeLessThan(
      head.indexOf("data-save-status"),
    );
    // The mono the progress line uses, and nothing that could push the way
    // out off a 520px rail.
    expect(toCheck).toMatch(/class="[^"]*\bmono\b[^"]*\btext-\[10px\]/);
    expect(toCheck).toContain("shrink-0");
    expect(fixes).toContain("shrink-0");
  });

  test("counts marks, not points: open flags in amber, every fix, a drawn ghost among them", () => {
    const session = labelSessionFixture();
    const [p1, p2, , p4] = session.points;
    const marks: LabelMarks = {
      ...EMPTY_MARKS,
      points: {
        // Two flags on the edited point: one settled by its edit, one a fix.
        [p1.id]: [
          {
            code: "winner_disputed",
            kind: "flag",
            scope: "point",
            params: { scoreWinner: "p2", lastStrokeWinner: "p1" },
          },
          { code: "winner_guessed", kind: "fix", scope: "point", params: {} },
        ],
        // Two open flags on the checked-as-is point: not open, so not counted.
        [p2.id]: [
          { code: "serve_fault", kind: "flag", scope: "point", params: {} },
          { code: "pick_winner", kind: "flag", scope: "point", params: {} },
        ],
        // The ghost's fix on point 4, still drawn: one fix.
        [p4.id]: [
          {
            code: "phantom_strokes_dropped",
            kind: "fix",
            scope: "point",
            params: { eventIds: [402], hitter: "p1" },
          },
        ],
      },
      shots: {
        // An open flag on a live stroke of point 4 counts for its point.
        "s-p4-serve": [
          {
            code: "net_hit_contradicts_height",
            kind: "flag",
            scope: "shot",
            params: {},
          },
        ],
      },
    };
    const head = header(black(session, marks));
    const toCheck = tag(head, 'data-label-rail-to-check=""');
    expect(toCheck).toContain('aria-label="1 flag to check"');
    expect(toCheck).toContain("text-[rgba(252,211,77,1)]");
    expect(tag(head, 'data-label-rail-fixes=""')).toContain(
      'aria-label="2 automatic fixes"',
    );

    // The ghost put back: its fix is gone from the count.
    const restored = {
      ...session,
      points: session.points.map((point) =>
        point.id === p4.id
          ? {
              ...point,
              shots: point.shots.map((shot) =>
                shot.id === "s-p4-ghost"
                  ? { ...shot, siteRemovalRestoredAt: "2026-10-05T10:00:00Z" }
                  : shot,
              ),
            }
          : point,
      ),
    };
    expect(
      tag(header(black(restored, marks)), 'data-label-rail-fixes=""'),
    ).toContain('aria-label="1 automatic fix"');
  });
});
