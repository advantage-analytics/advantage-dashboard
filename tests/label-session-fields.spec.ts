import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AdminClient } from "@/lib/supabase/admin";
import type { LabelMarks } from "@/lib/services/labels/marks";
import type { LabelSession } from "@/lib/services/labels/session";
import {
  START_SCORE_ERROR,
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

/** The session's own fields (`final_score`, `video_ends_early`, `start_score`): the parser, the service over a fake client, and the rail header's score chip and total. */

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

  test("accepts start_score as the whole start, or null, and refuses anything else", () => {
    const start = {
      sets: [0, 0],
      games: [2, 0],
      points: [1, 0],
      server: "p1",
    };
    const parsed = parseLabelSessionPatch({ start_score: start });
    expect(parsed).toEqual({ ok: true, patch: { start_score: start } });
    // Copied, not aliased.
    if ("ok" in parsed) {
      expect(parsed.patch.start_score).not.toBe(start);
      expect(parsed.patch.start_score?.games).not.toBe(start.games);
    }
    expect(parseLabelSessionPatch({ start_score: null })).toEqual({
      ok: true,
      patch: { start_score: null },
    });
    // A tiebreak's counts run past 3.
    expect(
      parseLabelSessionPatch({
        start_score: { ...start, points: [5, 4], server: "p2" },
      }),
    ).toEqual({
      ok: true,
      patch: { start_score: { ...start, points: [5, 4], server: "p2" } },
    });
    // Beside the other two keys.
    expect(
      parseLabelSessionPatch({
        start_score: start,
        final_score: [[6, 3]],
        video_ends_early: false,
      }),
    ).toEqual({
      ok: true,
      patch: {
        start_score: start,
        final_score: [[6, 3]],
        video_ends_early: false,
      },
    });
    for (const start_score of [
      {},
      [],
      "2-0",
      true,
      { sets: [0, 0], games: [2, 0], points: [1, 0] },
      { ...start, server: "p3" },
      { ...start, server: null },
      { ...start, points: [1] },
      { ...start, points: [1, 0, 0] },
      { ...start, games: [-1, 0] },
      { ...start, games: [1.5, 0] },
      { ...start, sets: ["0", 0] },
      { ...start, sets: null },
      { ...start, extra: 1 },
    ]) {
      expect(
        parseLabelSessionPatch({ start_score }),
        JSON.stringify(start_score),
      ).toEqual({ error: START_SCORE_ERROR });
    }
  });

  test("applyLabelSessionPatch moves only the keys the patch carries", () => {
    const start = {
      sets: [0, 0] as [number, number],
      games: [2, 0] as [number, number],
      points: [1, 0] as [number, number],
      server: "p1" as const,
    };
    const fields = { finalScore: null, videoEndsEarly: null, startScore: null };
    expect(applyLabelSessionPatch(fields, { final_score: [[1, 0]] })).toEqual({
      finalScore: [[1, 0]],
      videoEndsEarly: null,
      startScore: null,
    });
    expect(
      applyLabelSessionPatch(
        { finalScore: [[1, 0]], videoEndsEarly: null, startScore: null },
        { video_ends_early: true },
      ),
    ).toEqual({ finalScore: [[1, 0]], videoEndsEarly: true, startScore: null });
    expect(
      applyLabelSessionPatch(
        { finalScore: [[1, 0]], videoEndsEarly: true, startScore: null },
        { final_score: null },
      ),
    ).toEqual({ finalScore: null, videoEndsEarly: true, startScore: null });
    expect(
      applyLabelSessionPatch(
        { finalScore: [[1, 0]], videoEndsEarly: true, startScore: null },
        { start_score: start },
      ),
    ).toEqual({
      finalScore: [[1, 0]],
      videoEndsEarly: true,
      startScore: start,
    });
    expect(
      applyLabelSessionPatch(
        { finalScore: null, videoEndsEarly: null, startScore: start },
        { start_score: null },
      ),
    ).toEqual({ finalScore: null, videoEndsEarly: null, startScore: null });
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

/** The flag list's chevron, which carries the score's dot when it doesn't add up. */
const CHEVRON = (html: string) => tag(header(html), 'data-label-flag-list=""');

test.describe("a score that doesn't add up, in the flag list", () => {
  /**
   * The fixture: game 1 of set 1 at 15–15 (two counted points, one each),
   * a second game with no counted point, and a match record of 6–3 4–6.
   * Neither game is settled, so the rows make 0–0 in set 1; the record says
   * 6–3 — and the list says which games fall short.
   */
  const SENTENCE =
    "Set 1: labelled 0–0, entered 6–3 · game 1 unfinished (15–15) · game 2 unfinished (0–0)";
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
      {
        kind: "unfinished",
        setNumber: 1,
        gameNumber: 2,
        gameInSet: 2,
        score: "0–0",
      },
    ],
  };

  test("no pill of its own: a dot on the list's chevron, named for a reader — and a render writes nothing", () => {
    const { called, operations } = countingOperations();
    const html = black(labelSessionFixture(), EMPTY_MARKS, operations);
    expect(called).toEqual([]);
    expect(html).not.toContain("data-label-score-chip");
    const chevron = CHEVRON(html);
    expect(chevron).toContain("data-score-mismatch");
    expect(chevron).toContain(
      'aria-label="Every open flag, and the score that doesn’t add up"',
    );
    expect(chevron).toContain('aria-haspopup="menu"');
    expect(chevron).toContain('aria-expanded="false"');
  });

  test("gone once the labeller has said the video ends early", () => {
    const session = { ...labelSessionFixture(), videoEndsEarly: true };
    expect(header(black(session, EMPTY_MARKS))).not.toContain(
      "data-score-mismatch",
    );
  });

  test("gone when the labelled points agree with the score — the match record first", () => {
    // A stored reading that matches the rows does not hide a record that
    // does not: the record is the source of truth.
    const stored = { ...labelSessionFixture(), finalScore: [[0, 0]] };
    expect(CHEVRON(black(stored, EMPTY_MARKS))).toContain(
      "data-score-mismatch",
    );
    // Without a record, the stored reading is held against the rows.
    const agreed = {
      ...labelSessionFixture(),
      matchScore: null,
      finalScore: [[0, 0]],
    };
    expect(header(black(agreed, EMPTY_MARKS))).not.toContain(
      "data-score-mismatch",
    );
    // The record agrees and nothing was entered on the session.
    const record = {
      ...labelSessionFixture(),
      matchScore: { player1: [0], player2: [0] },
    };
    expect(header(black(record, EMPTY_MARKS))).not.toContain(
      "data-score-mismatch",
    );
    // Nothing entered anywhere: nothing to hold the rows against.
    const none = { ...labelSessionFixture(), matchScore: null };
    expect(header(black(none, EMPTY_MARKS))).not.toContain(
      "data-score-mismatch",
    );
    // A reading that differs from the rows shows.
    const differs = {
      ...labelSessionFixture(),
      matchScore: null,
      finalScore: [[4, 0]],
    };
    expect(CHEVRON(black(differs, EMPTY_MARKS))).toContain(
      "data-score-mismatch",
    );
  });

  test("the menu: Go to game first, no answer rewrites the score, Use the match score again only with a score stored", () => {
    const { ScoreChipMenu } = createLoader().load(RAIL) as {
      ScoreChipMenu: (props: Record<string, unknown>) => React.ReactNode;
    };
    const one = { ...mismatch, reasons: [mismatch.reasons[0]] };
    const calls: string[] = [];
    const props = {
      mismatch: one,
      close: () => calls.push("close"),
      onGoToGame: (key: string) => calls.push(`go ${key}`),
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
      "Video ends early",
      "Find the gap",
      "Use the match score again",
    ]);
    // No game named: no Go to row.
    const noGame = ScoreChipMenu({
      ...props,
      mismatch: { ...one, reasons: [] },
    });
    expect(rows(noGame)[0][0]).toBe("Video ends early");
  });

  test("the band or slot carrying the game's key is where Go to game scrolls", () => {
    // The rail's scroll reads `data-game-key`; the band carries it.
    const html = black(labelSessionFixture(), EMPTY_MARKS);
    expect(tag(html, 'data-game-band="1-1"')).toContain('data-game-key="1·1"');
  });

  test("never without marks: a session labelled blind shows no list and no total", () => {
    for (const html of [
      black(labelSessionFixture(), null),
      black({ ...labelSessionFixture(), marksEnabled: false }, null),
    ]) {
      expect(html).not.toContain("data-label-flag-list");
      expect(html).not.toContain("data-label-rail-to-check");
      expect(html).not.toContain("data-label-rail-fixes");
    }
  });

  test("on a session that cannot be written: Go to the named game with the sentence — the sentence alone with none named", () => {
    const { ScoreRows } = createLoader().load(RAIL) as {
      ScoreRows: (
        props: Record<string, unknown>,
      ) => React.ReactElement<Record<string, unknown>>;
    };
    const calls: string[] = [];
    const base = {
      mismatch,
      stored: "0–0",
      close: () => calls.push("close"),
      onGoToGame: (key: string) => calls.push(`go ${key}`),
    };
    const go = ScoreRows(base);
    expect(go.props.label).toBe("Go to game 1");
    expect(go.props.description).toBe(SENTENCE);
    (go.props.onSelect as () => void)();
    expect(calls).toEqual(["close", "go 1·1"]);

    const words = ScoreRows({
      ...base,
      mismatch: { ...mismatch, reasons: [] },
    });
    expect(String(words.props.children)).toContain(
      "These points make 0–0 in set 1. The score entered was 6–3.",
    );
  });
});

test.describe("the header's total", () => {
  test("thin tracking says so once beside the grey count, not on an ordinary match", () => {
    const session = { ...labelSessionFixture(), matchScore: null };
    const [point] = session.points;
    const [shot] = point.shots;
    const serve = {
      ...shot,
      stroke: "first_serve" as const,
      result: "in" as const,
      landingX: null,
      landingY: null,
    };
    const seed = (landing: number | null) => ({
      hitter: shot.hitter,
      stroke: "first_serve" as const,
      result: "in" as const,
      spin: null,
      contact_x: 0,
      contact_y: 0,
      landing_x: landing,
      landing_y: landing,
      video_time: shot.videoTime,
    });
    const match = (missing: number) => ({
      ...session,
      points: Array.from({ length: 24 }, (_, i) => ({
        ...point,
        id: `p-${i}`,
        pointIndex: i,
        // No winner for the serve to contradict: the flag stays grey.
        winner: null,
        ending: null,
        endedBy: null,
        shots: [
          {
            ...serve,
            id: `s-${i}`,
            seed: seed(i < missing ? null : 5),
          },
        ],
      })),
    });
    const notice = tag(
      header(black(match(6), EMPTY_MARKS)),
      'data-label-flag-notice=""',
    );
    expect(notice).toContain("Thin tracking: 6 of 24 serves in play");
    expect(header(black(match(2), EMPTY_MARKS))).not.toContain(
      "data-label-flag-notice",
    );
  });

  test("a flag with the match's count, named for a reader", () => {
    const html = black(
      { ...labelSessionFixture(), matchScore: null },
      EMPTY_MARKS,
    );
    const head = header(html);
    // No mark that can move the score and no score to hold the rows to: the
    // amber count reads zero. The rows' own hints are grey flags, so the
    // control is named for them and is not amber.
    const toCheck = tag(head, 'data-label-rail-to-check=""');
    expect(toCheck).not.toContain("rail-amber");
    expect(toCheck).toContain('aria-label="Nothing left to check"');
    // The grey list beside it is a control of its own.
    expect(tag(head, 'data-label-rail-data-count=""')).toMatch(
      /aria-label="\d+ data points?: /,
    );
  });

  test("a set that doesn't add up is a flag: counted, a chip that names it, and a slot after the set's last point", () => {
    // The fixture's points make 0–0 against a 6–3 record.
    const session = labelSessionFixture();
    const head = header(black(session, EMPTY_MARKS));
    expect(tag(head, 'data-label-rail-to-check=""')).toContain(
      'aria-label="1 point to review"',
    );
    const chip = tag(head, 'data-label-score-stop=""');
    expect(chip).toContain(
      'aria-label="Score doesn’t add up: Set 1 ends 0–0, record 6–3"',
    );
    // The chip replaces the dot by the chevron.
    expect(CHEVRON(black(session, EMPTY_MARKS))).not.toContain(
      "rounded-full bg-[var(--rail-amber)]",
    );
    const html = black(session, EMPTY_MARKS);
    const last = session.points.at(-1)!;
    const slot = tag(html, 'data-row="set-score"');
    expect(slot).toContain(`data-set-score="${last.id}"`);
    expect(html).toContain("Set 1 ends 0–0");
    expect(html).toContain(
      "The match record says 6–3. A game is missing or credited to the wrong player",
    );
    // Video ends early answers it: no chip, no slot, nothing counted.
    const early = black({ ...session, videoEndsEarly: true }, EMPTY_MARKS);
    expect(early).not.toContain("data-label-score-stop");
    expect(early).not.toContain('data-row="set-score"');
  });

  test("counts points open on what can change the score — not hints, not hidden marks, not marks", () => {
    const session = { ...labelSessionFixture(), matchScore: null };
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
        // Point 4, untouched: two counted marks open — one point — a hint
        // and a hidden one.
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
    expect(toCheck).toContain('aria-label="1 point to review"');

    // Hints and hidden marks alone: nothing amber. The hints are the grey
    // count, and the control is named for them.
    const quiet: LabelMarks = {
      ...marks,
      points: {
        [p4.id]: marks.points[p4.id].filter((m) => m.tier !== "count"),
      },
    };
    const quietCheck = tag(
      header(black(session, quiet)),
      'data-label-rail-to-check=""',
    );
    expect(quietCheck).not.toContain("to review");
    expect(quietCheck).not.toContain("rail-amber");
    expect(quietCheck).toContain('aria-label="Nothing left to check"');
    expect(
      tag(header(black(session, quiet)), 'data-label-rail-data-count=""'),
    ).toMatch(/aria-label="\d+ data points?: /);
  });
});
