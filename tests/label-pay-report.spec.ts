import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

import { getLabelPayReport, groupSittings } from "@/lib/data/practice-server";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * The label pay report (`/admin/labels/pay`, T39): a non-practice session is
 * paid once, in the range an admin FIRST checked it (`first_checked_at`), to
 * whoever made its first submission. Sessions published and not checked yet
 * are listed as outstanding, outside every total. Time worked is the payee's
 * own work minutes, folded into sittings. Practice sets are not in the
 * report. Offline — the loader runs on an injected admin client that filters
 * in-memory rows the way PostgREST would.
 */

const ANA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BEN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const RANGE = { from: "2026-11-01", to: "2026-11-30" };
const HOUR_JOB = {
  start_time_seconds: 0,
  end_time_seconds: 3600,
  billable_seconds: 3600,
};

type Row = Record<string, unknown>;

interface SessionFixture {
  id: string;
  kind: "analyst" | "self" | "practice";
  status: "labelling" | "submitted" | "complete";
  completed_at: string | null;
  published_at: string | null;
  checked_at: string | null;
  first_checked_at: string | null;
  job: typeof HOUR_JOB | null;
  match: { player1_name: string | null; player2_name: string | null } | null;
}

function session(
  over: Partial<SessionFixture> & { id: string },
): SessionFixture {
  return {
    kind: "analyst",
    status: "complete",
    completed_at: null,
    published_at: null,
    checked_at: null,
    first_checked_at: null,
    job: HOUR_JOB,
    match: { player1_name: "Reyes", player2_name: "Okafor" },
    ...over,
  };
}

/**
 * A chainable stand-in for the service-role client. Filters run against the
 * rows. Every `label_submissions` read is recorded, so a spec can see that
 * the table is never read whole.
 */
function fakeDb(
  tables: {
    label_sessions: SessionFixture[];
    label_submissions: Row[];
    users: Row[];
    label_work_beats?: Row[];
  },
  reads: string[][] = [],
): AdminClient {
  const sessions: Row[] = tables.label_sessions.map((s) => ({ ...s }));
  const data: Record<string, Row[]> = {
    label_sessions: sessions,
    label_submissions: tables.label_submissions,
    users: tables.users,
    label_work_beats: tables.label_work_beats ?? [],
  };

  return {
    from(table: string) {
      let rows = [...(data[table] ?? [])];
      const filters: string[] = [];
      if (table === "label_submissions") reads.push(filters);
      const has = (row: Row, column: string) =>
        row[column] !== undefined && row[column] !== null;
      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          rows = rows.filter((r) => r[column] === value);
          return builder;
        },
        neq(column: string, value: unknown) {
          rows = rows.filter((r) => r[column] !== value);
          return builder;
        },
        gte(column: string, value: string) {
          filters.push(`${column} gte`);
          rows = rows.filter(
            (r) => has(r, column) && (r[column] as string) >= value,
          );
          return builder;
        },
        lt(column: string, value: string) {
          filters.push(`${column} lt`);
          rows = rows.filter(
            (r) => has(r, column) && (r[column] as string) < value,
          );
          return builder;
        },
        is(column: string, value: null) {
          rows = rows.filter((r) => (r[column] ?? null) === value);
          return builder;
        },
        in(column: string, values: unknown[]) {
          filters.push(`${column} in`);
          rows = rows.filter((r) => values.includes(r[column]));
          return builder;
        },
        order(column: string) {
          rows = [...rows].sort((a, b) =>
            String(a[column] ?? "").localeCompare(String(b[column] ?? "")),
          );
          return builder;
        },
        returns() {
          return builder;
        },
        async range(start: number, end: number) {
          return { data: rows.slice(start, end + 1), error: null };
        },
      };
      return builder;
    },
  } as unknown as AdminClient;
}

const users: Row[] = [
  { id: ANA, email: "ana@labellers.test", first_name: "Ana", last_name: "A" },
  { id: BEN, email: "ben@labellers.test", first_name: "Ben", last_name: "B" },
];

function submission(sessionId: string, by: string, at: string): Row {
  return {
    id: `${sessionId}-${at}`,
    session_id: sessionId,
    submitted_by: by,
    submitted_at: at,
  };
}

async function report(
  tables: Parameters<typeof fakeDb>[0],
  reads?: string[][],
  range = RANGE,
) {
  const result = await getLabelPayReport(range, {
    requireAdmin: async () => ({ id: ADMIN }),
    createAdminClient: () => fakeDb(tables, reads),
  });
  if (!result.ok) throw new Error("expected a report");
  return result;
}

/** A session published at `published` and first checked at `checked` (both ISO). */
function checkedSession(
  id: string,
  published: string,
  checked: string,
  over: Partial<SessionFixture> = {},
): SessionFixture {
  return session({
    id,
    completed_at: published,
    published_at: published,
    checked_at: checked,
    first_checked_at: checked,
    ...over,
  });
}

test.describe("label pay report", () => {
  test("a session first checked inside the range is paid; one checked before it is not", async () => {
    const result = await report({
      label_sessions: [
        checkedSession("s-in", "2026-11-10T09:00:00Z", "2026-11-11T09:00:00Z"),
        checkedSession(
          "s-before",
          "2026-10-20T09:00:00Z",
          "2026-10-21T09:00:00Z",
        ),
      ],
      label_submissions: [
        submission("s-in", ANA, "2026-11-10T08:59:00Z"),
        submission("s-before", ANA, "2026-10-20T08:59:00Z"),
      ],
      users,
    });

    expect(result.lines.map((l) => l.sessionId)).toEqual(["s-in"]);
    expect(result.lines[0]).toMatchObject({
      state: "checked",
      publishedAt: "2026-11-10T09:00:00Z",
      firstCheckedAt: "2026-11-11T09:00:00Z",
      videoMinutes: 60,
      match: "Reyes v Okafor",
      workedMinutes: null,
      sittings: [],
    });
    expect(result.rows).toEqual([
      {
        labellerId: ANA,
        name: expect.any(String),
        email: "ana@labellers.test",
        paidSessions: 1,
        paidVideoMinutes: 60,
        workedMinutes: 0,
        untrackedSessions: 1,
        outstandingSessions: 0,
        outstandingVideoMinutes: 0,
      },
    ]);
  });

  test("published in one month and checked in the next, a session is paid in the month it was checked", async () => {
    const tables = {
      label_sessions: [
        checkedSession(
          "s-late",
          "2026-10-31T20:00:00Z",
          "2026-11-02T09:00:00Z",
        ),
      ],
      label_submissions: [submission("s-late", ANA, "2026-10-31T19:00:00Z")],
      users,
    };
    const november = await report(tables);
    expect(november.rows[0]).toMatchObject({
      paidSessions: 1,
      paidVideoMinutes: 60,
    });
    const october = await report(tables, undefined, {
      from: "2026-10-01",
      to: "2026-10-31",
    });
    // Checked since, so October no longer lists it at all.
    expect(october.lines).toEqual([]);
  });

  test("a session checked, sent back and checked again is paid in its first check's range only", async () => {
    const result = await report({
      label_sessions: [
        // First checked in October; the re-check stamped checked_at in
        // November, but first_checked_at never moves.
        checkedSession(
          "s-rechecked",
          "2026-10-10T09:00:00Z",
          "2026-10-11T09:00:00Z",
          { checked_at: "2026-11-05T09:00:00Z" },
        ),
      ],
      label_submissions: [
        submission("s-rechecked", ANA, "2026-10-10T08:00:00Z"),
      ],
      users,
    });
    expect(result.lines).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  test("outstanding sessions are listed but never counted: awaiting check, and sent back", async () => {
    const result = await report({
      label_sessions: [
        checkedSession(
          "s-paid",
          "2026-11-03T09:00:00Z",
          "2026-11-04T09:00:00Z",
        ),
        // Published in October, still not checked: outstanding in November.
        session({
          id: "s-awaiting",
          status: "complete",
          published_at: "2026-10-28T09:00:00Z",
        }),
        session({
          id: "s-back",
          status: "labelling",
          published_at: "2026-11-08T10:00:00Z",
        }),
        // Published after the range: not this range's at all.
        session({
          id: "s-december",
          status: "complete",
          published_at: "2026-12-02T10:00:00Z",
        }),
      ],
      label_submissions: [
        submission("s-paid", ANA, "2026-11-03T08:00:00Z"),
        submission("s-awaiting", ANA, "2026-10-28T08:00:00Z"),
        submission("s-back", ANA, "2026-11-08T09:00:00Z"),
        submission("s-december", ANA, "2026-12-02T09:00:00Z"),
      ],
      users,
    });

    expect(result.lines.map((l) => [l.sessionId, l.state])).toEqual([
      ["s-paid", "checked"],
      ["s-awaiting", "awaiting"],
      ["s-back", "sent-back"],
    ]);
    expect(result.rows[0]).toMatchObject({
      paidSessions: 1,
      paidVideoMinutes: 60,
      untrackedSessions: 1,
      outstandingSessions: 2,
      outstandingVideoMinutes: 120,
    });
  });

  test("credit goes to the first submitter", async () => {
    const result = await report({
      label_sessions: [
        checkedSession(
          "s-shared",
          "2026-11-12T10:00:00Z",
          "2026-11-13T10:00:00Z",
        ),
      ],
      label_submissions: [
        submission("s-shared", BEN, "2026-11-12T09:00:00Z"),
        submission("s-shared", ANA, "2026-11-12T09:30:00Z"),
      ],
      users,
    });

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({
      labellerId: BEN,
      state: "checked",
    });
    expect(result.rows.map((r) => r.labellerId)).toEqual([BEN]);
  });

  test("a session the admin published with no submission is not counted", async () => {
    const result = await report({
      label_sessions: [
        checkedSession(
          "s-admin",
          "2026-11-09T10:00:00Z",
          "2026-11-09T10:00:00Z",
        ),
      ],
      label_submissions: [],
      users,
    });

    expect(result.lines).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  test("never reads label_submissions whole, and practice sets are not in the report", async () => {
    const reads: string[][] = [];
    const result = await report(
      {
        label_sessions: [
          checkedSession(
            "s-in",
            "2026-11-10T09:00:00Z",
            "2026-11-10T10:00:00Z",
          ),
          session({ id: "p-in", kind: "practice", status: "submitted" }),
          // Submitted in October and never published: nothing to read.
          session({ id: "s-old", status: "labelling" }),
        ],
        label_submissions: [
          // First submitted before the range, checked inside it.
          submission("s-in", ANA, "2026-10-29T09:00:00Z"),
          submission("p-in", BEN, "2026-11-03T09:00:00Z"),
          submission("s-old", ANA, "2026-10-02T09:00:00Z"),
        ],
        users,
      },
      reads,
    );
    expect(result.lines).toEqual([
      expect.objectContaining({ sessionId: "s-in", labellerId: ANA }),
    ]);
    expect(result.rows.map((r) => r.labellerId)).toEqual([ANA]);
    for (const filters of reads) {
      expect(filters.includes("session_id in"), filters.join(", ")).toBe(true);
    }
  });

  test("time worked is the paid labeller's own minutes, in sittings split by a long gap", async () => {
    const beat = (sessionId: string, by: string, minute: string): Row => ({
      session_id: sessionId,
      user_id: by,
      minute,
    });
    const result = await report({
      label_sessions: [
        checkedSession(
          "s-worked",
          "2026-11-17T15:00:00Z",
          "2026-11-18T09:00:00Z",
        ),
        checkedSession(
          "s-none",
          "2026-11-16T15:00:00Z",
          "2026-11-16T16:00:00Z",
        ),
        // Outstanding: its minutes show on its line but join no total.
        session({
          id: "s-open",
          status: "complete",
          published_at: "2026-11-20T10:00:00Z",
        }),
      ],
      label_submissions: [
        submission("s-worked", ANA, "2026-11-17T14:00:00Z"),
        submission("s-none", ANA, "2026-11-16T14:00:00Z"),
        submission("s-open", ANA, "2026-11-20T09:00:00Z"),
      ],
      label_work_beats: [
        // Ana's two sittings: 07:04–07:07 (a 2-minute pause inside it),
        // then 09:00 after a long break.
        beat("s-worked", ANA, "2026-11-16T07:04:00Z"),
        beat("s-worked", ANA, "2026-11-16T07:06:00Z"),
        beat("s-worked", ANA, "2026-11-16T09:00:00Z"),
        // Someone else's minutes on it are not hers.
        beat("s-worked", ADMIN, "2026-11-18T08:59:00Z"),
        beat("s-worked", BEN, "2026-11-17T10:00:00Z"),
        // After the range closed: never changes November's figure.
        beat("s-worked", ANA, "2026-12-03T10:00:00Z"),
        beat("s-open", ANA, "2026-11-20T08:00:00Z"),
      ],
      users,
    });

    expect(result.lines.find((l) => l.sessionId === "s-worked")).toMatchObject({
      workedMinutes: 3,
      sittings: [
        {
          start: "2026-11-16T07:04:00.000Z",
          end: "2026-11-16T07:07:00.000Z",
          minutes: 2,
        },
        {
          start: "2026-11-16T09:00:00.000Z",
          end: "2026-11-16T09:01:00.000Z",
          minutes: 1,
        },
      ],
    });
    expect(result.lines.find((l) => l.sessionId === "s-none")).toMatchObject({
      workedMinutes: null,
      sittings: [],
    });
    expect(result.lines.find((l) => l.sessionId === "s-open")).toMatchObject({
      state: "awaiting",
      workedMinutes: 1,
    });
    expect(result.rows).toEqual([
      expect.objectContaining({
        labellerId: ANA,
        workedMinutes: 3,
        untrackedSessions: 1,
        outstandingSessions: 1,
      }),
    ]);
  });

  test("a gap of exactly the sitting gap stays one sitting; one minute more splits it", () => {
    expect(
      groupSittings([
        "2026-11-16T07:00:00Z",
        "2026-11-16T07:15:00Z",
        "2026-11-16T07:31:00Z",
        // A duplicate minute counts once.
        "2026-11-16T07:31:00Z",
      ]).map((s) => s.minutes),
    ).toEqual([2, 1]);
    expect(groupSittings([])).toEqual([]);
  });

  test("the page and table never say Submitted or Approved, and name every state", () => {
    for (const file of [
      "src/app/admin/labels/pay/page.tsx",
      "src/components/admin/labels-practice/pay-report-table.tsx",
    ]) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, file).not.toMatch(/submitted|approved/i);
    }
    const table = readFileSync(
      resolve(
        process.cwd(),
        "src/components/admin/labels-practice/pay-report-table.tsx",
      ),
      "utf8",
    );
    expect(table).toContain('checked: "Checked"');
    expect(table).toContain("Awaiting check");
    expect(table).toContain("Sent back");
  });
});
