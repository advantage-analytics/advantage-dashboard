import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

import { getLabelPayReport, groupSittings } from "@/lib/data/practice-server";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * The label pay report (`/admin/labels/pay`, T39): a non-practice session is
 * paid once, on the UTC day it was first published, to whoever made its first
 * submission; it reads "checked" once an admin has passed it. Time worked is
 * that labeller's own work minutes on it, folded into sittings. Practice sets
 * are not in the report. Offline — the
 * loader runs on an injected admin client that filters in-memory rows the way
 * PostgREST would.
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
) {
  const result = await getLabelPayReport(RANGE, {
    requireAdmin: async () => ({ id: ADMIN }),
    createAdminClient: () => fakeDb(tables, reads),
  });
  if (!result.ok) throw new Error("expected a report");
  return result;
}

test.describe("label pay report", () => {
  test("a session published inside the range is counted, one published before it is not", async () => {
    const result = await report({
      label_sessions: [
        session({
          id: "s-in",
          completed_at: "2026-11-10T09:00:00Z",
          published_at: "2026-11-10T09:00:00Z",
        }),
        // Submitted and last published in range, but first published in
        // October: October already paid for it.
        session({
          id: "s-before",
          completed_at: "2026-11-05T09:00:00Z",
          published_at: "2026-10-30T09:00:00Z",
        }),
      ],
      label_submissions: [
        submission("s-in", ANA, "2026-11-10T08:59:00Z"),
        submission("s-before", ANA, "2026-10-30T08:59:00Z"),
        submission("s-before", ANA, "2026-11-05T08:59:00Z"),
      ],
      users,
    });

    expect(result.lines.map((l) => l.sessionId)).toEqual(["s-in"]);
    expect(result.lines[0]).toMatchObject({
      publishedAt: "2026-11-10T09:00:00Z",
      state: "published",
      videoHours: 1,
      match: "Reyes v Okafor",
      workedMinutes: null,
      sittings: [],
    });
    expect(result.rows).toEqual([
      {
        labellerId: ANA,
        name: expect.any(String),
        email: "ana@labellers.test",
        publishedSessions: 1,
        publishedHours: 1,
        checkedSessions: 0,
        checkedHours: 0,
        workedMinutes: 0,
        untrackedSessions: 1,
      },
    ]);
  });

  test("credit goes to the first submitter, and a checked session counts as checked", async () => {
    const result = await report({
      label_sessions: [
        session({
          id: "s-shared",
          completed_at: "2026-11-12T10:00:00Z",
          published_at: "2026-11-12T10:00:00Z",
          checked_at: "2026-11-13T10:00:00Z",
        }),
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
    expect(result.rows[0]).toMatchObject({
      publishedSessions: 0,
      checkedSessions: 1,
      checkedHours: 1,
    });
  });

  test("a sent-back session counts as published", async () => {
    const result = await report({
      label_sessions: [
        session({
          id: "s-back",
          status: "labelling",
          completed_at: "2026-11-08T10:00:00Z",
          published_at: "2026-11-08T10:00:00Z",
          checked_at: null,
        }),
      ],
      label_submissions: [submission("s-back", ANA, "2026-11-08T09:00:00Z")],
      users,
    });

    expect(result.lines).toEqual([
      expect.objectContaining({ sessionId: "s-back", state: "published" }),
    ]);
    expect(result.rows[0]).toMatchObject({
      publishedSessions: 1,
      checkedSessions: 0,
    });
  });

  test("a session the admin published with no submission is not counted", async () => {
    const result = await report({
      label_sessions: [
        session({
          id: "s-admin",
          completed_at: "2026-11-09T10:00:00Z",
          published_at: "2026-11-09T10:00:00Z",
          checked_at: "2026-11-09T10:00:00Z",
        }),
      ],
      label_submissions: [],
      users,
    });

    expect(result.lines).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  test("never reads label_submissions whole: only the range, and the sessions it names", async () => {
    const reads: string[][] = [];
    const result = await report(
      {
        label_sessions: [
          session({
            id: "s-in",
            completed_at: "2026-11-10T09:00:00Z",
            published_at: "2026-11-10T09:00:00Z",
          }),
          session({ id: "p-in", kind: "practice", status: "submitted" }),
          // Submitted in October and never published: nothing to read.
          session({ id: "s-old", status: "labelling" }),
        ],
        label_submissions: [
          // First submitted before the range, published inside it.
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
    // Practice sets are not in the report at all.
    expect(result.rows.map((r) => r.labellerId)).toEqual([ANA]);
    for (const filters of reads) {
      expect(
        filters.includes("submitted_at gte") ||
          filters.includes("session_id in"),
        filters.join(", "),
      ).toBe(true);
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
        session({
          id: "s-worked",
          published_at: "2026-11-17T15:00:00Z",
          checked_at: "2026-11-18T09:00:00Z",
        }),
        session({ id: "s-none", published_at: "2026-11-16T15:00:00Z" }),
      ],
      label_submissions: [
        submission("s-worked", ANA, "2026-11-17T14:00:00Z"),
        submission("s-none", ANA, "2026-11-16T14:00:00Z"),
      ],
      label_work_beats: [
        // Ana's two sittings: 07:04–07:07 (a 2-minute pause inside it),
        // then 09:00 after a long break.
        beat("s-worked", ANA, "2026-11-16T07:04:00Z"),
        beat("s-worked", ANA, "2026-11-16T07:06:00Z"),
        beat("s-worked", ANA, "2026-11-16T09:00:00Z"),
        // Before the publish, but still Ana's work on this session.
        // Someone else checking it is not.
        beat("s-worked", ADMIN, "2026-11-18T08:59:00Z"),
        beat("s-worked", BEN, "2026-11-17T10:00:00Z"),
        // Reworked after the range closed (sent back in December): never
        // changes November's figure.
        beat("s-worked", ANA, "2026-12-03T10:00:00Z"),
      ],
      users,
    });

    const worked = result.lines.find((l) => l.sessionId === "s-worked");
    expect(worked).toMatchObject({
      match: "Reyes v Okafor",
      state: "checked",
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
    expect(result.rows).toEqual([
      expect.objectContaining({
        labellerId: ANA,
        workedMinutes: 3,
        untrackedSessions: 1,
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

  test("the page and table say Published and Checked, never Submitted or Approved", () => {
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
    expect(table).toContain('"Published"');
    expect(table).toContain('"Checked"');
  });
});
