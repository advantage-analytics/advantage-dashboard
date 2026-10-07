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
import { tag } from "./fixtures/html-probe";
import { labelSessionFixture } from "./fixtures/label-session";
import { elements } from "./fixtures/react-tree";
import { createLoader } from "./fixtures/vm-modules";

/** The session's own fields (`final_score`, `video_ends_early`): the parser, the service over a fake client, and the rail header's score chip and total. */

const CONSOLE = "src/components/admin/labels/label-console.tsx";
const RAIL = "src/components/admin/labels/label-black-rail.tsx";
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
   * The fixture: game 1 of set 1 at 15–15 (two counted points, one each),
   * a second game with no counted point, and a match record of 6–3 4–6.
   * Neither game is settled, so the rows make 0–0 in set 1; the record says
   * 6–3 — and the chip says which games fall short.
   */
  const SENTENCE =
    "Set 1: labelled 0–0, entered 6–3 · game 1 unfinished (15–15) · game 2 unfinished (0–0)";

  test("the sentence — set, pairs, the unfinished games — in the header, as a menu — and a render writes nothing", () => {
    const { called, operations } = countingOperations();
    const html = black(labelSessionFixture(), EMPTY_MARKS, operations);
    expect(called).toEqual([]);

    const head = header(html);
    const chip = tag(head, 'data-label-score-chip=""');
    expect(chip).toContain('type="button"');
    expect(chip).toContain('aria-label="Score doesn’t add up"');
    expect(chip).toContain('aria-haspopup="menu"');
    expect(chip).toContain('aria-expanded="false"');
    expect(CHIP_TEXT(head)).toBe(SENTENCE);
  });

  test("gone once the labeller has said the video ends early", () => {
    const session = { ...labelSessionFixture(), videoEndsEarly: true };
    expect(black(session, EMPTY_MARKS)).not.toContain("data-label-score-chip");
  });

  test("gone when the labelled points agree with the score — final_score first", () => {
    // The labeller's reading matches the rows: no chip, whatever the record says.
    const agreed = { ...labelSessionFixture(), finalScore: [[0, 0]] };
    expect(black(agreed, EMPTY_MARKS)).not.toContain("data-label-score-chip");
    // The record agrees and nothing was entered on the session.
    const record = {
      ...labelSessionFixture(),
      matchScore: { player1: [0], player2: [0] },
    };
    expect(black(record, EMPTY_MARKS)).not.toContain("data-label-score-chip");
    // Nothing entered anywhere: nothing to hold the rows against.
    const none = { ...labelSessionFixture(), matchScore: null };
    expect(black(none, EMPTY_MARKS)).not.toContain("data-label-score-chip");
    // A reading that differs from the rows shows, with the reading's numbers.
    const differs = { ...labelSessionFixture(), finalScore: [[4, 0]] };
    expect(CHIP_TEXT(header(black(differs, EMPTY_MARKS)))).toBe(
      "Set 1: labelled 0–0, entered 4–0 · game 1 unfinished (15–15) · game 2 unfinished (0–0)",
    );
  });

  test("the menu: Go to game first, Fix says what it stores, Use the match score again only with a score stored", () => {
    const { ScoreChipMenu } = createLoader().load(RAIL) as {
      ScoreChipMenu: (props: Record<string, unknown>) => React.ReactNode;
    };
    const mismatch = {
      setNumber: 1,
      labelled: "0–0",
      entered: "6–3",
      firstPointId: "p-0001",
      reasons: [
        {
          kind: "unfinished",
          setNumber: 1,
          gameNumber: 1,
          gameInSet: 1,
          score: "15–15",
        },
      ],
    };
    const calls: string[] = [];
    const props = {
      mismatch,
      stored: "0–0",
      reason: mismatch.reasons[0],
      game: "1·1",
      gameInSet: 1,
      close: () => calls.push("close"),
      onGoToGame: (key: string) => calls.push(`go ${key}`),
      onFixEnteredScore: () => calls.push("fix"),
      onVideoEndsEarly: () => calls.push("early"),
      onFindGap: () => calls.push("gap"),
    };
    const rows = (tree: React.ReactNode) =>
      elements(tree)
        .filter((e) => typeof e.props.label === "string")
        .map((e) => [e.props.label, e.props.description]);

    const without = ScoreChipMenu(props);
    expect(rows(without)).toEqual([
      ["Go to game 1", "game 1 unfinished (15–15)"],
      ["Fix the entered score", "Store 0–0 as the entered score."],
      [
        "Video ends early",
        "The points stop before the match did; the score stands.",
      ],
      [
        "Find the gap",
        "Goes to the first point of set 1. The entered score is a set total, so the gap can’t be placed at a game.",
      ],
    ]);
    // Each row closes the menu, then asks. Nothing is written by a render.
    const go = elements(without).find((e) => e.props.label === "Go to game 1");
    (go?.props.onSelect as () => void)();
    expect(calls).toEqual(["close", "go 1·1"]);

    const withStored = ScoreChipMenu({
      ...props,
      onClearEnteredScore: () => calls.push("clear"),
    });
    expect(rows(withStored).map(([label]) => label)).toEqual([
      "Go to game 1",
      "Fix the entered score",
      "Video ends early",
      "Find the gap",
      "Use the match score again",
    ]);
    // No game named: no Go to row.
    const noGame = ScoreChipMenu({
      ...props,
      reason: undefined,
      game: null,
      gameInSet: null,
    });
    expect(rows(noGame)[0][0]).toBe("Fix the entered score");
  });

  test("the band or slot carrying the game's key is where Go to game scrolls", () => {
    // The rail's scroll reads `data-game-key`; the band carries it.
    const html = black(labelSessionFixture(), EMPTY_MARKS);
    expect(tag(html, 'data-game-band="1-1"')).toContain('data-game-key="1·1"');
  });

  test("never without marks: a session labelled blind shows no chip and no total", () => {
    for (const html of [
      black(labelSessionFixture(), null),
      black({ ...labelSessionFixture(), marksEnabled: false }, null),
    ]) {
      expect(html).not.toContain("data-label-score-chip");
      expect(html).not.toContain("data-label-rail-to-check");
      expect(html).not.toContain("data-label-rail-fixes");
    }
  });

  test("on a session that cannot be written: no menu, a button that goes to the named game — words alone with none named", () => {
    const html = black(labelSessionFixture(), EMPTY_MARKS, null);
    const head = header(html);
    const chip = tag(head, 'data-label-score-chip=""');
    expect(chip).toContain("<button");
    expect(chip).toContain(
      "These points make 0–0 in set 1. The score entered was 6–3.",
    );
    expect(chip).toContain("Go to game 1.");
    expect(chip).not.toContain("aria-haspopup");
    expect(CHIP_TEXT(head)).toBe(SENTENCE);

    // The entered score has a set the rows never reach: nothing to go to.
    const beyond = {
      ...labelSessionFixture(),
      finalScore: [
        [0, 0],
        [6, 4],
      ],
    };
    const far = tag(
      header(black(beyond, EMPTY_MARKS, null)),
      'data-label-score-chip=""',
    );
    expect(far).not.toContain("<button");
    expect(far).toContain('role="img"');
  });
});

test.describe("the header's total", () => {
  test("a flag with the match's count, named for a reader", () => {
    const html = black(labelSessionFixture(), EMPTY_MARKS);
    const head = header(html);
    // Nothing on any row: it reads zero.
    const toCheck = tag(head, 'data-label-rail-to-check=""');
    expect(toCheck).toContain('role="img"');
    expect(toCheck).toContain('aria-label="Nothing left to check"');
  });

  test("counts open marks that can change the score — not hints, not hidden marks, not points", () => {
    const session = labelSessionFixture();
    const [p1, p2, , p4] = session.points;
    const m = (code: string, tier: string, scope = "point") =>
      ({ code, tier, scope, params: {} }) as LabelMarks["points"][string][0];
    const marks: LabelMarks = {
      ...EMPTY_MARKS,
      points: {
        // The edited point: its counted mark is settled by the edit.
        [p1.id]: [m("winner_disputed", "count"), m("winner_guessed", "hidden")],
        // The checked-as-is point: its counted mark is not open; a hint
        // beside it was never counted.
        [p2.id]: [m("serve_fault", "hint"), m("pick_winner", "count")],
        // Point 4, untouched: two counted marks open, a hint and a hidden one.
        [p4.id]: [
          m("pick_winner", "count"),
          m("reserve_after_in", "count"),
          m("ending_suspect_line", "hint"),
          m("phantom_strokes_dropped", "hidden"),
        ],
      },
      // A hint on a stroke of point 4 is a hint still: not counted.
      shots: {
        "s-p4-serve": [m("net_hit_contradicts_height", "hint", "shot")],
      },
    };
    const head = header(black(session, marks));
    const toCheck = tag(head, 'data-label-rail-to-check=""');
    expect(toCheck).toContain('aria-label="2 flags to check"');

    // Hints and hidden marks alone: nothing to check.
    const quiet: LabelMarks = {
      ...marks,
      points: {
        [p4.id]: marks.points[p4.id].filter((m) => m.tier !== "count"),
      },
    };
    expect(
      tag(header(black(session, quiet)), 'data-label-rail-to-check=""'),
    ).toContain('aria-label="Nothing left to check"');
  });
});
