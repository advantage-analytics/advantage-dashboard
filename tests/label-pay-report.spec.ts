import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

import { getLabelPayReport } from "@/lib/data/practice-server";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * The label pay report (`/admin/labels/pay`, T39): a non-practice session is
 * paid once, on the UTC day it was first published, to whoever made its first
 * submission; it reads "checked" once an admin has passed it. Offline — the
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
  },
  reads: string[][] = [],
): AdminClient {
  const sessions: Row[] = tables.label_sessions.map((s) => ({ ...s }));
  const data: Record<string, Row[]> = {
    label_sessions: sessions,
    label_submissions: tables.label_submissions,
    users: tables.users,
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
        practiceSets: 0,
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

  test("practice sets still count by their first submission, never as hours", async () => {
    const result = await report({
      label_sessions: [
        session({ id: "p-in", kind: "practice", status: "submitted" }),
        session({ id: "p-before", kind: "practice", status: "submitted" }),
        session({ id: "p-open", kind: "practice", status: "labelling" }),
      ],
      label_submissions: [
        submission("p-in", ANA, "2026-11-03T09:00:00Z"),
        submission("p-before", ANA, "2026-10-28T09:00:00Z"),
        submission("p-open", ANA, "2026-11-04T09:00:00Z"),
      ],
      users,
    });

    expect(result.lines).toEqual([]);
    expect(result.rows).toEqual([
      expect.objectContaining({
        labellerId: ANA,
        practiceSets: 1,
        publishedSessions: 0,
        checkedSessions: 0,
      }),
    ]);
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
    expect(result.rows.find((r) => r.labellerId === BEN)).toMatchObject({
      practiceSets: 1,
    });
    for (const filters of reads) {
      expect(
        filters.includes("submitted_at gte") ||
          filters.includes("session_id in"),
        filters.join(", "),
      ).toBe(true);
    }
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
    expect(table).toContain("Published h");
    expect(table).toContain("Checked h");
  });
});
